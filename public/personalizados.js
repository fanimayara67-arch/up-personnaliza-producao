(() => {
  const catalog = window.UP_PERSONALIZADOS;
  const $ = selector => document.querySelector(selector);
  const draftKey = 'up-personalizados-consultation';
  let category = 'Todas as ocasiões';
  let search = '';
  let selected;
  let group;
  let contact = {};
  const filters = ['Todas as ocasiões','Lembranças e presentes','Festas e eventos','Casa e decoração',...(catalog.groups.some(group=>group.id==='up-porta-bombom')?['Natal']:[])];
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  function referencePrices() {
    const target=$('#detailReferencePrices');if(!target)return;
    const price=selected?.referencePricing;target.hidden=!price;target.replaceChildren();if(!price)return;
    const summary=document.createElement('p');summary.textContent=`Preço de referência: ${money(price.retailCents)} por unidade. ${price.bulkCondition}: ${money(price.bulkUnitCents)} por unidade (11 ou mais do mesmo modelo).`;
    const quantity=Number($('#consultForm').elements.quantity.value);
    const estimate=document.createElement('p');
    if(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=10000){const unit=quantity>=price.bulkMinimumQuantity?price.bulkUnitCents:price.retailCents;estimate.textContent=`Simulação de produtos: ${quantity} × ${money(unit)} = ${money(quantity*unit)}. Entrega e condições finais no orçamento.`;}
    const note=document.createElement('p');note.className='shop-note';note.textContent='Valores para o modelo ilustrado, sem combinar modelos diferentes. Produção, personalização e disponibilidade precisam de confirmação; esta simulação não é uma compra.';
    target.append(summary,estimate,note);
  }
  function image(element, model, sizes) {
    const largest = model.images.at(-1);
    element.srcset = model.images.map(item => `${item.src} ${item.width}w`).join(', ');
    element.sizes = sizes; element.width = largest.width; element.height = largest.height;
    element.src = largest.src; element.alt = model.alt; element.decoding = 'async';
  }
  function renderCards() {
    const target = $('#collectionGrid'); target.replaceChildren();
    const matches = catalog.groups.filter(family => {
      const models = catalog.models.filter(model => model.familyId === family.id);
      const inCategory = category === 'Todas as ocasiões' || family.intent === category || (category === 'Natal' && family.id === 'up-porta-bombom');
      return inCategory && normalize(`${family.name} ${models.map(model => `${model.title} ${model.label}`).join(' ')}`).includes(search);
    });
    for (const family of matches) {
      const models = catalog.models.filter(model => model.familyId === family.id);
      const card = document.createElement('article'); card.className = 'collection-card';
      const link = document.createElement('a'); link.href = `/personalizados.html?produto=${encodeURIComponent(family.id)}`;
      const figure = document.createElement('figure'); const photo = document.createElement('img'); photo.loading = 'lazy';
      image(photo,models[0],'(min-width:900px) 30vw, (min-width:600px) 45vw, 90vw');
      const label = document.createElement('span'); label.textContent = 'Imagem de conceito';
      figure.append(photo,label);
      const heading = document.createElement('h3'); heading.textContent = family.name;
      const description = document.createElement('p'); description.textContent = models.map(model => model.label).join(' · ');
      const action = document.createElement('span'); action.className = 'collection-card-link'; action.textContent = 'Ver modelos e consultar →';
      link.append(figure,heading); card.append(link,description);
      const actionLink = document.createElement('a'); actionLink.href = link.href; actionLink.append(action); actionLink.setAttribute('aria-label',`Ver modelos de ${family.name}`); card.append(actionLink);
      target.append(card);
    }
    $('#collectionCount').textContent = `${matches.length} ${matches.length === 1 ? 'família' : 'famílias'} de produtos. Condições sob consulta.`;
    $('#collectionEmpty').hidden = matches.length > 0;
  }
  function setModel(id) {
    selected = catalog.models.find(model => model.id === id && model.familyId === group.id);
    if (!selected) return;
    image($('#detailImage'),selected,'(min-width:900px) 45vw, 90vw');
    $('#detailTitle').textContent = selected.title;
    $('#detailDescription').textContent = selected.description;
    document.title = `${selected.title} | UP Personaliza`;
    document.querySelector('meta[name=description]').content=selected.description;
    referencePrices();
  }
  function saveDraft() {
    if (!selected) return;
    try { sessionStorage.setItem(draftKey,JSON.stringify({familyId:group.id,modelId:selected.id,fields:Object.fromEntries(new FormData($('#consultForm')))})); }
    catch { $('#consultStatus').textContent = 'O rascunho não pôde ser salvo neste navegador. Você pode preparar a consulta nesta página.'; }
  }
  function updateQuantity() {
    const quantity = Number($('#consultForm').elements.quantity.value);
    const unit = group.unit === 'kit' ? (quantity === 1 ? 'kit' : 'kits') : (quantity === 1 ? 'unidade' : 'unidades');
    $('#quantityHint').textContent = `${Number.isInteger(quantity) && quantity > 0 ? `${quantity} ${unit} na consulta. ` : ''}Quantidade e condições serão confirmadas no orçamento.`;
    referencePrices();
  }
  function showProduct(family) {
    group = family;
    $('#collectionView').hidden = true; $('#productView').hidden = false;
    $('#detailCategory').textContent = group.intent;
    const models = catalog.models.filter(model => model.familyId === group.id);
    const form = $('#consultForm');
    $('#kitComposition').hidden = group.unit !== 'kit';
    for (const name of ['stirrersPerKit','markersPerKit']) { form.elements[name].required = group.unit === 'kit'; form.elements[name].disabled = group.unit !== 'kit'; }
    $('#quantityLabel').textContent = group.unit === 'kit' ? 'Quantidade desejada de kits' : 'Quantidade desejada de unidades';
    for (const model of models) {
      const label = document.createElement('label'); label.className = 'collection-model-option';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'model'; radio.value = model.id;
      radio.checked = model === models[0];
      const thumbnail = document.createElement('img'); thumbnail.src = model.images[0].src; thumbnail.alt = ''; thumbnail.width = 400; thumbnail.height = 400;
      const text = document.createElement('span'); text.textContent = model.label;
      radio.addEventListener('change', () => { setModel(model.id); saveDraft(); $('#consultResult').hidden = true; });
      label.append(radio,thumbnail,text); $('#modelOptions').append(label);
    }
    const requestedModel=new URL(location.href).searchParams.get('modelo');
    setModel(models.some(model=>model.id===requestedModel)?requestedModel:models[0].id);
    form.querySelector(`input[value="${selected.id}"]`).checked=true;
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey));
      if (draft?.familyId === group.id && !requestedModel) {
        if (models.some(model => model.id === draft.modelId)) { setModel(draft.modelId); form.querySelector(`input[value="${draft.modelId}"]`).checked = true; }
        for (const [key,value] of Object.entries(draft.fields || {})) if (key !== 'model' && form.elements[key] && typeof value === 'string') form.elements[key].value = value;
      }
    } catch { /* The form remains usable without a stored draft. */ }
    updateQuantity();
    form.addEventListener('input', event => {
      event.target.setCustomValidity?.(''); updateQuantity(); saveDraft(); $('#consultResult').hidden = true;
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      if (group.unit === 'kit') form.elements.markersPerKit.setCustomValidity(Number(fields.stirrersPerKit) + Number(fields.markersPerKit) > 0 ? '' : 'Informe ao menos uma peça por kit.');
      const cep = fields.postalCode.replace(/\D/g,'');
      form.elements.postalCode.setCustomValidity(!cep || cep.length === 8 ? '' : 'Informe os 8 dígitos do CEP.');
      if (!form.reportValidity()) return;
      const single = Number(fields.quantity) === 1;
      const unit = group.unit === 'kit' ? (single ? 'kit' : 'kits') : (single ? 'unidade' : 'unidades');
      const lines = ['Olá! Quero consultar um projeto de personalizados da UP Personaliza.',`Produto: ${selected.title}`,`Referência: ${selected.sku} — ${selected.label}`,`Quantidade desejada: ${fields.quantity} ${unit}`];
      if (group.unit === 'kit') lines.push(`Em cada kit: ${fields.stirrersPerKit} mexedores e ${fields.markersPerKit} marcadores.`);
      for (const [key,label] of Object.entries({personalization:'Personalização',finish:'Cor ou acabamento desejado',dimensions:'Medidas desejadas',postalCode:'CEP',notes:'Observações'})) if (fields[key]?.trim()) lines.push(`${label}: ${fields[key].trim()}`);
      lines.push('Peço confirmação de produção, materiais, medidas, composição, disponibilidade, preço e prazo. Esta consulta não é uma compra concluída.');
      $('#requestText').value = lines.join('\n');
      $('#registerRequest').href=`/orcamento.html?produto=${encodeURIComponent(selected.id)}`;
      if (contact.whatsapp) { $('#sendWhatsapp').href = `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`; $('#sendWhatsapp').hidden = false; }
      if (contact.email) { $('#sendEmail').href = `mailto:${contact.email}?subject=${encodeURIComponent(`Consulta ${selected.sku} — ${selected.title}`)}&body=${encodeURIComponent(lines.join('\n'))}`; $('#sendEmail').hidden = false; }
      $('#consultResult').hidden = false; $('#consultStatus').textContent = 'Consulta preparada. Confira e envie à loja.';
      $('#requestTitle').tabIndex = -1; $('#requestTitle').focus(); saveDraft();
    });
    $('#copyRequest').addEventListener('click',async () => {
      try { await navigator.clipboard.writeText($('#requestText').value); $('#copyStatus').textContent = 'Consulta copiada. Envie pelo canal de atendimento da loja.'; }
      catch { $('#requestText').focus(); $('#requestText').select(); $('#copyStatus').textContent = 'Selecione e copie o texto acima para enviar à loja.'; }
    });
  }
  fetch('/api/storefront').then(response => response.ok ? response.json() : {}).then(value => { contact = {whatsapp:String(value.whatsapp || '').replace(/\D/g,''),email:value.email || ''}; }).catch(() => {});
  for (const name of filters) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name; button.setAttribute('aria-pressed',String(name === category));
    button.addEventListener('click',() => { category = name; for (const item of $('#collectionFilters').children) item.setAttribute('aria-pressed',String(item === button)); renderCards(); });
    $('#collectionFilters').append(button);
  }
  $('#collectionSearch').addEventListener('input',event => { search = normalize(event.target.value.trim()); renderCards(); });
  const id = new URL(location.href).searchParams.get('produto');
  const family = catalog.groups.find(group => group.id === id);
  if (family) showProduct(family); else renderCards();
})();
