/* Quote project. Personal text stays in the current browser session. */
(() => {
  const storageKey = 'up-custom-project';
  const catalog = window.UP_COMMERCE;
  const maxItems = 20;
  const fields = {personalization:180, finish:120, dimensions:120, stirrersPerKit:5, markersPerKit:5, notes:1500};
  const labels = {personalization:'Personalização', finish:'Cor/acabamento', dimensions:'Medidas', stirrersPerKit:'Mexedores por kit', markersPerKit:'Marcadores por kit', notes:'Observações'};
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const isQuantity = (value, max = 10000) => ['number','string'].includes(typeof value) && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= max;
  const product = (id,type) => catalog.products.find(row => row.id === id && row.type === type);
  const definitions = id => product(id,'custom')?.fields || Object.entries(fields).map(([key,maxLength]) => ({key,label:labels[key],maxLength}));
  const cleanFields = (value,id) => Object.fromEntries(definitions(id).map(field => [field.key,['string','number'].includes(typeof value?.[field.key]) ? String(value[field.key]).slice(0,field.maxLength || (field.key==='notes'?1500:field.key==='names'?600:180)) : '']));

  function readCustom() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(saved)) return [];
      const seen = new Set(), items = [];
      for (const row of saved) {
        if (!row || !product(row.productId,'custom') || !uuid.test(row.key) || seen.has(row.key) || !isQuantity(row.quantity)) continue;
        seen.add(row.key);
        items.push({key:row.key, productId:row.productId, quantity:Number(row.quantity), fields:cleanFields(row.fields,row.productId)});
        if (items.length === maxItems) break;
      }
      return items;
    } catch { return []; }
  }

  function changed() { window.dispatchEvent(new CustomEvent('up-project-change')); }
  function writeCustom(items) { sessionStorage.setItem(storageKey,JSON.stringify(items)); changed(); }
  function all() {
    return [
      ...window.CVT_STORE.readCart().map(row => ({key:row.lineId, productId:row.id, quantity:row.quantity, configuration:row.configuration, type:'service'})),
      ...readCustom().map(row => ({...row, type:'custom'})),
    ];
  }
  function checkEdit(items, productId, editKey) {
    const existing = items.find(row => row.key === editKey && row.productId === productId);
    if (editKey && !existing) throw new Error('Este item foi removido do orçamento. Abra o produto novamente para criar uma nova configuração.');
    if (!existing && items.length >= maxItems) throw new Error('Reúna até 20 itens por solicitação. Envie este orçamento antes de começar outro.');
    return existing;
  }
  function addCustom(productId, values, count, editKey) {
    if (!product(productId,'custom') || !isQuantity(count)) throw new Error('Confira o produto e a quantidade.');
    const existing = checkEdit(all(),productId,editKey), items = readCustom();
    const row = {key:existing?.key || crypto.randomUUID(), productId, quantity:Number(count), fields:cleanFields(values,productId)};
    for(const field of product(productId,'custom').fields || []) {
      const value=row.fields[field.key].trim();
      if(field.required&&!value)throw new Error(`Preencha ${field.label.toLocaleLowerCase('pt-BR')}.`);
      if(value&&field.choices&&!field.choices.some(choice=>choice.value===value))throw new Error(`Confira ${field.label.toLocaleLowerCase('pt-BR')}.`);
      if(value&&field.type==='number'&&(!Number.isFinite(Number(value))||Number(value)<=0||(field.key==='piecesPerKit'&&(!Number.isInteger(Number(value))||Number(value)>1000))))throw new Error(`Confira ${field.label.toLocaleLowerCase('pt-BR')}.`);
    }
    if(summary({...row,type:'custom'}).length>2000)throw new Error('Resuma as observações para enviar todos os detalhes no mesmo orçamento.');
    if (existing) items[items.findIndex(item => item.key === existing.key)] = row;
    else items.push(row);
    writeCustom(items);
    return row.key;
  }
  function addService(productId, configuration, count, editKey) {
    if (!product(productId,'service') || !isQuantity(count,99) || !CVT_STORE.validConfiguration(productId,configuration)) throw new Error('Confira as medidas, as opções e a quantidade do produto.');
    const existing = checkEdit(all(),productId,editKey);
    const cart = CVT_STORE.addConfigured(productId,configuration,Number(count),existing?.key);
    changed();
    return existing?.key || cart.at(-1).lineId;
  }
  function setQuantity(key, count) {
    const item = all().find(row => row.key === key);
    if (!item) throw new Error('Este item já foi removido. Atualize a página para conferir seu orçamento.');
    if (!isQuantity(count,item.type === 'service' ? 99 : 10000)) throw new Error(`Informe uma quantidade inteira entre 1 e ${item.type === 'service' ? 99 : 10000}.`);
    if (item.type === 'custom') {
      const items = readCustom(); items.find(row => row.key === key).quantity = Number(count); writeCustom(items);
    } else {
      const items = CVT_STORE.readCart(); items.find(row => row.lineId === key).quantity = Number(count); CVT_STORE.writeCart(items); changed();
    }
  }
  function remove(key) {
    const item = all().find(row => row.key === key);
    if (!item) return;
    if (item.type === 'custom') writeCustom(readCustom().filter(row => row.key !== key));
    else { CVT_STORE.writeCart(CVT_STORE.readCart().filter(row => row.lineId !== key)); changed(); }
  }
  function summary(row) {
    if (row.type === 'service') return CVT_STORE.summary({id:row.productId, configuration:row.configuration});
    return definitions(row.productId).filter(field => row.fields?.[field.key]).map(field => `${field.label}: ${field.choices?.find(choice=>choice.value===row.fields[field.key])?.label || row.fields[field.key]}`).join(' · ');
  }
  window.UP_PROJECT = {all, readCustom, addCustom, addService, setQuantity, remove, summary, changed, maxItems,
    requestItems:() => all().map(row => ({key:row.key, productId:row.productId, quantity:row.quantity, configuration:summary(row)}))};
})();
