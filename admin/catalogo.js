(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('editor');
  const money = cents => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents / 100);
  const decimal = value => value === null || value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
  const costFields = ['unitCents','setupCents','fixedFeeCents','paymentFeeBps','taxBps','targetContributionBps'];
  const names = {prototype_to_validate:'Produção a validar',made_to_order:'Sob encomenda',stocked:'Pronta entrega',unavailable:'Indisponível'};
  let snapshot, selectedSku, dirty = false, busy = false;
  const field = name => form.elements.namedItem(name);
  const selected = () => snapshot.data.models.find(model => model.sku === selectedSku);
  const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const error = message => { $('error').textContent = message; $('error').hidden = !message; };
  const markDirty = () => { dirty = true; $('saveState').textContent = 'Alterações ainda não salvas.'; };
  function numberValue(input, multiplier = 1) {
    const value = input.value.trim();
    if (!value) return null;
    if (!(multiplier === 100 ? /^\d+(?:[,.]\d{1,2})?$/ : /^\d+$/).test(value)) throw new Error('Use valores positivos, com até duas casas decimais e sem separador de milhar.');
    const number = Math.round(Number(value.replace(',', '.')) * multiplier);
    if (!Number.isSafeInteger(number)) throw new Error('O valor informado é muito grande.');
    return number;
  }
  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = value; });
    $('search').disabled = value;
    $('products').querySelectorAll('button').forEach(button => { button.disabled = value; });
    if (!value) $('copyResearch').disabled = !selected()?.pricingResearch.retailTargetCents;
    $('save').textContent = value ? 'Salvando…' : 'Salvar cadastro';
  }
  async function request(url, options = {}) {
    const response = await fetch(url, {cache:'no-store',...options});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível acessar o cadastro local.');
    return body;
  }
  function renderProducts() {
    const query = normalized($('search').value.trim());
    const models = snapshot.data.models.filter(model => normalized(`${model.sku} ${model.title}`).includes(query));
    $('products').replaceChildren();
    $('searchCount').textContent = `${models.length} de ${snapshot.data.models.length} produtos`;
    for (const model of models) {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-pressed', String(model.sku === selectedSku));
      const image = document.createElement('img'); image.src = model.images[0].src; image.alt = ''; image.width = 48; image.height = 48;
      const copy = document.createElement('span'); const title = document.createElement('strong'); const meta = document.createElement('small');
      title.textContent = model.title;
      meta.textContent = `${model.sku} · ${names[model.productionStatus]} · ${model.stock.quantity === null ? 'Estoque não informado' : `Estoque: ${model.stock.quantity}`}`;
      copy.append(title, meta); button.append(image, copy);
      button.addEventListener('click', () => {
        if (busy || model.sku === selectedSku) return;
        if (dirty && !window.confirm('Há alterações não salvas. Descartar e abrir outro produto?')) return;
        selectModel(model.sku);
      });
      $('products').append(button);
    }
    if (!models.length) { const p = document.createElement('p'); p.textContent = 'Nenhum produto encontrado.'; $('products').append(p); }
  }
  function addTier(tier = {}) {
    const node = $('tierTemplate').content.firstElementChild.cloneNode(true);
    node.querySelector('[data-tier-quantity]').value = tier.minimumQuantity ?? '';
    node.querySelector('[data-tier-price]').value = decimal(tier.unitCents);
    node.querySelector('[data-remove-tier]').addEventListener('click', () => { node.remove(); markDirty(); calculate(); });
    $('tiers').append(node);
  }
  function selectModel(sku) {
    selectedSku = sku; dirty = false; error('');
    const model = selected();
    const url = new URL(location.href); url.searchParams.set('sku', sku); history.replaceState(null, '', url);
    $('sku').textContent = model.sku; $('productName').textContent = model.title;
    $('productImage').src = model.images[0].src; $('productImage').alt = model.alt;
    for (const name of ['title','description','productionStatus']) field(name).value = model[name];
    field('productionNote').value = model.productionNote || '';
    field('stockQuantity').value = model.stock.quantity ?? ''; field('stockSource').value = model.stock.source || '';
    $('stockDate').textContent = model.stock.verifiedAt ? `Contagem registrada em ${new Date(model.stock.verifiedAt).toLocaleString('pt-BR')}` : 'Nenhuma contagem registrada.';
    for (const name of ['material','dimensionsMm','productionDays','piecesPerKit']) field(name).value = model.specifications[name] ?? '';
    for (const name of costFields) field(name).value = decimal(model.cost[name]);
    field('retailCents').value = decimal(model.pricingPlan?.retailCents);
    $('tiers').replaceChildren(); for (const tier of model.pricingPlan?.tiers || []) addTier(tier);
    $('pending').replaceChildren();
    const pending = snapshot.readiness[sku].pending;
    for (const item of pending.length ? pending : ['Cadastro preenchido. Revisar preços e entrega antes de liberar vendas.']) { const li = document.createElement('li'); li.textContent = item; $('pending').append(li); }
    $('researchRows').replaceChildren();
    const research = model.pricingResearch;
    $('researchTitle').textContent=research.confidence==='owner_supplied'?'Preços informados na atualização':'Referência da pesquisa';
    const reported=snapshot.reportedCosts?.[model.sku];
    $('reportedCost').hidden=!reported;
    $('reportedCost').textContent=reported?`Custo unitário informado: ${money(reported.reportedUnitCents)}. A composição não foi confirmada; confira os componentes antes de preencher o custo completo.`:'';
    $('researchInfo').textContent = research.confidence==='owner_supplied'?`Preços informados em ${research.asOf.split('-').reverse().join('/')} · ${research.basis}`:`Pesquisa de ${research.asOf.split('-').reverse().join('/')} · Confiança ${research.confidence === 'medium' ? 'moderada' : 'baixa'} · ${research.basis}`;
    const rows = [{minimumQuantity:1,unitTargetCents:research.retailTargetCents},...research.bulkTargets];
    for (const row of rows) {
      const tr = document.createElement('tr'); const quantity = document.createElement('td'); const price = document.createElement('td');
      quantity.textContent = row.minimumQuantity === 1 ? 'Varejo' : `A partir de ${row.minimumQuantity}`;
      price.textContent = row.unitTargetCents === null ? 'Sem referência equivalente' : money(row.unitTargetCents);
      tr.append(quantity, price); $('researchRows').append(tr);
    }
    $('copyResearch').disabled = !research.retailTargetCents;
    $('saveState').textContent = 'Cadastro carregado.'; renderProducts(); calculate();
  }
  function collect() {
    const tiers = [...$('tiers').children].map(row => ({minimumQuantity:numberValue(row.querySelector('[data-tier-quantity]')),unitCents:numberValue(row.querySelector('[data-tier-price]'),100)}));
    return {
      title:field('title').value, description:field('description').value, productionStatus:field('productionStatus').value,
      productionNote:field('productionNote').value,
      stock:{quantity:numberValue(field('stockQuantity')),source:field('stockSource').value},
      specifications:{material:field('material').value || null,dimensionsMm:field('dimensionsMm').value || null,productionDays:numberValue(field('productionDays')),piecesPerKit:field('piecesPerKit').value || null},
      cost:Object.fromEntries(costFields.map(name => [name,numberValue(field(name),100)])),
      pricingPlan:{retailCents:numberValue(field('retailCents'),100),tiers},
    };
  }
  function calculate() {
    const target = $('calculation'); target.replaceChildren();
    try {
      const edit = collect(); const cost = edit.cost; const quantity = numberValue($('simulationQuantity'));
      if (!quantity || quantity > 10000) throw new Error('Escolha uma quantidade entre 1 e 10.000.');
      if (costFields.some(name => cost[name] === null)) { target.textContent = 'Preencha os seis campos de custos e taxas para calcular o preço mínimo.'; return; }
      const denominator = 10000 - cost.paymentFeeBps - cost.taxBps - cost.targetContributionBps;
      if (denominator <= 0) throw new Error('Taxas, impostos e meta devem somar menos de 100%.');
      const fixedAndProducts = cost.unitCents * quantity + cost.setupCents + cost.fixedFeeCents;
      if (!Number.isSafeInteger(fixedAndProducts * 10000)) throw new Error('Os valores ultrapassam o limite de cálculo.');
      const floor = Math.ceil(fixedAndProducts * 10000 / denominator);
      const applicable = edit.pricingPlan.tiers.filter(tier => tier.minimumQuantity !== null && tier.minimumQuantity <= quantity).sort((a,b) => a.minimumQuantity - b.minimumQuantity).pop();
      const unit = applicable ? applicable.unitCents : edit.pricingPlan.retailCents;
      const dl = document.createElement('dl');
      const line = (label,value) => { const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; dl.append(dt, dd); };
      line(`Mínimo para ${quantity} unidades`, money(floor)); line('Mínimo unitário, arredondado', money(Math.ceil(floor / quantity)));
      if (unit !== null) {
        const revenue = unit * quantity;
        const fees = Math.ceil(revenue * cost.paymentFeeBps / 10000);
        const taxes = Math.ceil(revenue * cost.taxBps / 10000);
        const contribution = revenue - fixedAndProducts - fees - taxes;
        line('Preço unitário do rascunho', money(unit)); line('Total do rascunho', money(revenue));
        line('Contribuição estimada do lote', money(contribution));
        line('Margem de contribuição estimada', `${revenue ? (contribution / revenue * 100).toFixed(1).replace('.', ',') : '0'}%`);
        if (revenue < floor) { const p = document.createElement('p'); p.className = 'negative'; p.textContent = 'O rascunho fica abaixo do mínimo para a meta cadastrada. Reveja preço, custos ou quantidade.'; target.append(p); }
      }
      target.prepend(dl);
    } catch (cause) { target.textContent = cause.message; }
  }
  async function load() {
    error(''); $('message').textContent = 'Carregando o catálogo…';
    const loaded = await request('/api/admin/catalog');
    snapshot = loaded;
    $('workspace').hidden = false;
    $('overview').textContent = `${snapshot.data.models.length} modelos em ${snapshot.data.groups.length} famílias. Cadastre dados reais para avaliar varejo e atacado.`;
    const requested = new URL(location.href).searchParams.get('sku');
    selectModel(snapshot.data.models.some(model => model.sku === requested) ? requested : selectedSku || snapshot.data.models[0].sku);
    $('message').textContent = 'Administração disponível apenas neste computador.';
  }
  $('search').addEventListener('input', renderProducts);
  form.addEventListener('input', event => { if (event.target.id !== 'simulationQuantity') markDirty(); calculate(); });
  $('addTier').addEventListener('click', () => { if ($('tiers').children.length >= 12) return error('Use no máximo 12 faixas.'); addTier(); markDirty(); $('tiers').lastElementChild.querySelector('input').focus(); });
  $('copyResearch').addEventListener('click', () => {
    if ((field('retailCents').value || $('tiers').children.length) && !window.confirm('Substituir o rascunho atual pelas sugestões da pesquisa?')) return;
    const research = selected().pricingResearch;
    field('retailCents').value = decimal(research.retailTargetCents); $('tiers').replaceChildren();
    research.bulkTargets.forEach(tier => addTier({minimumQuantity:tier.minimumQuantity,unitCents:tier.unitTargetCents})); markDirty(); calculate();
  });
  $('reload').addEventListener('click', async () => {
    if (dirty && !window.confirm('Descartar alterações não salvas e recarregar?')) return;
    setBusy(true); try { await load(); } catch (cause) { error(cause.message); } finally { setBusy(false); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); error('');
    if (busy || !form.reportValidity()) return;
    let edit; try { edit = collect(); } catch (cause) { error(cause.message); return; }
    setBusy(true);
    try {
      snapshot = await request(`/api/admin/catalog/${selectedSku}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:snapshot.revision,edit})});
      selectModel(selectedSku); $('saveState').textContent = 'Cadastro salvo neste computador.';
      $('message').textContent = 'Cadastro e coleção local atualizados. Os preços continuam privados.';
    } catch (cause) { error(cause.message); $('saveState').textContent = 'Não confirmado. Confira os dados antes de tentar novamente.'; }
    finally { setBusy(false); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  load().catch(cause => { error(cause.message); $('message').textContent = 'Catálogo indisponível. Confira o servidor local e recarregue a página.'; });
})();
