import fs from 'node:fs';
import path from 'node:path';

export function loadSettings(root, environment = process.env) {
  const values = {};
  try {
    for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* Environment variables are sufficient in hosted environments. */ }
  const get = name => environment[name] ?? values[name] ?? '';
  return {
    pexels: get('PEXELS_API_KEY'), whatsapp: get('WHATSAPP_NUMBER'), email: get('CONTACT_EMAIL'),
    port: Number(get('PORT')) || 3100,
    appUrl: get('APP_URL').replace(/\/$/, ''),
    checkoutEnabled: get('CHECKOUT_ENABLED') === 'true',
    catalogAdminEnabled: get('CATALOG_ADMIN_ENABLED') === 'true',
    mpEnvironment: get('MERCADO_PAGO_ENVIRONMENT') || 'test',
    mpAccessToken: get('MERCADO_PAGO_ACCESS_TOKEN'),
    mpWebhookSecret: get('MERCADO_PAGO_WEBHOOK_SECRET'),
    // The callback is derived from APP_URL; an old, unrelated webhook URL is never reused.
    sessionSecret: get('GUEST_SESSION_SECRET'),
    supabaseUrl: (get('SUPABASE_URL') || get('supabase_url')).replace(/\/$/, ''),
    supabaseKey: get('SUPABASE_SERVICE_ROLE_KEY') || get('supabase_service_role_key'),
    artworkBucket: get('ARTWORK_STORAGE_BUCKET') || 'artworks',
  };
}

export function validAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && url.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname);
  } catch { return false; }
}
