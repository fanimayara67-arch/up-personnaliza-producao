import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { createCheckout } from '../lib/checkout.js';
import { canonical, hash, quoteOrder, resolvePrice } from '../lib/commerce.js';
import { cents, verifyWebhook } from '../lib/mercado-pago.js';
import { HttpError } from '../lib/http.js';

// These prices and delivery terms exist only in this isolated fixture.
const configuration = { widthCm: 30, heightCm: 20, application: 'Arte de teste', notes: '' };
const book = { currency: 'BRL', version: 'fixture-version', products: { impressao: {
  fields: ['widthCm','heightCm'], offers: [{ quantity: 3, configuration: { widthCm: 30, heightCm: 20 }, totalCents: 10001 }],
} }, fulfillmentOffers: [{ postalCode: '01001000', totalCents: 999, label: 'Entrega aprovada de teste',
  items: [{ productId: 'impressao', quantity: 3, configuration: { widthCm: 30, heightCm: 20 }, installation: 'nao-necessaria' }],
}] };
const payload = () => ({ currency: 'BRL', customer: { name: 'Cliente de teste', email: 'cliente@example.test', phone: '11999999999' },
  address: { cep: '01001000', street: 'Praça de teste', number: '1', complement: '', district: 'Centro', city: 'São Paulo', state: 'SP' },
  items: [{ productId: 'impressao', lineId: 'test-line', quantity: 3, configuration: structuredClone(configuration), priceVersion: book.version }],
  paymentPreference: 'pix', projectNotes: '', consent: true,
  checkoutQuote: { priceVersion: book.version, totalCents: 11000 },
});

test('a discontinued product cannot be quoted even if an old price book still contains its offer', async t => {
  const stale = structuredClone(book);
  stale.products.cartoes = structuredClone(book.products.impressao);
  const value = payload(); value.items[0].productId = 'cartoes';
  assert.equal(resolvePrice(value.items[0],stale).status,'unavailable');
  assert.throws(() => quoteOrder(value,stale),error => error.code === 'invalid_items');
  const h = await harness(t,{book:stale});
  const response = await h.request('/api/checkout/quote',value);
  assert.equal(response.status,400); assert.equal(response.body.code,'invalid_items');
  assert.equal(h.orders.size,0); assert.equal(h.calls.length,0);
});

