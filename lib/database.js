import { HttpError } from './http.js';

export function createDatabase(settings, fetcher = fetch) {
  const base = settings.supabaseUrl;
  async function request(endpoint, { method = 'GET', body, headers = {} } = {}) {
    try {
      const response = await fetcher(`${base}/rest/v1/${endpoint}`, {
        method, headers: { apikey: settings.supabaseKey, Authorization: `Bearer ${settings.supabaseKey}`,
          'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000),
      });
      const data = method === 'HEAD' ? null : await response.json().catch(() => null);
      if (!response.ok) throw new HttpError(503, 'storage_unavailable', 'Não foi possível registrar o pedido agora. Tente novamente.');
      return data;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'storage_unavailable', 'O registro de pedidos está indisponível. Tente novamente.');
    }
  }
  const eq = value => encodeURIComponent(String(value));
  return {
    inquiryReady: async () => { await request('cvt_inquiries?select=id&limit=0', { method:'HEAD' }); return true; },
    async claimInquiry(value) {
      const rows = await request('cvt_inquiries?on_conflict=idempotency_key', {method:'POST',body:value,headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
      if (rows?.length) return rows[0];
      const existing = await request(`cvt_inquiries?idempotency_key=eq.${eq(value.idempotency_key)}&limit=1`);
      if (!existing?.[0]) throw new HttpError(503,'inquiry_unavailable','Não foi possível recuperar a solicitação.');
      return existing[0];
    },
    listInquiries: () => request('cvt_inquiries?select=id,reference,purpose,customer,items,details,status,created_at,updated_at&order=created_at.desc&limit=100'),
    async updateInquiry(id, status, expectedUpdatedAt) {
      const rows = await request(`cvt_inquiries?id=eq.${eq(id)}&updated_at=eq.${eq(expectedUpdatedAt)}`, {method:'PATCH',body:{status,updated_at:new Date().toISOString()},headers:{Prefer:'return=representation'}});
      return rows?.[0] || null;
    },
    async ready() {
      for (const table of ['cvt_orders', 'cvt_payments', 'cvt_artworks']) await request(`${table}?select=id&limit=0`, { method: 'HEAD' });
      return true;
    },
    async claim(order) {
      const rows = await request('cvt_orders?on_conflict=session_hash,idempotency_key', {
        method: 'POST', body: order, headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      });
      if (rows?.length) return { created: true, order: rows[0] };
      const existing = await request(`cvt_orders?session_hash=eq.${eq(order.session_hash)}&idempotency_key=eq.${eq(order.idempotency_key)}&limit=1`);
      if (!existing?.[0]) throw new HttpError(503, 'order_unavailable', 'Não foi possível recuperar o pedido.');
      return { created: false, order: existing[0] };
    },
    async findOrder(id, sessionHash) {
      const rows = await request(`cvt_orders?id=eq.${eq(id)}${sessionHash ? `&session_hash=eq.${eq(sessionHash)}` : ''}&limit=1`);
      return rows?.[0] || null;
    },
    async updateOrder(id, fields, filter = '') {
      const rows = await request(`cvt_orders?id=eq.${eq(id)}${filter}`, {
        method: 'PATCH', body: { ...fields, updated_at: new Date().toISOString() }, headers: { Prefer: 'return=representation' },
      });
      return rows?.[0] || null;
    },
    recordPayment: (id, payment) => request('rpc/cvt_record_payment', { method: 'POST', body: { p_order_id: id, p_payment: payment } }),
    async artwork(id, sessionHash, side) {
      const rows = await request(`cvt_artworks?id=eq.${eq(id)}&session_hash=eq.${eq(sessionHash)}&side=eq.${eq(side)}&limit=1`);
      return rows?.[0] || null;
    },
    addArtwork: value => request('cvt_artworks', { method: 'POST', body: value }),
    async uploadArtwork(objectPath, body, mime) {
      const response = await fetcher(`${base}/storage/v1/object/${encodeURIComponent(settings.artworkBucket)}/${objectPath}`, {
        method: 'POST', headers: { apikey: settings.supabaseKey, Authorization: `Bearer ${settings.supabaseKey}`, 'Content-Type': mime, 'x-upsert': 'false' },
        body, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new HttpError(503, 'upload_failed', 'Não foi possível enviar a arte. Tente novamente.');
    },
  };
}
