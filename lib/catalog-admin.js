import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError, fail, json, readJson } from './http.js';
import { catalogCsv, modelReadiness, readCatalog, saveCatalogModel } from './catalog-repository.js';

export function localAdminAllowed(req, settings, environment = process.env) {
  if (!settings.catalogAdminEnabled || environment.VERCEL || environment.NODE_ENV === 'production') return false;
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) return false;
  if (Object.keys(req.headers).some(key => key.toLowerCase() === 'forwarded' || key.toLowerCase().startsWith('x-forwarded-'))) return false;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(req.headers.host || '')) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return true;
}

export function createCatalogAdmin({ root, settings, environment = process.env }) {
  const assets = {
    '/admin/catalogo': ['catalogo.html','text/html; charset=utf-8'],
    '/admin/solicitacoes': ['solicitacoes.html','text/html; charset=utf-8'],
    '/admin/configuracoes': ['configuracoes.html','text/html; charset=utf-8'],
    '/admin/assets/configuracoes.js': ['configuracoes.js','application/javascript; charset=utf-8'],
    '/admin/assets/solicitacoes.js': ['solicitacoes.js','application/javascript; charset=utf-8'],
    '/admin/assets/catalogo.css': ['catalogo.css','text/css; charset=utf-8'],
    '/admin/assets/catalogo.js': ['catalogo.js','application/javascript; charset=utf-8'],
  };
  const envelope = async snapshot => ({ ...snapshot, reportedCosts:JSON.parse(await fs.readFile(path.join(root,'catalog','private-reported-costs.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;})), readiness: Object.fromEntries(snapshot.data.models.map(model => [model.sku, modelReadiness(model)])) });
  return {
    async handle(req, res, url) {
      if (!url.pathname.startsWith('/admin/') && !url.pathname.startsWith('/api/admin/')) return false;
      if (!localAdminAllowed(req, settings(), environment)) { json(res, 404, { error: 'Arquivo não encontrado' }); return true; }
      try {
        if (assets[url.pathname]) {
          if (!['GET','HEAD'].includes(req.method)) fail(405, 'method_not_allowed', 'Método não permitido.');
          const [file, type] = assets[url.pathname];
          const body = await fs.readFile(path.join(root, 'admin', file));
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'" });
          res.end(req.method === 'HEAD' ? undefined : body);
        } else if (url.pathname === '/api/admin/catalog' && req.method === 'GET') {
          json(res, 200, await envelope(await readCatalog(root)));
        } else if (url.pathname === '/api/admin/catalog/export.csv' && req.method === 'GET') {
          const { data } = await readCatalog(root);
          res.writeHead(200, {'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="catalogo-administrativo.csv"', 'X-Content-Type-Options': 'nosniff'});
          res.end(catalogCsv(data));
        } else if (/^\/api\/admin\/catalog\/UP-(?:PERS-\d{2}|M[PTX]-\d{3})$/.test(url.pathname) && req.method === 'PUT') {
          if (req.headers.origin !== `http://${req.headers.host}`) fail(403, 'origin_required', 'Salve o cadastro pela página de administração local.');
          const payload = await readJson(req);
          if (!payload || typeof payload !== 'object') fail(400, 'invalid_catalog', 'Envie o cadastro do produto.');
          const sku = url.pathname.split('/').pop();
          json(res, 200, await envelope(await saveCatalogModel(root, sku, payload.edit, payload.revision)));
        } else { fail(404, 'not_found', 'Página ou operação não encontrada.'); }
      } catch (error) {
        json(res, error instanceof HttpError ? error.status : 500, { code: error instanceof HttpError ? error.code : 'admin_unavailable',
          error: error instanceof HttpError ? error.message : 'Não foi possível concluir. Recarregue o cadastro para conferir os dados salvos.' });
      }
      return true;
    },
  };
}
