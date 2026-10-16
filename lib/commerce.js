import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fail } from './http.js';

export const products = {
  fachada: 'Fachadas e letreiros', adesivo: 'Adesivos para ambientes',
  luminoso: 'Letreiros luminosos', impressao: 'Impressão em grande formato', sinalizacao: 'Sinalização de espaços',
};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function priceBook(root) {
  try {
    const content = fs.readFileSync(path.join(root, 'commerce.json'), 'utf8');
    return { ...JSON.parse(content), version: hash(content) };
  } catch { return { currency: 'BRL', products: {}, fulfillmentOffers: [] }; }
}
export function resolvePrice(payload, book) {
  if (!Object.hasOwn(products, payload.productId)) return { status: 'unavailable' };
  const product = book.products?.[payload.productId];
  if (book.currency !== 'BRL' || !product || !Array.isArray(product.fields) || !Array.isArray(product.offers) || !isObject(payload.configuration)) return { status: 'unavailable' };
  if (!product.fields.length || new Set(product.fields).size !== product.fields.length || !product.fields.every(field => typeof field === 'string' && field.length > 0)) return { status: 'unavailable' };
  const matches = product.offers.filter(offer => offer.quantity === payload.quantity && isObject(offer.configuration)
    && Object.keys(offer.configuration).length === product.fields.length
    && product.fields.every(field => Object.hasOwn(offer.configuration, field) && Object.hasOwn(payload.configuration, field) && canonical(offer.configuration[field]) === canonical(payload.configuration[field])));
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].totalCents) || matches[0].totalCents <= 0) return { status: 'unavailable' };
  return { status: 'available', currency: 'BRL', totalCents: matches[0].totalCents, priceVersion: book.version };
}

function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'invalid_order', 'Confira os dados e a personalização do pedido.');
  return value.trim();
}
function configuration(id, value) {
  if (!isObject(value) || JSON.stringify(value).length > 20000) fail(400, 'invalid_configuration', 'Confira a personalização dos produtos.');
  if (!['widthCm', 'heightCm'].every(key => Number.isFinite(value[key]) && value[key] > 0 && value[key] <= 100000)) {
    fail(400, 'invalid_configuration', 'Confira as medidas dos produtos.');
  }
  return value;
}
export function quoteOrder(payload, book, { checkVersion = true } = {}) {
  if (!isObject(payload) || payload.currency !== 'BRL' || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 30) fail(400, 'invalid_order', 'Confira os itens do pedido.');
  const customer = payload.customer;
  const address = payload.address;
  if (!isObject(customer) || !isObject(address)) fail(400, 'invalid_customer', 'Preencha os dados de contato e entrega.');
  const normalized = {
    customer: { name: text(customer.name, 120), email: text(customer.email, 254).toLowerCase(), phone: text(customer.phone, 16).replace(/\D/g, '') },
    address: Object.fromEntries(['cep', 'street', 'number', 'complement', 'district', 'city', 'state'].map(key => [key, text(address[key] ?? '', key === 'complement' ? 120 : 160, key !== 'complement')])),
    paymentPreference: payload.paymentPreference,
    projectNotes: text(payload.projectNotes ?? '', 3000, false), currency: 'BRL',
  };
  normalized.address.cep = normalized.address.cep.replace(/\D/g, '');
  normalized.address.state = normalized.address.state.toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.customer.email) || !/^\d{10,11}$/.test(normalized.customer.phone)
    || !/^\d{8}$/.test(normalized.address.cep) || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(normalized.address.state)
    || !['pix', 'card', 'boleto'].includes(normalized.paymentPreference)) fail(400, 'invalid_customer', 'Confira o e-mail, telefone, CEP e estado.');
  const lineIds = new Set();
  normalized.items = payload.items.map(item => {
    if (!isObject(item) || !Object.hasOwn(products, item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99
      || typeof item.lineId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.lineId) || lineIds.has(item.lineId)) fail(400, 'invalid_items', 'Confira os itens do carrinho.');
    lineIds.add(item.lineId);
    const config = configuration(item.productId, item.configuration);
    const price = resolvePrice(item, book);
    if (price.status !== 'available') fail(409, 'price_unavailable', 'Há produtos sem preço aprovado para esta configuração.');
    if (checkVersion && item.priceVersion !== book.version) fail(409, 'price_changed', 'A tabela de preços mudou. Confira o carrinho novamente.');
    const installation = ['fachada', 'adesivo', 'luminoso', 'sinalizacao'].includes(item.productId) ? item.brief?.installation || 'a-definir' : 'nao-necessaria';
    if (!['a-definir', 'necessaria', 'nao-necessaria'].includes(installation)) fail(400, 'invalid_installation', 'Confira a opção de instalação.');
    const brief = Object.fromEntries(['application', 'measurements', 'notes'].map(key => [key, text(item.brief?.[key] ?? '', 1000, false)]));
    brief.installation = installation;
    return { productId: item.productId, lineId: item.lineId, quantity: item.quantity, configuration: config, installation, brief,
      title: products[item.productId], totalCents: price.totalCents,
      commercialConfiguration: Object.fromEntries(book.products[item.productId].fields.map(field => [field, config[field]])),
    };
  });
  const signature = items => items.map(item => canonical({ productId: item.productId, quantity: item.quantity,
    configuration: item.commercialConfiguration || item.configuration, installation: item.installation })).sort();
  const deliveries = (Array.isArray(book.fulfillmentOffers) ? book.fulfillmentOffers : []).filter(offer => offer.postalCode === normalized.address.cep
    && Array.isArray(offer.items) && canonical(signature(offer.items)) === canonical(signature(normalized.items)));
  if (deliveries.length !== 1 || !Number.isSafeInteger(deliveries[0].totalCents) || deliveries[0].totalCents < 0 || typeof deliveries[0].label !== 'string' || !deliveries[0].label.trim()) {
    fail(409, 'delivery_unavailable', 'As condições de entrega ou instalação ainda precisam ser confirmadas para este pedido.');
  }
  normalized.productsCents = normalized.items.reduce((sum, item) => sum + item.totalCents, 0);
  normalized.delivery = { totalCents: deliveries[0].totalCents, label: deliveries[0].label.trim().slice(0, 160) };
  normalized.totalCents = normalized.productsCents + normalized.delivery.totalCents;
  if (!Number.isSafeInteger(normalized.totalCents) || normalized.totalCents <= 0 || normalized.totalCents > 100000000) fail(409, 'invalid_total', 'O valor do pedido precisa ser conferido pela loja.');
  normalized.priceVersion = book.version;
  return normalized;
}
