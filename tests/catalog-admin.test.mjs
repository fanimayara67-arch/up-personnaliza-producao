import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { localAdminAllowed } from '../lib/catalog-admin.js';
import { catalogCsv, editableModel, readCatalog, saveCatalogModel } from '../lib/catalog-repository.js';
import { catalogFixture } from './helpers/catalog-fixture.mjs';

const request = (headers = {}, address = '127.0.0.1') => ({headers:{host:'localhost:3100',...headers},socket:{remoteAddress:address}});
test('administration requires opt-in, loopback connection, a local host and no proxy or cross-origin context', () => {
  const enabled = { catalogAdminEnabled:true };
  assert.equal(localAdminAllowed(request(), enabled, {}), true);
  assert.equal(localAdminAllowed(request({host:'[::1]:3100'},'::1'), enabled, {}), true);
  assert.equal(localAdminAllowed(request(), {}, {}), false);
  for (const req of [request({},'192.168.1.2'),request({host:'store.example'}),request({host:'localhost.attacker.example'}),request({'x-forwarded-for':'127.0.0.1'}),request({'x-forwarded-host':'localhost:3100'}),request({forwarded:'for=127.0.0.1'}),request({origin:'https://external.example'}),request({'sec-fetch-site':'cross-site'})]) assert.equal(localAdminAllowed(req, enabled, {}), false);
  assert.equal(localAdminAllowed(request(), enabled, {VERCEL:'1'}), false);
  assert.equal(localAdminAllowed(request(), enabled, {NODE_ENV:'production'}), false);
});

