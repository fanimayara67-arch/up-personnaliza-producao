import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimumOrderPrice } from '../lib/catalog-management.js';
import { buildPublicCatalog, editableModel, readCatalog, saveCatalogModel } from '../lib/catalog-repository.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift() || 'report';
const option = flag => { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; };
const {data, revision} = await readCatalog(root);
if (command === 'report') {
  console.table(data.models.map(model => ({ SKU:model.sku, produto:model.title,
    estoque:model.stock.quantity ?? 'Não informado', producao:model.productionStatus,
    custo:model.cost.unitCents === null ? 'Não informado' : model.cost.unitCents / 100,
    precoAprovado:model.approvedOffers.length ? 'Cadastrado' : 'Pendente' })));
} else if (command === 'build') {
  await buildPublicCatalog(root, data);
  console.log(JSON.stringify({families:data.groups.length,models:data.models.length,publicReferencePrices:data.models.filter(model=>model.providedPricing).length,approvedCheckoutPrices:0,checkoutEnabled:false}));
} else if (command === 'stock') {
  const model = data.models.find(model => model.sku === option('--sku'));
  const raw = option('--quantity');
  const note = option('--note');
  if (!model || !/^\d+$/.test(raw || '') || !Number.isSafeInteger(Number(raw)) || !note?.trim()) throw new Error('Use stock --sku UP-PERS-01 --quantity N --note "origem da contagem".');
  const edit = editableModel(model);
  edit.stock = {quantity:Number(raw), source:note.trim()};
  await saveCatalogModel(root, model.sku, edit, revision);
  console.log(JSON.stringify({sku:model.sku,stock:Number(raw),checkoutEnabled:false}));
} else if (command === 'price-floor') {
  const model = data.models.find(model => model.sku === option('--sku'));
  const raw = option('--quantity');
  if (!model || !/^\d+$/.test(raw || '')) throw new Error('Use price-floor --sku UP-PERS-01 --quantity N.');
  const result = minimumOrderPrice(model.cost,Number(raw));
  console.log(JSON.stringify({sku:model.sku,quantity:Number(raw),floor:result,
    message:result ? 'Cost floor only; no selling price was published.' : 'Preencha custo, preparo, taxa fixa, taxas percentuais, impostos e meta de contribuição no cadastro privado.'}));
} else { throw new Error('Commands: report, build, stock, price-floor.'); }
