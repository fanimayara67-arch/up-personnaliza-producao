import fs from "node:fs/promises";
import path from "node:path";
import { productionConfig } from "../production/config.js";
import { queryProduction } from "./setup-production.mjs";
const config = productionConfig(process.cwd());
const privileges = await queryProduction(
  "select count(*) as tables, bool_and(c.relrowsecurity) as all_rls, bool_or(has_table_privilege('anon',c.oid,'select')) as anon_can_read, bool_or(has_table_privilege('authenticated',c.oid,'select')) as authenticated_can_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'up_production_%'",
);
const walk = async (directory) =>
  (
    await Promise.all(
      (await fs.readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? walk(path.join(directory, entry.name))
          : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
let matches = 0;
for (const file of await walk(".next/static")) {
  const data = await fs.readFile(file);
  for (const value of [
    config.supabaseKey,
    config.secret,
    config.gatewayKey,
  ].filter((v) => v.length >= 20))
    if (data.includes(Buffer.from(value))) matches++;
}
console.log(JSON.stringify({ privileges, frontendSecretMatches: matches }));
if (
  matches ||
  !privileges[0].all_rls ||
  privileges[0].anon_can_read ||
  privileges[0].authenticated_can_read
)
  process.exitCode = 1;
