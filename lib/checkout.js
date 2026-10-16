import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hash, priceBook, products, quoteOrder } from './commerce.js';
import { validAppUrl } from './settings.js';
import { createDatabase } from './database.js';
import { cents, createMercadoPago, validRedirect, verifyWebhook } from './mercado-pago.js';
import { fail, HttpError, json, readBody, readJson } from './http.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const publicOrder = order => ({ orderId: order.id, status: order.status, totalCents: Number(order.total_cents), currency: order.currency });

export function createCheckout({ root, settings, database = createDatabase(settings), mercado = createMercadoPago(settings), getBook = () => priceBook(root) }) {
  let readiness;
  let readinessExpires = 0;
  const sign = value => createHmac('sha256', settings.sessionSecret).update(value).digest('hex');
  function session(req, res, create = true) {
    if (settings.sessionSecret.length < 32) fail(503, 'session_unavailable', 'O pagamento online está temporariamente indisponível.');
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('cvt_guest='))?.slice(10);
    const parts = cookie?.split('.');
    let raw;
    if (parts?.length === 3 && /^[a-f0-9]{64}$/.test(parts[0]) && /^\d{13}$/.test(parts[1]) && /^[a-f0-9]{64}$/.test(parts[2])) {
      const value = `${parts[0]}.${parts[1]}`;
      if (Number(parts[1]) > Date.now() && timingSafeEqual(Buffer.from(sign(value), 'hex'), Buffer.from(parts[2], 'hex'))) raw = parts[0];
    }
    if (!raw && !create) fail(404, 'order_not_found', 'Pedido não encontrado nesta sessão.');
    if (!raw) {
      raw = randomBytes(32).toString('hex');
      const value = `${raw}.${Date.now() + 7 * 86400000}`;
      res.setHeader('Set-Cookie', `cvt_guest=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${settings.appUrl ? '; Secure' : ''}`);
    }
    return sign(`guest:${raw}`);
  }
  function sameOrigin(req) {
    const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
    const allowed = settings.appUrl || (localHost ? `http://${req.headers.host}` : '');
    if (!allowed || req.headers.origin !== allowed) fail(403, 'invalid_origin', 'Reabra a loja e tente novamente.');
    if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'invalid_origin', 'Reabra a loja e tente novamente.');
  }
  async function diagnostics() {
    const blockers = [];
    if (!settings.checkoutEnabled) blockers.push('checkout_disabled');
    if (!validAppUrl(settings.appUrl)) blockers.push('app_url_missing_or_invalid');
    if (!['test', 'production'].includes(settings.mpEnvironment)) blockers.push('invalid_environment');
    if (!settings.mpAccessToken) blockers.push('access_token_missing');
    if (!settings.mpWebhookSecret) blockers.push('webhook_secret_missing');
    if (settings.sessionSecret.length < 32) blockers.push('session_secret_missing');
    if (!settings.supabaseUrl || !settings.supabaseKey) blockers.push('database_configuration_missing');
    const book = getBook();
    if (!Object.entries(book.products || {}).some(([id, product]) => Object.hasOwn(products, id) && product.offers?.length)) blockers.push('approved_prices_missing');
    if (!book.fulfillmentOffers?.length) blockers.push('approved_fulfillment_missing');
    await Promise.all([
      settings.supabaseUrl && settings.supabaseKey ? database.ready().catch(() => blockers.push('database_schema_unavailable')) : null,
      settings.mpAccessToken ? mercado.account().then(account => {
        if (account.test !== (settings.mpEnvironment === 'test')) blockers.push('credential_environment_mismatch');
      }).catch(() => blockers.push('mercado_pago_authentication_failed')) : null,
    ]);
    return { ready: blockers.length === 0, blockers };
  }
  async function ready() {
    if (!readiness || Date.now() >= readinessExpires) {
      readiness = diagnostics();
      readinessExpires = Date.now() + 30000;
    }
    return readiness;
  }
  async function requireReady() {
    if (!(await ready()).ready) fail(503, 'checkout_unavailable', 'O pagamento online está temporariamente indisponível. Seu carrinho foi mantido.');
  }
  async function checkArtworks(quote, sessionHash) {
    for (const item of quote.items) {
      if (item.configuration.artworkMode !== 'ready') continue;
      for (const side of item.configuration.sides === 'both' ? ['front', 'back'] : ['front']) {
        const fileId = item.configuration.artwork?.[side]?.fileId;
        if (!uuid(fileId) || !await database.artwork(fileId, sessionHash, side)) fail(409, 'artwork_missing', 'Envie a arte pelo personalizador antes de continuar.');
      }
    }
  }
  async function savePreference(order, preference, account) {
    const redirect = settings.mpEnvironment === 'test' ? preference?.sandbox_init_point : preference?.init_point;
    if (!preference?.id || preference.external_reference !== order.id || String(preference.collector_id) !== account.id || !validRedirect(redirect)) {
      fail(502, 'invalid_preference', 'Não foi possível conferir a etapa de pagamento. Seu carrinho foi mantido.');
    }
    await database.updateOrder(order.id, { preference_id: String(preference.id), redirect_url: redirect });
    await database.updateOrder(order.id, { status: 'pending' }, '&status=in.(creating,setup_unknown,setup_failed)');
    return { orderId: order.id, redirectUrl: redirect };
  }
  async function submit(req, res) {
    sameOrigin(req);
    await requireReady();
    const payload = await readJson(req);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, 'invalid_order', 'Confira os dados do pedido.');
    if (payload.consent !== true) fail(400, 'consent_required', 'Confirme os dados do pedido antes de continuar.');
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) fail(400, 'invalid_idempotency_key', 'Reabra o checkout e tente novamente.');
    const sessionHash = session(req, res, false);
    const snapshot = quoteOrder(payload, getBook());
    if (payload.checkoutQuote?.priceVersion !== snapshot.priceVersion || payload.checkoutQuote?.totalCents !== snapshot.totalCents || payload.checkoutQuote?.quoteHash !== hash(snapshot)) {
      fail(409, 'quote_changed', 'Confira novamente a entrega e o total do pedido antes de pagar.');
    }
    await checkArtworks(snapshot, sessionHash);
    const payloadHash = hash(snapshot);
    const account = await mercado.account();
    const claimed = await database.claim({ id: randomUUID(), session_hash: sessionHash, idempotency_key: key, payload_hash: payloadHash,
      snapshot, total_cents: snapshot.totalCents, currency: 'BRL', live_mode: settings.mpEnvironment === 'production', status: 'creating' });
    const order = claimed.order;
    if (order.payload_hash !== payloadHash) fail(409, 'idempotency_conflict', 'Os dados deste pedido mudaram. Confira o carrinho novamente.');
    if (!claimed.created) {
      if (Date.now() - Date.parse(order.created_at) >= 30 * 60000 && !['paid','refunded','partially_refunded','charged_back'].includes(order.status)) fail(409, 'checkout_expired', 'A etapa de pagamento expirou. Tente novamente para atualizar o pedido.');
      if (order.status === 'paid') return json(res, 200, { orderId: order.id, redirectUrl: `${settings.appUrl}/checkout.html?order=${order.id}` });
      if (order.redirect_url && ['pending', 'rejected'].includes(order.status) && validRedirect(order.redirect_url)) return json(res, 200, { orderId: order.id, redirectUrl: order.redirect_url });
      if (['creating', 'setup_unknown'].includes(order.status)) {
        const matches = await mercado.findPreference(order.id);
        if (matches.length === 1) return json(res, 200, await savePreference(order, matches[0], account));
      }
      fail(409, 'order_processing', 'O pedido já foi registrado e está sendo conferido. Aguarde antes de tentar novamente.');
    }
    const backUrl = `${settings.appUrl}/checkout.html?order=${order.id}`;
    const preference = {
      external_reference: order.id,
      items: snapshot.items.map(item => ({ id: item.lineId, title: `${item.quantity} × ${item.title}`, quantity: 1,
        currency_id: 'BRL', unit_price: item.totalCents / 100 })),
      payer: { name: snapshot.customer.name, email: snapshot.customer.email },
      back_urls: { success: backUrl, pending: backUrl, failure: backUrl }, auto_return: 'approved',
      notification_url: `${settings.appUrl}/api/webhooks/mercado-pago?source_news=webhooks`,
      expires: true, expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
      metadata: { store_order_id: order.id },
    };
    if (snapshot.delivery.totalCents > 0) preference.items.push({ id: 'delivery', title: snapshot.delivery.label,
      quantity: 1, currency_id: 'BRL', unit_price: snapshot.delivery.totalCents / 100 });
    try {
      const created = await mercado.createPreference(preference);
      return json(res, 201, await savePreference(order, created, account));
    } catch (error) {
      await database.updateOrder(order.id, { status: error.code === 'provider_rejected' ? 'setup_failed' : 'setup_unknown' }, '&status=eq.creating').catch(() => {});
      throw error;
    }
  }
  async function recordPayment(payment, account) {
    if (!payment || !/^[0-9]+$/.test(String(payment.id)) || !uuid(payment.external_reference)) return;
    const order = await database.findOrder(payment.external_reference);
    if (!order) return; // A payment from another application/account workflow is unrelated.
    const amount = cents(payment.transaction_amount);
    const refunded = cents(payment.transaction_amount_refunded ?? 0);
    const updated = Date.parse(payment.date_last_updated);
    if (String(payment.collector_id) !== account.id || payment.currency_id !== 'BRL' || payment.live_mode !== order.live_mode
      || amount === null || amount <= 0 || amount > Number(order.total_cents) || refunded === null || refunded > amount
      || (payment.status === 'refunded' && refunded !== amount) || !Number.isFinite(updated)
      || !['approved','pending','in_process','authorized','in_mediation','rejected','cancelled','refunded','charged_back'].includes(payment.status)) {
      fail(409, 'payment_mismatch', 'O pagamento exige conferência.');
    }
    await database.recordPayment(order.id, { id: String(payment.id), status: payment.status, amountCents: amount,
      refundedCents: refunded, updatedAt: new Date(updated).toISOString() });
  }
  async function webhook(req, res, url) {
    // Signature uses the query data.id, not an untrusted body field or URL.
    const id = verifyWebhook(req.headers, url, settings.mpWebhookSecret);
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_notification', 'Notificação inválida.');
    if (body.data?.id != null && String(body.data.id).toLowerCase() !== id.toLowerCase()) fail(400, 'notification_mismatch', 'Notificação inválida.');
    const type = body.type || url.searchParams.get('type');
    if (!['payment', 'merchant_order', 'topic_merchant_order_wh'].includes(type)) return json(res, 200, { received: true });
    if (!/^\d+$/.test(id)) fail(400, 'invalid_payment_id', 'Notificação inválida.');
    if (type === 'payment') {
      const [account, payment] = await Promise.all([mercado.account(), mercado.payment(id)]);
      if (String(payment?.id) !== id) fail(409, 'payment_mismatch', 'Notificação inválida.');
      await recordPayment(payment, account);
    } else {
      const [account, merchantOrder] = await Promise.all([mercado.account(), mercado.merchantOrder(id)]);
      if (String(merchantOrder?.id) !== id || String(merchantOrder.collector?.id) !== account.id) fail(409, 'payment_mismatch', 'Notificação inválida.');
      const payments = merchantOrder.payments || [];
      if (payments.length > 20) fail(503, 'payment_review_required', 'O pedido exige conferência.');
      const resources = await Promise.all(payments.map(payment => mercado.payment(String(payment.id))));
      for (const payment of resources) await recordPayment(payment, account);
    }
    // ACK only after durable state is saved. Any temporary failure returns non-2xx for retry.
    return json(res, 200, { received: true });
  }
  async function upload(req, res, url) {
    sameOrigin(req);
    if (!settings.supabaseUrl || !settings.supabaseKey) fail(503, 'upload_unavailable', 'O envio de arte está temporariamente indisponível.');
    const sessionHash = session(req, res);
    const side = url.searchParams.get('side');
    if (!['front', 'back'].includes(side)) fail(400, 'invalid_side', 'Indique a frente ou o verso da arte.');
    const mime = req.headers['content-type']?.split(';')[0];
    const extensions = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
    if (!extensions[mime]) fail(415, 'invalid_artwork_type', 'Envie a arte em PDF, PNG ou JPEG.');
    const bytes = await readBody(req, 15 * 1024 * 1024);
    const valid = mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
      : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) fail(400, 'invalid_artwork_content', 'O conteúdo do arquivo não corresponde ao formato informado.');
    const id = randomUUID();
    const objectPath = `${sessionHash}/${id}.${extensions[mime]}`;
    await database.uploadArtwork(objectPath, bytes, mime);
    await database.addArtwork({ id, session_hash: sessionHash, side, object_path: objectPath, mime_type: mime, size_bytes: bytes.length });
    return json(res, 201, { fileId: id });
  }
  async function handle(req, res, url) {
    const known = ['/api/checkout/status', '/api/checkout/quote', '/api/checkout', '/api/orders', '/api/artworks', '/api/webhooks/mercado-pago'];
    const orderMatch = url.pathname.match(/^\/api\/orders\/([a-f0-9-]{36})$/i);
    if (!known.includes(url.pathname) && !orderMatch) return false;
    try {
      if (url.pathname === '/api/checkout/status' && req.method === 'GET') {
        if (settings.sessionSecret.length >= 32) session(req, res);
        return json(res, 200, { ready: (await ready()).ready });
      }
      if (orderMatch && req.method === 'GET') {
        if (!uuid(orderMatch[1])) fail(404, 'order_not_found', 'Pedido não encontrado.');
        const order = await database.findOrder(orderMatch[1], session(req, res, false));
        if (!order) fail(404, 'order_not_found', 'Pedido não encontrado nesta sessão.');
        return json(res, 200, publicOrder(order));
      }
      if (url.pathname === '/api/checkout/quote' && req.method === 'POST') {
        sameOrigin(req);
        const quote = quoteOrder(await readJson(req), getBook());
        return json(res, 200, { productsCents: quote.productsCents, delivery: quote.delivery, totalCents: quote.totalCents, currency: 'BRL', priceVersion: quote.priceVersion, quoteHash: hash(quote) });
      }
      if (['/api/checkout', '/api/orders'].includes(url.pathname) && req.method === 'POST') return await submit(req, res);
      if (url.pathname === '/api/webhooks/mercado-pago' && req.method === 'POST') return await webhook(req, res, url);
      if (url.pathname === '/api/artworks' && req.method === 'POST') return await upload(req, res, url);
      res.setHeader('Allow', orderMatch || url.pathname.endsWith('/status') ? 'GET' : 'POST');
      return json(res, 405, { error: 'Método não permitido.' });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Checkout request failed', { path: url.pathname, name: error.name });
      return json(res, error instanceof HttpError ? error.status : 503, { code: error.code || 'checkout_error',
        error: error instanceof HttpError ? error.message : 'Não foi possível concluir esta etapa. Tente novamente.' });
    } finally { /* Private credentials and raw customer payloads never enter logs. */ }
  }
  return { handle, diagnostics };
}
