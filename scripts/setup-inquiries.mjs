import fs from 'node:fs/promises';
import { query } from './setup-checkout.mjs';
if (process.argv.includes('--install-inquiries')) await query(await fs.readFile(new URL('../database/inquiries.sql',import.meta.url),'utf8'),false);
console.log(JSON.stringify({inquiries:await query("select c.relrowsecurity as rls_enabled, has_table_privilege('anon',c.oid,'SELECT') as anon_select, has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='cvt_inquiries'")}));