async function harness(t, overrides = {}) {
  const orders = new Map();
  const payments = [];
  const artworks = new Map();
  const calls = [];
  const settings = { checkoutEnabled: true, appUrl: 'https://shop.example.test', mpEnvironment: 'test',
    mpAccessToken: 'secret-token-fixture', mpWebhookSecret: 'secret-webhook-fixture', sessionSecret: 'a'.repeat(64),
    supabaseUrl: 'https://database.example.test', supabaseKey: 'secret-db-fixture', artworkBucket: 'artworks', ...overrides.settings };
  const database = {
    async ready() { return true; },
    async claim(value) {
      const existing = [...orders.values()].find(order => order.session_hash === value.session_hash && order.idempotency_key === value.idempotency_key);
      if (existing) return { created: false, order: structuredClone(existing) };
      const order = { ...structuredClone(value), created_at: new Date().toISOString() };
      orders.set(order.id, order);
      return { created: true, order: structuredClone(order) };
    },
    async findOrder(id, sessionHash) {
      const order = orders.get(id);
      return order && (!sessionHash || order.session_hash === sessionHash) ? structuredClone(order) : null;
    },
    async updateOrder(id, fields, filter = '') {
      const order = orders.get(id);
      if (filter === '&status=eq.creating' && order.status !== 'creating') return null;
      if (filter.startsWith('&status=in.') && !['creating','setup_unknown','setup_failed'].includes(order.status)) return null;
      Object.assign(order, fields);
      return order;
    },
    async recordPayment(id, payment) {
      payments.push({ orderId: id, ...payment });
      if (payment.status === 'approved' && payment.amountCents === orders.get(id).total_cents) orders.get(id).status = 'paid';
    },
    async artwork(id, sessionHash, side) { const row = artworks.get(id); return row?.session_hash === sessionHash && row.side === side ? row : null; },
    async uploadArtwork(objectPath, bytes, mime) { calls.push({ upload: true, objectPath, size: bytes.length, mime }); },
    async addArtwork(value) { artworks.set(value.id, value); },
    ...overrides.database,
  };
  let payment;
  const preference = orderId => ({ id: `42-${randomUUID()}`, collector_id: 42, external_reference: orderId,
    sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/start?pref_id=test', init_point: 'https://www.mercadopago.com.br/checkout/start?pref_id=test' });
  const mercado = {
    async account() { return { id: '42', test: true }; },
    async createPreference(value) { calls.push(value); return preference(value.external_reference); },
    async findPreference() { return []; },
    async payment() { return payment; },
    ...overrides.mercado,
  };
  const checkout = createCheckout({ settings, database, mercado, getBook: () => overrides.book || book });
  const server = http.createServer(async (req, res) => {
    if (await checkout.handle(req, res, new URL(req.url, 'http://localhost')) === false) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + '/api/checkout/status');
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const readiness = await initial.json();
  async function request(endpoint, value, headers = {}, method = value === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + endpoint, { method, headers: { Cookie: cookie, Origin: settings.appUrl,
      'Content-Type': 'application/json', ...headers }, body: value === undefined ? undefined : typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const submit = (value = payload(), key = 'test-idempotency-0001') => {
    if (!value.checkoutQuote.quoteHash) value.checkoutQuote.quoteHash = hash(quoteOrder(value, overrides.book || book));
    return request('/api/checkout', value, { 'Idempotency-Key': key });
  };
  const notify = (id = '123', changes = {}) => {
    const ts = String(Date.now());
    const requestId = randomUUID();
    const signature = createHmac('sha256', settings.mpWebhookSecret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
    return request(`/api/webhooks/mercado-pago?data.id=${id}`, { type: 'payment', data: { id }, ...changes },
      { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` });
  };
  return { request, submit, notify, calls, orders, payments, artworks, readiness, settings, preference,
    setPayment: value => { payment = value; }, diagnostics: checkout.diagnostics };
}

test('server pricing ignores browser totals and preserves a non-divisible lot total', () => {
  const value = payload();
  value.totalCents = 1;
  value.items[0].totalCents = 1;
  assert.equal(quoteOrder(value, book).totalCents, 11000);
  assert.equal(resolvePrice(value.items[0], book).totalCents, 10001);
  assert.equal(cents('100.01'), 10001);
  assert.equal(cents('100.001'), null);
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
});
test('unapproved prices, stale versions, delivery and malformed products are rejected', () => {
  const value = payload();
  value.items[0].configuration.widthCm = 31;
  assert.throws(() => quoteOrder(value, book), { code: 'price_unavailable' });
  value.items[0].configuration.widthCm = 30;
  value.items[0].priceVersion = 'stale';
  assert.throws(() => quoteOrder(value, book), { code: 'price_changed' });
  value.items[0].priceVersion = book.version;
  value.address.cep = '99999999';
  assert.throws(() => quoteOrder(value, book), { code: 'delivery_unavailable' });
  value.items[0].productId = '__proto__';
  assert.throws(() => quoteOrder(value, book), { code: 'invalid_items' });
});
test('order exists before preference creation; retries reuse one order and one preference', async t => {
  const h = await harness(t);
  const first = await h.submit();
  assert.equal(first.status, 201);
  assert.equal(h.orders.size, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].items[0].quantity, 1);
  assert.equal(h.calls[0].items[0].unit_price, 100.01);
  assert.equal(h.calls[0].items[1].unit_price, 9.99);
  assert.equal(h.calls[0].external_reference, first.body.orderId);
  assert.match(h.calls[0].notification_url, /^https:\/\/shop.example.test\/api\/webhooks\//);
  assert.deepEqual((await h.submit()).body, first.body);
  assert.equal(h.calls.length, 1);
  const changed = payload(); changed.projectNotes = 'Alterado';
  assert.equal((await h.submit(changed)).body.code, 'idempotency_conflict');
});
test('concurrent clicks cannot create two payment preferences', async t => {
  let creations = 0;
  const h = await harness(t, { mercado: { async createPreference(body) {
    creations++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return h.preference(body.external_reference);
  } } });
  const results = await Promise.all([h.submit(), h.submit()]);
  assert.equal(creations, 1);
  assert.equal(h.orders.size, 1);
  assert.ok(results.some(result => result.status === 201));
  assert.ok(results.every(result => [200,201,409].includes(result.status)));
});
test('timeout recovery searches the existing preference and does not create another', async t => {
  let creations = 0;
  let orderId;
  const h = await harness(t, { mercado: {
    async createPreference(body) { creations++; orderId = body.external_reference; throw new HttpError(503, 'provider_timeout', 'Timeout'); },
    async findPreference(id) { assert.equal(id, orderId); return [h.preference(id)]; },
  } });
  assert.equal((await h.submit()).status, 503);
  assert.equal([...h.orders.values()][0].status, 'setup_unknown');
  assert.equal((await h.submit()).status, 200);
  assert.equal(creations, 1);
});
test('origin, consent and reviewed total are checked before recording a new order', async t => {
  const h = await harness(t);
  assert.equal((await h.request('/api/checkout', payload(), { Origin: 'https://other.example.test' })).status, 403);
  const value = payload(); value.consent = false;
  assert.equal((await h.submit(value)).body.code, 'consent_required');
  value.consent = true; value.checkoutQuote.totalCents = 1;
  assert.equal((await h.submit(value)).body.code, 'quote_changed');
  assert.equal(h.orders.size, 0);
});
test('test/production mismatch blocks purchases and public status contains no secrets', async t => {
  const h = await harness(t, { settings: { mpEnvironment: 'production' } });
  assert.deepEqual(h.readiness, { ready: false });
  assert.ok((await h.diagnostics()).blockers.includes('credential_environment_mismatch'));
  assert.equal((await h.submit()).status, 503);
  assert.equal(h.calls.length, 0);
});
test('signed notifications fetch authoritative payment; wrong collector/currency/mode/amount are rejected', async t => {
  const h = await harness(t);
  const created = await h.submit();
  const valid = { id: 123, external_reference: created.body.orderId, collector_id: 42, currency_id: 'BRL', live_mode: false,
    transaction_amount: 110, transaction_amount_refunded: 0, date_last_updated: new Date().toISOString(), status: 'approved' };
  for (const changes of [{ collector_id: 99 }, { currency_id: 'USD' }, { live_mode: true }, { transaction_amount: 111 }, { status: 'refunded', transaction_amount_refunded: 0 }]) {
    h.setPayment({ ...valid, ...changes });
    assert.equal((await h.notify()).status, 409);
  }
  assert.equal(h.payments.length, 0);
  h.setPayment(valid);
  assert.equal((await h.notify()).status, 200);
  const status = await h.request(`/api/orders/${created.body.orderId}?status=rejected`);
  assert.equal(status.body.status, 'paid');
  assert.deepEqual(Object.keys(status.body).sort(), ['currency','orderId','status','totalCents']);
  assert.equal((await h.request(`/api/orders/${created.body.orderId}`, undefined, { Cookie: '' })).status, 404);
});
test('forged, old and mismatched webhook signatures are rejected', async t => {
  const h = await harness(t);
  assert.equal((await h.request('/api/webhooks/mercado-pago?data.id=123', { type: 'payment' })).status, 401);
  assert.equal((await h.notify('123', { data: { id: '456' } })).status, 400);
  const ts = String(Date.now() - 600000);
  assert.throws(() => verifyWebhook({ 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': 'request' },
    new URL('https://shop.example.test?data.id=123'), 'secret'), { code: 'expired_signature' });
});
test('database failure returns non-2xx so the provider can retry a valid webhook', async t => {
  const h = await harness(t, { database: { async recordPayment() { throw new HttpError(503, 'storage_unavailable', 'Unavailable'); } } });
  const order = await h.submit();
  h.setPayment({ id: 123, external_reference: order.body.orderId, collector_id: 42, currency_id: 'BRL', live_mode: false,
    transaction_amount: 110, transaction_amount_refunded: 0, date_last_updated: new Date().toISOString(), status: 'approved' });
  assert.equal((await h.notify()).status, 503);
  assert.equal([...h.orders.values()][0].status, 'pending');
});
test('artwork upload checks format and ownership and does not publish an object URL', async t => {
  const h = await harness(t);
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const result = await h.request('/api/artworks?side=front', bytes, { 'Content-Type': 'image/png' });
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body), ['fileId']);
  assert.ok(h.artworks.has(result.body.fileId));
  assert.equal((await h.request('/api/artworks?side=front', bytes, { 'Content-Type': 'application/pdf' })).status, 400);
  assert.equal((await h.request('/api/artworks?side=front', '<svg/>', { 'Content-Type': 'image/svg+xml' })).status, 415);
});
test('changed address requires a new reviewed quote even when the total stays the same', async t => {
  const h = await harness(t);
  const value = payload();
  value.checkoutQuote.quoteHash = hash(quoteOrder(value, book));
  value.address.number = '2';
  assert.equal((await h.submit(value)).body.code, 'quote_changed');
  assert.equal(h.orders.size, 0);
});
test('a declined payment can reopen its existing preference without duplicating the order', async t => {
  const h = await harness(t);
  const created = await h.submit();
  h.orders.get(created.body.orderId).status = 'rejected';
  assert.equal((await h.submit()).status, 200);
  assert.equal(h.calls.length, 1);
});
test('untrusted provider redirect is rejected and malformed JSON payload stays a client error', async t => {
  const h = await harness(t, { mercado: { async createPreference(value) {
    return { ...h.preference(value.external_reference), sandbox_init_point: 'https://attacker.example.test/' };
  } } });
  assert.equal((await h.submit()).body.code, 'invalid_preference');
  assert.equal([...h.orders.values()][0].status, 'setup_unknown');
  assert.equal((await h.request('/api/checkout', 'null', { 'Idempotency-Key': 'test-null-request' })).status, 400);
});
