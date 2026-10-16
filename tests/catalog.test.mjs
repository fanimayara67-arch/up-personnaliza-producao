import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { minimumOrderPrice, publicCatalog, validateCatalog } from '../lib/catalog-management.js';
const catalog = JSON.parse(await fs.readFile(new URL('../catalog/personalizados.json',import.meta.url),'utf8'));
test('active catalog has unique models and families and retains all responsive image files', async () => {
  validateCatalog(catalog);
  assert.ok(catalog.models.length>0); assert.ok(catalog.groups.length>0);
  assert.equal(new Set(catalog.models.map(model => model.sku)).size,catalog.models.length);
  assert.equal(catalog.models.some(model=>model.sku==='UP-PERS-02'),false);
  for (const model of catalog.models) {
    assert.equal(model.images.length,3);
    assert.equal(model.stock.quantity,null);
    for (const image of model.images) await fs.access(new URL(`../public${image.src}`,import.meta.url));
    for(const variant of model.variants||[])for(const image of variant.images)await fs.access(new URL(`../public${image.src}`,import.meta.url));
  }
});
test('the supplied cracha-to-ship package retains all 15 products and 21 image models without publishing prices',()=>{
  const imported=catalog.models.filter(model=>model.importSource==='cracha-navio-2026-10-16');
  assert.equal(imported.length,15);assert.equal(imported.reduce((sum,model)=>sum+model.variants.length,0),21);
  assert.equal(catalog.models.some(model=>model.sku==='UP-MD-001'),false);
  for(const model of imported){assert.equal(model.providedPricing,undefined);assert.equal(model.approvedOffers.length,0);assert.equal(model.stock.quantity,null);}
});
test('invalid variant identities, images and configurations cannot enter the catalog',()=>{
  const original=catalog.models.find(model=>model.id==='up-r2-enfeite-natal-pet');
  for(const corrupt of [model=>model.variants[1].id=model.variants[0].id,model=>model.variants[0].images[0].src='/private/photo.webp',model=>model.variants[0].configuration.finish='unknown']){
    const data=structuredClone(catalog),model=data.models.find(model=>model.id===original.id);corrupt(model);assert.throws(()=>validateCatalog(data),/variant|Variant/);
  }
});
test('public catalog never turns research prices, unknown stock or costs into offers', () => {
  const publicData = publicCatalog(catalog);
  for (const model of publicData.models) {
    assert.equal(model.canCheckout,false); assert.equal(model.price,null);
    assert.equal(model.availability,'consultation');
    assert.equal('cost' in model,false); assert.equal('pricingResearch' in model,false); assert.equal('stock' in model,false);
  }
});
test('unknown stock differs from zero and a physical count needs supporting information', () => {
  const data = structuredClone(catalog);
  data.models[0].stock.quantity = 0;
  assert.throws(() => validateCatalog(data), /Counted stock/);
  data.models[0].stock.verifiedAt = '2026-10-15'; data.models[0].stock.source = 'Contagem de teste';
  assert.equal(validateCatalog(data).models[0].stock.quantity,0);
  data.models[0].stock.quantity = -1;
  assert.throws(() => validateCatalog(data),/Stock must/);
});
test('a cost floor requires real inputs, allocates setup per batch and rounds upward', () => {
  assert.equal(minimumOrderPrice(catalog.models[0].cost,50),null);
  const cost = {unitCents:200,setupCents:1500,fixedFeeCents:0,paymentFeeBps:500,taxBps:600,targetContributionBps:3000};
  assert.deepEqual(minimumOrderPrice(cost,50),{totalCents:19492,unitCents:390});
  assert.ok(minimumOrderPrice(cost,1).unitCents > minimumOrderPrice(cost,50).unitCents);
  assert.throws(() => minimumOrderPrice({...cost,taxBps:9500},50),/less than 100/);
});
