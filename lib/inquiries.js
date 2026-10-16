import { randomUUID } from 'node:crypto';
import { createDatabase } from './database.js';
import { hash, products } from './commerce.js';
import { readCatalog } from './catalog-repository.js';
import { localAdminAllowed } from './catalog-admin.js';
import { fail, HttpError, json, readBody } from './http.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) fail(400,'invalid_inquiry',`Confira ${label}.`);
  return value.trim();
};
export function validateInquiry(value, catalog) {
  if (!value || typeof value !== 'object' || !['quote','support'].includes(value.purpose) || value.consent !== true || value.website) fail(400,'invalid_inquiry','Confira os dados e a autorização de contato.');
  const customer = {
    name:text(value.customer?.name,120,'seu nome',true),
    email:text(value.customer?.email ?? '',254,'seu e-mail').toLowerCase(),
    phone:text(value.customer?.phone ?? '',30,'seu telefone').replace(/\D/g,''),
  };
  if ((!customer.email && !customer.phone) || (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) || (customer.phone && !/^\d{10,11}$/.test(customer.phone))) fail(400,'invalid_contact','Informe um e-mail válido ou celular com DDD para receber a resposta.');
  if (!Array.isArray(value.items) || value.items.length > 20 || (value.purpose === 'quote' && !value.items.length)) fail(400,'invalid_items','Escolha ao menos um produto para o orçamento.');
  const items = value.items.map(item => {
    const model = catalog.models.find(model => model.id === item?.productId);
    const title = model?.title || (Object.hasOwn(products,item?.productId ?? '') ? products[item.productId] : null);
    if (!title || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) fail(400,'invalid_items','Confira os produtos e as quantidades.');
    return { productId:item.productId,sku:model?.sku || null,title,quantity:item.quantity,
      unit:model && (model.unit || catalog.groups.find(group => group.id === model.familyId)?.unit) === 'kit' ? 'kit' : 'unit',
      configuration:text(item.configuration ?? '',2000,'os detalhes do produto') };
  });
  const details = {
    postalCode:text(value.details?.postalCode ?? '',9,'o CEP').replace(/\D/g,''),
    city:text(value.details?.city ?? '',160,'a cidade'),
    desiredDate:text(value.details?.desiredDate ?? '',10,'a data desejada'),
    installation:text(value.details?.installation ?? 'a-definir',30,'a instalação'),
    notes:text(value.details?.notes ?? '',3000,'a mensagem',value.purpose === 'support'),
  };
  if (details.postalCode && !/^\d{8}$/.test(details.postalCode)) fail(400,'invalid_postal_code','O CEP deve ter 8 dígitos.');
  if (details.desiredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(details.desiredDate) || !Number.isFinite(Date.parse(details.desiredDate+'T12:00:00Z')))) fail(400,'invalid_date','Confira a data desejada.');
  if (!['a-definir','necessaria','nao-necessaria'].includes(details.installation)) fail(400,'invalid_installation','Confira a necessidade de instalação.');
  return {purpose:value.purpose,customer,items,details};
}

export function createInquiries({root,settings,database=createDatabase(settings()),getCatalog=async () => (await readCatalog(root)).data,environment=process.env}) {
  const attempts = new Map();
  let checkedAt = 0, isReady = false;
  async function ready() {
    if (Date.now()-checkedAt > 15000) {
      isReady = !!settings().supabaseUrl && await database.inquiryReady().catch(() => false);
      checkedAt=Date.now();
    }
    return isReady;
  }
  function origin(req) {
    const host = req.headers.host || '';
    const allowed = settings().appUrl || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : '');
    if (!allowed || req.headers.origin !== allowed || req.headers['sec-fetch-site'] === 'cross-site') fail(403,'invalid_origin','Reabra a loja e tente novamente.');
  }
  return {ready,async handle(req,res,url) {
    if (url.pathname !== '/api/inquiries' && !url.pathname.startsWith('/api/admin/inquiries')) return false;
    try {
      if (url.pathname.startsWith('/api/admin/')) {
        if (!localAdminAllowed(req,settings(),environment)) fail(404,'not_found','Página não encontrada.');
        if (req.method === 'GET' && url.pathname === '/api/admin/inquiries') return json(res,200,{items:await database.listInquiries()});
        if (req.method === 'PATCH' && /^\/api\/admin\/inquiries\/[0-9a-f-]{36}$/i.test(url.pathname)) {
          if(req.headers.origin!==`http://${req.headers.host}`) fail(403,'invalid_origin','Use o painel local.');
          const value = await parse(req);
          if (!['new','reviewing','quoted','closed'].includes(value?.status) || typeof value?.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) fail(400,'invalid_status','Confira a situação da solicitação.');
          const item = await database.updateInquiry(url.pathname.split('/').pop(),value.status,value.updatedAt);
          if (!item) fail(409,'inquiry_changed','A solicitação mudou em outra janela. Recarregue a lista.');
          return json(res,200,{item});
        }
        fail(404,'not_found','Operação não encontrada.');
      }
      if (req.method !== 'POST') fail(405,'method_not_allowed','Método não permitido.');
      origin(req);
      const key = req.headers['idempotency-key'];
      if (!uuid(key)) fail(400,'invalid_key','Reabra o formulário para enviar a solicitação.');
      const now = Date.now();
      for (const [id,entry] of attempts) if (entry.expires <= now) attempts.delete(id);
      const id = req.socket.remoteAddress || 'unknown';
      const entry = attempts.get(id) || {count:0,expires:now+600000};
      if (++entry.count > 12 || attempts.size > 10000) fail(429,'rate_limit','Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
      attempts.set(id,entry);
      const value = validateInquiry(await parse(req),await getCatalog());
      if (!await ready()) fail(503,'inquiry_unavailable','O formulário está temporariamente indisponível. Seu rascunho foi mantido para tentar novamente.');
      const payloadHash = hash(value);
      const requestId = randomUUID();
      const row = await database.claimInquiry({id:requestId,reference:`UP-${requestId.slice(0,8).toUpperCase()}`,idempotency_key:key,payload_hash:payloadHash,...value});
      if (row.payload_hash !== payloadHash) fail(409,'inquiry_changed','Os dados mudaram. Revise e envie uma nova solicitação.');
      return json(res,200,{reference:row.reference,status:'received',message:'Solicitação registrada. Nenhum pedido ou pagamento foi criado.'});
    } catch(error) { return json(res,error instanceof HttpError ? error.status : 503,{code:error instanceof HttpError ? error.code : 'inquiry_unavailable',error:error instanceof HttpError ? error.message : 'Não foi possível registrar agora. Seu rascunho foi mantido.'}); }
  }};
}
async function parse(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'json_required','Envie JSON.');
  try { return JSON.parse((await readBody(req,32768)).toString('utf8')); }
  catch(error) { if (error instanceof HttpError) throw error; fail(400,'invalid_json','Dados inválidos.'); }
}