test('local HTTP admin refuses unauthorized and malformed writes and never mutates on validation errors', async t => {
  const fixture = await catalogFixture(); t.after(() => fixture.close());
  const { data, revision } = await readCatalog(fixture.root);
  const edit = editableModel(data.models[0]);
  const save = (value = edit, headers = {}) => fetch(`${fixture.url}/api/admin/catalog/UP-PERS-01`, {method:'PUT',headers:{'Content-Type':'application/json',Origin:fixture.url,...headers},body:JSON.stringify({revision,edit:value})});
  assert.equal((await fetch(`${fixture.url}/admin/catalogo`)).status,200);
  assert.equal((await fetch(`${fixture.url}/admin/assets/missing.js`)).status,404);
  assert.equal((await save(edit,{Origin:''})).status,403);
  assert.equal((await save(edit,{Origin:'https://evil.example'})).status,404);
  assert.equal((await save(edit,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await save({...edit,approvedOffers:[{price:1}]})).status,400);
  assert.equal((await save({...edit,productionStatus:'made_to_order',productionNote:''})).status,400);
  assert.equal((await save({...edit,stock:{quantity:0,source:''}})).status,400);
  assert.equal((await save({...edit,cost:{...edit.cost,paymentFeeBps:7000,taxBps:3000}})).status,400);
  assert.equal((await save({...edit,pricingPlan:{retailCents:100,tiers:[{minimumQuantity:20,unitCents:50},{minimumQuantity:10,unitCents:30}]}})).status,400);
  assert.equal((await readCatalog(fixture.root)).revision,revision);
});

test('saving persists validated stock and private pricing drafts, audits changes and excludes private data from the collection', async t => {
  const fixture = await catalogFixture(); t.after(() => fixture.close());
  const snapshot = await readCatalog(fixture.root);
  const model = snapshot.data.models[0]; const edit = editableModel(model);
  edit.title = '<img src=x onerror=alert(1)> Modelo de teste';
  edit.productionStatus = 'made_to_order'; edit.productionNote = 'Validação simulada exclusivamente nesta pasta temporária.';
  edit.stock = {quantity:0,source:'Contagem simulada no teste isolado'};
  edit.specifications = {material:'Acrílico (fixture)',dimensionsMm:'50 × 50 × 2',productionDays:5,piecesPerKit:null};
  edit.cost = {unitCents:200,setupCents:1500,fixedFeeCents:0,paymentFeeBps:500,taxBps:600,targetContributionBps:3000};
  edit.pricingPlan = {retailCents:1490,tiers:[{minimumQuantity:50,unitCents:490}],status:'approved'};
  const response = await fetch(`${fixture.url}/api/admin/catalog/${model.sku}`,{method:'PUT',headers:{'Content-Type':'application/json',Origin:fixture.url},body:JSON.stringify({revision:snapshot.revision,edit})});
  assert.equal(response.status,200);
  const saved = await response.json(); const actual = saved.data.models[0];
  assert.equal(actual.stock.quantity,0); assert.ok(Date.parse(actual.stock.verifiedAt));
  assert.equal(actual.cost.unitCents,200); assert.equal(actual.pricingPlan.status,'draft');
  assert.deepEqual(actual.approvedOffers,[]); assert.deepEqual(actual.pricingResearch,model.pricingResearch);
  assert.equal(saved.readiness[model.sku].canCheckout,false);
  const reopened = await readCatalog(fixture.root); assert.equal(reopened.revision,saved.revision);
  const audit = JSON.parse((await fs.readFile(path.join(fixture.root,'catalog','changes.jsonl'),'utf8')).trim());
  assert.equal(audit.before.stock.quantity,null); assert.equal(audit.after.stock.quantity,0);
  const generated = await fs.readFile(path.join(fixture.root,'public','personalizados-data.js'),'utf8');
  assert.equal(generated.includes('<img'),false);
  for (const privateKey of ['pricingPlan','pricingResearch','stock','cost','productionNote','approvedOffers']) assert.equal(generated.includes(`"${privateKey}"`),false);
  assert.ok(generated.includes('"canCheckout":false'));
  const storefront = await fs.readFile(path.join(fixture.root,'public','storefront-catalog.js'),'utf8');
  assert.equal(storefront.includes('<img'),false);
  for(const privateKey of ['pricingPlan','pricingResearch','stock','cost','productionNote','approvedOffers'])assert.equal(storefront.includes(`"${privateKey}"`),false);
  const detail = await fs.readFile(path.join(fixture.root,'public','produtos',model.id+'.html'),'utf8');
  assert.ok(detail.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(detail.includes('<img src=x'),false);
  assert.ok(detail.includes('id="pdpForm"'));
});

test('a stale window and concurrent processes cannot overwrite a newer catalog revision', async t => {
  const fixture = await catalogFixture(); t.after(() => fixture.close());
  const snapshot = await readCatalog(fixture.root); const model = snapshot.data.models[0];
  const one = editableModel(model); one.description = 'Primeira edição de teste.';
  const two = editableModel(model); two.description = 'Segunda edição de teste.';
  const results = await Promise.allSettled([saveCatalogModel(fixture.root,model.sku,one,snapshot.revision),saveCatalogModel(fixture.root,model.sku,two,snapshot.revision)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length,1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status,409);
  assert.equal((await readCatalog(fixture.root)).data.models[0].description,one.description);
  await fs.writeFile(path.join(fixture.root,'catalog','.personalizados.lock'),'');
  const current = await readCatalog(fixture.root);
  await assert.rejects(saveCatalogModel(fixture.root,model.sku,two,current.revision),error => error.code === 'catalog_busy');
});

test('CSV preserves unknown versus zero and neutralizes spreadsheet formulas', async t => {
  const fixture = await catalogFixture(); t.after(() => fixture.close());
  const {data} = await readCatalog(fixture.root);
  data.models[0].title = '=HYPERLINK("https://example.com")'; data.models[0].stock.quantity = 0;
  data.models[0].cost.unitCents = 250;
  const csv = catalogCsv(data);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes(';"0";')); assert.ok(csv.includes('"2,50"'));
  const response = await fetch(`${fixture.url}/api/admin/catalog/export.csv`);
  assert.equal(response.status,200); assert.match(response.headers.get('Content-Disposition'),/attachment/);
});

test('the HTTP administration is unavailable in production, on Vercel and when disabled', async t => {
  for (const options of [{environment:{VERCEL:'1'}},{environment:{NODE_ENV:'production'}},{enabled:false}]) {
    const fixture = await catalogFixture(options); t.after(() => fixture.close());
    for (const route of ['/admin/catalogo','/admin/assets/catalogo.js','/api/admin/catalog','/api/admin/catalog/export.csv']) assert.equal((await fetch(fixture.url + route)).status,404);
  }
});
