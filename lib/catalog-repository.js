import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fail } from './http.js';
import { publicCatalog, validateCatalog } from './catalog-management.js';
import { buildProductPages } from './product-pages.js';

const costFields = ['unitCents', 'setupCents', 'fixedFeeCents', 'paymentFeeBps', 'taxBps', 'targetContributionBps'];
export const productionStates = ['prototype_to_validate', 'made_to_order', 'stocked', 'unavailable'];
const locks = new Map();
const hash = text => createHash('sha256').update(text).digest('hex');
const textField = (value, label, max, nullable = false) => {
  if (nullable && (value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, 'invalid_catalog', `Confira o campo ${label}.`);
  return value.trim();
};
const integer = (value, label, max = 100000000, min = 0) => {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'invalid_catalog', `Confira o campo ${label}.`);
  return value;
};

export async function readCatalog(root) {
  const source = await fs.readFile(path.join(root, 'catalog', 'personalizados.json'), 'utf8');
  return { data: validateCatalog(JSON.parse(source)), revision: hash(source) };
}

export function modelReadiness(model) {
  const pending = [];
  if (model.productionStatus === 'prototype_to_validate') pending.push('Validar a produção');
  if (model.productionStatus === 'unavailable') pending.push('Produto indisponível');
  if (model.productionStatus === 'stocked' && model.stock.quantity === null) pending.push('Contar o estoque');
  if (!model.specifications.material || !model.specifications.dimensionsMm || model.specifications.productionDays === null) pending.push('Completar material, medidas e prazo');
  if (model.familyId === 'up-kits-eventos' && !model.specifications.piecesPerKit) pending.push('Confirmar a composição do kit');
  if (costFields.some(field => model.cost[field] === null)) pending.push('Completar custos e taxas');
  if (!model.pricingPlan?.retailCents) pending.push('Definir o rascunho de preço');
  return { pending, canCheckout: false, message: 'Venda sob consulta; preço e entrega exigem aprovação comercial.' };
}

export function editableModel(model) {
  return {
    title: model.title, description: model.description, productionStatus: model.productionStatus,
    productionNote: model.productionNote || '', stock: { quantity: model.stock.quantity, source: model.stock.source || '' },
    specifications: structuredClone(model.specifications), cost: structuredClone(model.cost),
    pricingPlan: structuredClone(model.pricingPlan || { retailCents: null, tiers: [], status: 'draft' }),
  };
}

export function applyCatalogEdit(model, edit, at = new Date().toISOString()) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(400, 'invalid_catalog', 'Envie o cadastro do produto.');
  const allowed = new Set(['title','description','productionStatus','productionNote','stock','specifications','cost','pricingPlan']);
  if (Object.keys(edit).some(key => !allowed.has(key))) fail(400, 'invalid_catalog', 'O cadastro contém campos que não podem ser alterados.');
  const updated = structuredClone(model);
  updated.title = textField(edit.title, 'nome', 160);
  updated.description = textField(edit.description, 'descrição', 2000);
  if (!productionStates.includes(edit.productionStatus)) fail(400, 'invalid_catalog', 'Escolha uma situação de produção.');
  updated.productionStatus = edit.productionStatus;
  updated.productionNote = textField(edit.productionNote, 'observação da produção', 1000, true);
  if (updated.productionStatus !== 'prototype_to_validate' && !updated.productionNote) fail(400, 'production_note_required', 'Registre como a situação de produção foi confirmada.');
  if (!edit.stock || !edit.specifications || !edit.cost || !edit.pricingPlan) fail(400, 'invalid_catalog', 'O cadastro está incompleto.');
  const quantity = integer(edit.stock.quantity, 'estoque', 10000000);
  const stockSource = textField(edit.stock.source, 'origem da contagem', 500, true);
  if (quantity !== null && !stockSource) fail(400, 'stock_source_required', 'Informe a origem da contagem do estoque.');
  const stockChanged = quantity !== model.stock.quantity || stockSource !== model.stock.source;
  updated.stock = quantity === null ? { quantity: null, verifiedAt: null, source: null }
    : { quantity, verifiedAt: stockChanged ? at : model.stock.verifiedAt, source: stockSource };
  updated.specifications = {
    material: textField(edit.specifications.material, 'material', 200, true),
    dimensionsMm: textField(edit.specifications.dimensionsMm, 'medidas em mm', 200, true),
    productionDays: integer(edit.specifications.productionDays, 'prazo em dias úteis', 365, 1),
    piecesPerKit: textField(edit.specifications.piecesPerKit, 'composição do kit', 500, true),
  };
  updated.cost = Object.fromEntries(costFields.map(field => [field, integer(edit.cost[field], field, field.endsWith('Bps') ? 9999 : 100000000)]));
  if (['paymentFeeBps','taxBps','targetContributionBps'].reduce((sum,field) => sum + (updated.cost[field] ?? 0), 0) >= 10000) fail(400, 'invalid_cost_rates', 'Taxas, impostos e meta de contribuição devem somar menos de 100%.');
  if (!Array.isArray(edit.pricingPlan.tiers) || edit.pricingPlan.tiers.length > 12) fail(400, 'invalid_price_tiers', 'Cadastre até 12 faixas de quantidade.');
  let previous = 1;
  updated.pricingPlan = {
    retailCents: integer(edit.pricingPlan.retailCents, 'preço de varejo', 100000000, 1),
    tiers: edit.pricingPlan.tiers.map(tier => {
      const minimumQuantity = integer(tier.minimumQuantity, 'quantidade da faixa', 1000000, 2);
      const unitCents = integer(tier.unitCents, 'preço unitário da faixa', 100000000, 1);
      if (minimumQuantity === null || unitCents === null || minimumQuantity <= previous) fail(400, 'invalid_price_tiers', 'As quantidades das faixas devem ser distintas e crescentes, a partir de 2.');
      previous = minimumQuantity;
      return { minimumQuantity, unitCents };
    }),
    status: 'draft', updatedAt: at,
  };
  updated.updatedAt = at;
  return updated;
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, contents, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function buildPublicCatalog(root, data) {
  for (const model of data.models) for (const image of [...model.images,...(model.variants||[]).flatMap(variant=>variant.images)]) await fs.access(path.join(root, 'public', image.src.slice(1)));
  const output = publicCatalog(data);
  // Escape HTML delimiters as defense in depth even though this is a separate JS resource.
  const encoded = JSON.stringify(output).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  await atomicWrite(path.join(root, 'public', 'personalizados-data.js'), `/* Generated catalog; private business data is excluded. */\nwindow.UP_PERSONALIZADOS = Object.freeze(${encoded});\n`);
  await buildProductPages(root,data);
}

