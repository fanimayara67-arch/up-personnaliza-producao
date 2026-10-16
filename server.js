import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from './lib/settings.js';
import { priceBook, products, resolvePrice } from './lib/commerce.js';
import { createCheckout } from './lib/checkout.js';
import { createCatalogAdmin } from './lib/catalog-admin.js';
import { createInquiries } from './lib/inquiries.js';
import { createStorefront } from './lib/storefront.js';
import { createProduction } from './production/router.js';
import { productionConfig } from './production/config.js';

const root = process.cwd();
const publicDir = path.join(root, 'public');

function settings() {
  return loadSettings(root);
}
const checkout = createCheckout({ root, settings: settings() });
const catalogAdmin = createCatalogAdmin({ root, settings });
const inquiries = createInquiries({ root, settings });
const storefront = createStorefront({root,settings,inquiries});
const production = createProduction({root,config:productionConfig(root)});

const cache = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png'
};
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

// Exact commercial offers only: no inferred area rates, multipliers or sample prices.
const productIds = new Set(Object.keys(products));

export async function handleApplication(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const current = settings();
  if (await production.handle(req, res, url) !== false) return;
  if (await storefront.handle(req, res, url) !== false) return;
  if (await inquiries.handle(req, res, url) !== false) return;
  if (await catalogAdmin.handle(req, res, url) !== false) return;
  if (await checkout.handle(req, res, url) !== false) return;
  if (url.pathname === '/api/config') {
    return json(res, 200, {
      whatsapp: current.whatsapp.replace(/\D/g, ''),
      email: current.email,
      photosEnabled: Boolean(current.pexels)
    });
  }
  if (url.pathname === '/api/price') {
    if (req.method !== 'POST') return json(res, 405, { error:'Método não permitido' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error:'Envie JSON' });
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 32768) return json(res, 413, { error:'Configuração muito grande' });
      }
      const payload = JSON.parse(body);
      if (!payload || !productIds.has(payload.productId) || !Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 99 || !payload.configuration || typeof payload.configuration !== 'object' || Array.isArray(payload.configuration)) return json(res, 400, { error:'Configuração inválida' });
      return json(res, 200, resolvePrice(payload, priceBook(root)));
    } catch { return json(res, 400, { error:'Configuração inválida' }); }
  }
  if (url.pathname === '/api/photos') {
    if (!current.pexels) return json(res, 503, { error: 'PEXELS_API_KEY não configurada' });
    const query = (url.searchParams.get('query') || 'visual communication design').trim().slice(0, 80);
    if (!query) return json(res, 400, { error: 'Informe uma busca' });
    const cached = cache.get(query);
    if (cached && cached.expires > Date.now()) return json(res, 200, cached.data);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      let response;
      try {
        response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape&locale=pt-BR`, {
          headers: { Authorization: current.pexels }, signal: controller.signal
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok) return json(res, response.status === 429 ? 429 : 502, { error: 'Pexels indisponível no momento' });
      const body = await response.json();
      const data = { photos: body.photos.map(photo => ({
        id: photo.id, src: photo.src.large, alt: photo.alt || 'Foto profissional',
        photographer: photo.photographer, url: photo.url
      })) };
      cache.set(query, { data, expires: Date.now() + 24 * 60 * 60 * 1000 });
      return json(res, 200, data);
    } catch { return json(res, 502, { error: 'Falha ao consultar a Pexels' }); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Caminho inválido' }); }
  const filePath = path.resolve(publicDir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!filePath.startsWith(publicDir + path.sep)) return json(res, 403, { error: 'Acesso negado' });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, { error: 'Arquivo não encontrado' });
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': filePath.endsWith('.html') || filePath.endsWith('personalizados-data.js') ? 'no-cache' : 'public, max-age=86400' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = settings().port;
  http.createServer(handleApplication).listen(port, () => console.log(`UP Personnaliza em http://localhost:${port}`));
}
