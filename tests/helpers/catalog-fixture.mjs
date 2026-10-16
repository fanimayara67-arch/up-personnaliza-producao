import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createCatalogAdmin } from '../../lib/catalog-admin.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function catalogFixture({ environment = {}, enabled = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'up-catalog-test-'));
  await fs.mkdir(path.join(root, 'catalog'));
  await fs.copyFile(path.join(project, 'catalog', 'personalizados.json'), path.join(root, 'catalog', 'personalizados.json'));
  await fs.cp(path.join(project, 'admin'), path.join(root, 'admin'), { recursive: true });
  await fs.mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  for(const file of ['real-media.js','catalog.js'])await fs.copyFile(path.join(project,'public',file),path.join(root,'public',file));
  await fs.cp(path.join(project, 'public', 'assets', 'catalogo-personalizados'), path.join(root, 'public', 'assets', 'catalogo-personalizados'), { recursive: true });
  const admin = createCatalogAdmin({ root, settings: () => ({ catalogAdminEnabled: enabled }), environment });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (await admin.handle(req, res, url) !== false) return;
    // Only the known stylesheet and image directory are served by this test harness.
    const permitted = url.pathname === '/theme.css' || /^\/assets\/catalogo-personalizados\/[a-z0-9-]+\.webp$/.test(url.pathname);
    if (!permitted) { res.writeHead(404); res.end(); return; }
    try {
      const body = await fs.readFile(path.join(project, 'public', url.pathname.slice(1)));
      res.writeHead(200, {'Content-Type':url.pathname.endsWith('.css') ? 'text/css' : 'image/webp'}); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { root, server, url: `http://127.0.0.1:${server.address().port}`, async close() {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive:true, force:true });
  } };
}