export async function saveCatalogModel(root, sku, edit, revision) {
  // Serialize writes in this process; a file lock also covers the CLI and other processes.
  const key = path.resolve(root);
  const previous = locks.get(key) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const lockFile = path.join(root, 'catalog', '.personalizados.lock');
    let lock;
    try { lock = await fs.open(lockFile, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') fail(409, 'catalog_busy', 'Outro processo está salvando o catálogo. Tente novamente.'); throw error; }
    try {
      const snapshot = await readCatalog(root);
      if (typeof revision !== 'string' || snapshot.revision !== revision) fail(409, 'catalog_changed', 'O catálogo mudou em outra janela. Recarregue antes de salvar novamente.');
      const index = snapshot.data.models.findIndex(model => model.sku === sku);
      if (index < 0) fail(404, 'model_missing', 'Produto não encontrado.');
      const before = snapshot.data.models[index];
      const after = applyCatalogEdit(before, edit);
      snapshot.data.models[index] = after;
      snapshot.data.updatedAt = after.updatedAt;
      validateCatalog(snapshot.data);
      // Ensure publication can be built before committing any private changes.
      for (const model of snapshot.data.models) for (const image of [...model.images,...(model.variants||[]).flatMap(variant=>variant.images)]) await fs.access(path.join(root, 'public', image.src.slice(1)));
      const contents = JSON.stringify(snapshot.data, null, 2) + '\n';
      await atomicWrite(path.join(root, 'catalog', 'personalizados.json'), contents);
      await fs.appendFile(path.join(root, 'catalog', 'changes.jsonl'), JSON.stringify({at: after.updatedAt, sku, before, after}) + '\n');
      await buildPublicCatalog(root, snapshot.data);
      return { data: snapshot.data, revision: hash(contents) };
    } finally { await lock.close(); await fs.rm(lockFile, { force: true }); }
  });
  locks.set(key, work);
  try { return await work; } finally { if (locks.get(key) === work) locks.delete(key); }
}

export function catalogCsv(data) {
  const cell = value => {
    const string = value === null || value === undefined ? '' : String(value);
    return '"' + (/^[\s]*[=+@-]/.test(string) ? "'" + string : string).replace(/"/g, '""') + '"';
  };
  const rows = [['SKU','Produto','Produção','Estoque contado','Origem da contagem','Material','Medidas em mm','Prazo dias úteis','Composição do kit','Custo unitário R$','Preparo por lote R$','Taxa fixa por pedido R$','Pagamento %','Impostos %','Meta contribuição %','Varejo rascunho R$','Faixas rascunho (qtd: R$ unitário)']];
  const decimal = value => value === null || value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
  for (const model of data.models) rows.push([model.sku, model.title, model.productionStatus, model.stock.quantity, model.stock.source,
    model.specifications.material, model.specifications.dimensionsMm, model.specifications.productionDays, model.specifications.piecesPerKit,
    ...costFields.map(field => decimal(model.cost[field])), decimal(model.pricingPlan?.retailCents),
    (model.pricingPlan?.tiers || []).map(tier => `${tier.minimumQuantity}: ${decimal(tier.unitCents)}`).join(' | ')]);
  return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
