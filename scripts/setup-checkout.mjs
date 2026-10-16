import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/settings.js';
import { createDatabase } from '../lib/database.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = loadSettings(root);
const content = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
const local = Object.fromEntries(content.split(/\r?\n/).map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(match => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]));
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN || local.supabase_api_key;
if (!token || !settings.supabaseUrl) throw new Error('Supabase administrative credentials are not configured.');
const project = new URL(settings.supabaseUrl).hostname.split('.')[0];
export async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error(JSON.stringify({ operation: 'database_query', httpStatus: response.status }));
    throw new Error('Database query failed; credentials and raw responses were not logged.');
  }
  return result;
}
const state = await query("select to_regclass('public.cvt_orders') is not null as orders_exist, to_regclass('public.cvt_artworks') is not null as artworks_exist");
console.log(JSON.stringify({ existingSchema: state, apply: process.argv.includes('--apply') }));
if (process.argv.includes('--apply')) {
  await query(await fs.readFile(path.join(root, 'database', 'checkout.sql'), 'utf8'), false);
  const bucketUrl = `${settings.supabaseUrl}/storage/v1/bucket`;
  const headers = { apikey: settings.supabaseKey, Authorization: `Bearer ${settings.supabaseKey}`, 'Content-Type': 'application/json' };
  const bucketsResponse = await fetch(bucketUrl, { headers, signal: AbortSignal.timeout(10000) });
  if (!bucketsResponse.ok) throw new Error(`Bucket inspection failed: HTTP ${bucketsResponse.status}`);
  const buckets = await bucketsResponse.json();
  const existing = buckets.find(bucket => bucket.id === settings.artworkBucket);
  if (existing?.public) throw new Error('The configured bucket is public; select a private bucket before uploading artwork.');
  if (!existing) {
    const created = await fetch(bucketUrl, { method: 'POST', headers, signal: AbortSignal.timeout(10000), body: JSON.stringify({
      id: settings.artworkBucket, name: settings.artworkBucket, public: false, file_size_limit: 15728640,
      allowed_mime_types: ['application/pdf', 'image/png', 'image/jpeg'],
    }) });
    if (!created.ok) throw new Error(`Bucket creation failed: HTTP ${created.status}`);
  }
  await createDatabase(settings).ready();
  const security = await query("select c.relname, c.relrowsecurity as rls_enabled, has_table_privilege('anon',c.oid,'SELECT') as anon_select, has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('cvt_orders','cvt_payments','cvt_artworks') order by c.relname");
  console.log(JSON.stringify({ schemaReady: true, privateArtworkBucket: true, security }));
}
