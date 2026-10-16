/* Shared cart: prices always come from the server; personal text stays in the session. */
window.CVT_STORE = (() => {
  const products = () => window.CVT_PRODUCTS || [];
  const quantity = value => Math.min(99, Math.max(1, Number.parseInt(value, 10) || 1));
  const parse = (storage, key, fallback) => {
    try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const money = cents => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(cents / 100);
  const validConfiguration = (id, configuration) => {
    if (!configuration || typeof configuration !== 'object') return false;
    const fields = products().find(product => product.id === id)?.configurationFields || [];
    return fields.length > 0 && fields.filter(field => field.required).every(field => field.type === 'number'
      ? Number.isFinite(configuration[field.key]) && configuration[field.key] > 0
      : typeof configuration[field.key] === 'string' && configuration[field.key].trim().length > 0);
  };
  function readCart() {
    const raw = parse(localStorage, 'cvt-cart', null);
    const legacy = parse(localStorage, 'cvt-quote', []);
    const source = Array.isArray(raw) ? raw : Array.isArray(legacy) ? legacy.map(id => ({ id, quantity:1 })) : [];
    const saved = parse(sessionStorage, 'cvt-configurations', {});
    const ids = new Set();
    const available = source.filter(item => item && products().some(product => product.id === item.id));
    const cart = available.map((item, index) => {
      let lineId = typeof item.lineId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.lineId) ? item.lineId : `legacy-${item.id}-${index}`;
      if (ids.has(lineId)) lineId = crypto.randomUUID();
      ids.add(lineId);
      const configuration = saved?.[lineId] || item.configuration;
      return { id:item.id, lineId, quantity:quantity(item.quantity), configuration:configuration && typeof configuration === 'object' && !Array.isArray(configuration) ? configuration : null };
    });
    try {
      // Remove discontinued products from persisted carts without changing active configurations.
      if (available.length !== source.length) { writeCart(cart); localStorage.removeItem('cvt-quote'); }
      sessionStorage.removeItem('cvt-card-config');
    } catch { /* The filtered in-memory cart remains safe when storage is unavailable. */ }
    return cart;
  }
  function writeCart(cart) {
    const configurations = {};
    const serialized = cart.filter(item => products().some(product => product.id === item.id)).map(item => {
      item.quantity = quantity(item.quantity);
      configurations[item.lineId] = item.configuration;
      const keys = ['widthCm','heightCm','usage'];
      const safe = item.configuration ? Object.fromEntries(keys.filter(key => Object.hasOwn(item.configuration, key)).map(key => [key, item.configuration[key]])) : null;
      return { id:item.id, lineId:item.lineId, quantity:item.quantity, configuration:safe };
    });
    sessionStorage.setItem('cvt-configurations', JSON.stringify(configurations));
    localStorage.setItem('cvt-cart', JSON.stringify(serialized));
  }
  function addConfigured(id, configuration, count = 1, editLineId = null) {
    if (!products().some(product => product.id === id)) throw new Error('Produto indisponível.');
    const cart = readCart();
    const existing = editLineId && cart.find(item => item.lineId === editLineId && item.id === id);
    if (existing) { existing.configuration = configuration; existing.quantity = quantity(count); }
    else cart.push({ id, lineId:crypto.randomUUID(), quantity:quantity(count), configuration });
    writeCart(cart);
    return cart;
  }
  function summary(item) {
    const value = item.configuration;
    if (!validConfiguration(item.id, value)) return 'Personalização pendente';
    const product = products().find(product => product.id === item.id);
    return (product?.configurationFields || []).map(field => {
      const fieldValue = value[field.key];
      if (fieldValue == null || fieldValue === '') return '';
      const label = field.choices?.find(choice => choice.value === fieldValue)?.label || fieldValue;
      return `${field.label}: ${label}${field.type === 'number' ? ' cm' : ''}`;
    }).filter(Boolean).join(' · ');
  }
  function fieldsHtml(product, configuration = {}, prefix = '', attributes = '') {
    return product.configurationFields.map(field => {
      const value = configuration?.[field.key] ?? '';
      const common = `name="${field.key}" id="${prefix}${field.key}" data-config-field="${field.key}" ${field.required ? 'required' : ''} ${attributes}`;
      const control = field.choices
        ? `<select ${common}><option value="">Escolha</option>${field.choices.map(choice => `<option value="${choice.value}" ${value === choice.value ? 'selected' : ''}>${choice.label}</option>`).join('')}</select>`
        : `<input ${common} type="${field.type || 'text'}" ${field.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : 'maxlength="300"'} value="${escape(value)}" placeholder="${escape(field.placeholder || '')}">`;
      return `<label class="checkout-field"><span>${field.label}${field.required ? '' : ' (opcional)'}</span>${control}</label>`;
    }).join('');
  }
  function readFields(form, product) {
    return Object.fromEntries(product.configurationFields.map(field => {
      const input = form.querySelector(`[data-config-field="${field.key}"]`);
      return [field.key, field.type === 'number' ? (input?.value ? Number(input.value) : null) : (input?.value.trim() || '')];
    }));
  }
  async function price(item) {
    if (!validConfiguration(item.id, item.configuration)) return { status:'invalid', message:'Complete a personalização para conferir o preço.' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/price', { method:'POST', headers:{ 'Content-Type':'application/json' }, signal:controller.signal, body:JSON.stringify({ productId:item.id, quantity:item.quantity, configuration:item.configuration }) });
      if (!response.ok) return { status:'unavailable', message:'Não foi possível conferir o preço. Tente novamente.' };
      const result = await response.json();
      if (result.status === 'available' && Number.isSafeInteger(result.totalCents) && result.totalCents > 0 && result.currency === 'BRL') return result;
      return { status:'unavailable', message:'Preço sob orçamento para esta configuração. Envie seu projeto para avaliação.' };
    } catch { return { status:'unavailable', message:'Não foi possível conferir o preço. Tente novamente.' }; }
    finally { clearTimeout(timeout); }
  }
  const priceText = quote => quote?.status === 'available' ? `${money(quote.totalCents)} · total do item` : quote?.message || 'Conferindo preço…';
  const editUrl = item => `/produtos/${encodeURIComponent(item.id)}.html?line=${encodeURIComponent(item.lineId)}`;
  const clear = () => {
    localStorage.removeItem('cvt-cart');
    localStorage.removeItem('cvt-quote');
    for (const key of ['cvt-configurations','cvt-card-config','cvt-item-briefs','cvt-address-draft','cvt-project-notes']) sessionStorage.removeItem(key);
  };
  return { readCart, writeCart, addConfigured, validConfiguration, summary, fieldsHtml, readFields, price, priceText, money, escape, editUrl, clear };
})();
