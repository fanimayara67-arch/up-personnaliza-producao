import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, fail } from './http.js';

export function verifyWebhook(headers, url, secret, now = Date.now()) {
  const id = url.searchParams.get('data.id');
  const requestId = headers['x-request-id'];
  const parts = String(headers['x-signature'] || '').split(',').map(part => part.trim().split('='));
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  const timestamps = parts.filter(([key]) => key === 'ts').map(([, value]) => value);
  const ts = timestamps[0];
  if (!secret || !id || !/^[a-zA-Z0-9-]{1,100}$/.test(id) || !requestId || !/^[a-zA-Z0-9-]{1,120}$/.test(requestId)
    || timestamps.length !== 1 || !/^\d{10,13}$/.test(ts || '') || !signatures.length) fail(401, 'invalid_signature', 'Notificação inválida.');
  const millis = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(now - millis) > 300000) fail(401, 'expired_signature', 'Notificação expirada.');
  const expected = createHmac('sha256', secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest();
  const valid = signatures.some(signature => /^[a-f0-9]{64}$/i.test(signature || '') && timingSafeEqual(expected, Buffer.from(signature, 'hex')));
  if (!valid) fail(401, 'invalid_signature', 'Notificação inválida.');
  return id;
}
export function cents(amount) {
  const match = String(amount).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}
export function validRedirect(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && ['www.mercadopago.com.br', 'sandbox.mercadopago.com.br', 'www.mercadopago.com', 'sandbox.mercadopago.com'].includes(url.hostname);
  } catch { return false; }
}
export function createMercadoPago(settings, fetcher = fetch) {
  let accountPromise;
  async function request(endpoint, body, origin = 'https://api.mercadopago.com') {
    let response;
    try {
      response = await fetcher(origin + endpoint, { method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${settings.mpAccessToken}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000), redirect: 'error' });
    } catch { throw new HttpError(503, 'provider_timeout', 'O Mercado Pago não respondeu a tempo. Seu pedido será conferido antes de uma nova tentativa.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new HttpError(502, response.status >= 500 ? 'provider_unknown' : 'provider_rejected', 'Não foi possível abrir o Mercado Pago. Seu carrinho foi mantido.');
    return data;
  }
  return {
    async account() {
      if (!accountPromise) accountPromise = request('/users/me', null, 'https://api.mercadolibre.com').then(account => {
        if (!account?.id || account.site_id !== 'MLB' || !Array.isArray(account.tags)) throw new HttpError(503, 'invalid_account', 'O pagamento online está temporariamente indisponível.');
        return { id: String(account.id), test: account.tags.includes('test_user') };
      }).catch(error => { accountPromise = null; throw error; });
      return accountPromise;
    },
    createPreference: body => request('/checkout/preferences', body),
    async findPreference(orderId) {
      const data = await request(`/checkout/preferences/search?external_reference=${encodeURIComponent(orderId)}`);
      const results = data?.elements || data?.results || [];
      return results.filter(preference => preference.external_reference === orderId);
    },
    payment: id => request(`/v1/payments/${encodeURIComponent(id)}`),
    merchantOrder: id => request(`/merchant_orders/${encodeURIComponent(id)}`),
  };
}
