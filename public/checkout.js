const products = window.CVT_PRODUCTS;
const store = window.CVT_STORE;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const productById = new Map(products.map(product => [product.id, product]));
const paymentNames = { pix:'Pix', card:'Cartão de crédito', boleto:'Boleto bancário' };
let cart = store.readCart();
const quotes = new Map();
let priceSequence = 0;
let submitting = false;
const itemBriefs = {};
let step = 0;
let paymentMethod = 'pix';
let config = { whatsapp:'', email:'' };
let cepTimer;
let lastLookedUpCep = '';
let briefPriceTimer;
let deliveryQuote = null;
let deliveryError = '';

try { Object.assign(itemBriefs, JSON.parse(sessionStorage.getItem('cvt-item-briefs') || '{}')); } catch { /* campos podem ser preenchidos novamente */ }
for (const item of cart) if (!itemBriefs[item.lineId] && itemBriefs[item.id]) itemBriefs[item.lineId] = itemBriefs[item.id];

function saveCart() {
  deliveryQuote = null;
  store.writeCart(cart);
  renderCart();
  renderSummary();
  refreshPrices();
}

function renderCart() {
  const target = $('#checkoutCart');
  target.replaceChildren();
  $('#toAddress').disabled = cart.length === 0 || cart.some(item => !store.validConfiguration(item.id, item.configuration));
  if (!cart.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-cart';
    empty.innerHTML = '<h3>Seu carrinho está vazio.</h3><p>Escolha um produto e personalize para começar.</p><a class="button button-dark" href="/#solucoes">Explorar produtos →</a>';
    target.append(empty);
    return;
  }
  for (const item of cart) {
    const product = productById.get(item.id);
    const row = document.createElement('article');
    row.className = 'checkout-cart-item';
      const installation = ['fachada','adesivo','luminoso','sinalizacao'].includes(item.id) ? `<label>Instalação<select data-item-id="${item.lineId}" data-item-field="installation"><option value="a-definir">A definir</option><option value="necessaria">Preciso de instalação</option><option value="nao-necessaria">Não preciso de instalação</option></select></label>` : '';
      row.innerHTML = `<img src="${product.image}" alt=""><div><span class="item-category">${product.category}</span><h3>${product.name}</h3><p class="item-meta"></p><a class="item-customize-link" href="${store.editUrl(item)}">Editar personalização ↗</a><div class="quantity-picker"><button type="button" data-decrease="${item.lineId}" aria-label="Diminuir ${product.name}">−</button><output aria-label="Quantidade de ${product.name}">${item.quantity}</output><button type="button" data-increase="${item.lineId}" aria-label="Aumentar ${product.name}">+</button></div><div class="item-brief-grid">${store.fieldsHtml(product, item.configuration, `checkout-${item.lineId}-`, `data-line-id="${item.lineId}"`)}${installation}</div><p data-price-line="${item.lineId}" class="item-meta" role="status"></p></div><button type="button" class="remove-item" data-remove="${item.lineId}" aria-label="Remover ${product.name}">Remover</button>`;
      row.querySelector('.item-meta').textContent = store.summary(item);
      for (const input of row.querySelectorAll('[data-item-field]')) input.value = itemBriefs[item.lineId]?.[input.dataset.itemField] || 'a-definir';
    window.UP_REAL_IMAGE(row.querySelector('img'), window.UP_REAL_MEDIA.products[product.id], '(max-width:700px) 68px, 94px', true);
    target.append(row);
    row.querySelector('[data-price-line]').textContent = store.priceText(quotes.get(item.lineId));
  }
}

function renderSummary() {
  const target = $('#summaryItems');
  target.replaceChildren();
  for (const item of cart) {
    const row = document.createElement('div');
    row.className = 'summary-item';
    const name = document.createElement('span');
    name.textContent = productById.get(item.id).name;
    const quantity = document.createElement('strong');
    quantity.textContent = `${item.quantity} un.`;
    row.append(name, quantity);
    target.append(row);
  }
  $('#summaryQty').textContent = cart.reduce((total, item) => total + item.quantity, 0);
  const priced = cart.length > 0 && cart.every(item => quotes.get(item.lineId)?.status === 'available');
  const total = priced ? cart.reduce((sum, item) => sum + quotes.get(item.lineId).totalCents, 0) : null;
  $('#summaryProducts').textContent = total === null ? 'Preço indisponível' : store.money(total);
  $('#summaryTotal').textContent = deliveryQuote ? store.money(deliveryQuote.totalCents) : total === null ? 'Preço indisponível' : store.money(total);
  $('#summaryDelivery').textContent = deliveryQuote ? store.money(deliveryQuote.delivery.totalCents) : 'Não calculada';
  $('#summaryTotalLabel').textContent = deliveryQuote ? 'Total do pedido' : 'Valor dos produtos';
  updateFinishAvailability();
}

async function refreshPrices() {
  deliveryQuote = null;
  const sequence = ++priceSequence;
  quotes.clear();
  renderSummary();
  const results = await Promise.all(cart.map(async item => [item.lineId, await store.price(item)]));
  if (sequence !== priceSequence) return;
  for (const [lineId, quote] of results) {
    quotes.set(lineId, quote);
    const output = document.querySelector(`[data-price-line="${lineId}"]`);
    if (output) output.textContent = store.priceText(quote);
  }
  renderSummary();
}

function changeQuantity(id, difference) {
  const item = cart.find(entry => entry.lineId === id);
  if (!item) return;
  item.quantity = Math.min(99, Math.max(1, item.quantity + difference));
  saveCart();
}

function setStep(next) {
  if (next > 0 && !cart.length) return;
  if (step === 3 && next !== 3) {
    $('#reviewConsent').checked = false;
    updateFinishAvailability();
  }
  step = next;
  $$('.checkout-step').forEach(section => { section.hidden = Number(section.dataset.step) !== step; });
  $$('[data-progress]').forEach(item => {
    const index = Number(item.dataset.progress);
    item.classList.toggle('active', index === step);
    item.classList.toggle('done', index < step);
    if (index === step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  if (step === 3) renderReview();
  window.scrollTo({ top:0, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const heading = $(`[data-step="${step}"] h2`);
  heading.tabIndex = -1;
  heading.focus({ preventScroll:true });
}

function digits(value) { return value.replace(/\D/g, ''); }
function formatCep(value) {
  const raw = digits(value).slice(0, 8);
  return raw.length > 5 ? `${raw.slice(0,5)}-${raw.slice(5)}` : raw;
}
function formatPhone(value) {
  const raw = digits(value).slice(0, 11);
  if (raw.length <= 2) return raw.length ? `(${raw}` : '';
  if (raw.length <= 6) return `(${raw.slice(0,2)}) ${raw.slice(2)}`;
  const localSize = raw.length === 11 ? 5 : 4;
  return `(${raw.slice(0,2)}) ${raw.slice(2,2 + localSize)}-${raw.slice(2 + localSize)}`;
}

async function lookupCep() {
  const cep = digits($('#addressCep').value);
  const status = $('#cepStatus');
  if (cep.length !== 8) { status.textContent = 'Informe os 8 números do CEP.'; return; }
  if (cep === lastLookedUpCep) return;
  $('#cepLookup').disabled = true;
  status.textContent = 'Buscando endereço...';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal:controller.signal });
    if (!response.ok) throw new Error('indisponível');
    const data = await response.json();
    if (cep !== digits($('#addressCep').value)) return;
    if (data.erro) { status.textContent = 'CEP não encontrado. Confira o número ou preencha manualmente.'; return; }
    $('#addressStreet').value = data.logradouro || $('#addressStreet').value;
    $('#addressDistrict').value = data.bairro || $('#addressDistrict').value;
    $('#addressCity').value = data.localidade || $('#addressCity').value;
    $('#addressState').value = data.uf || $('#addressState').value;
    lastLookedUpCep = cep;
    sessionStorage.setItem('cvt-address-draft', JSON.stringify(readAddress()));
    status.textContent = 'Endereço encontrado. Confira os dados e informe o número.';
    if (step === 1) $('#addressNumber').focus();
  } catch { status.textContent = 'Busca indisponível. Preencha o endereço manualmente.'; }
  finally { clearTimeout(timeout); $('#cepLookup').disabled = false; }
}

function validateAddress(showErrors = true) {
  const cep = $('#addressCep');
  const phone = $('#customerPhone');
  const state = $('#addressState');
  cep.setCustomValidity(digits(cep.value).length === 8 ? '' : 'Informe um CEP com 8 números.');
  phone.setCustomValidity([10,11].includes(digits(phone.value).length) ? '' : 'Informe um celular ou telefone com DDD.');
  state.setCustomValidity(/^[a-zA-Z]{2}$/.test(state.value.trim()) ? '' : 'Informe a sigla do estado com 2 letras.');
  return showErrors ? $('#addressForm').reportValidity() : $('#addressForm').checkValidity();
}

function readAddress() {
  return {
    name:$('#customerName').value.trim(), email:$('#customerEmail').value.trim(), phone:$('#customerPhone').value.trim(),
    cep:$('#addressCep').value.trim(), street:$('#addressStreet').value.trim(), number:$('#addressNumber').value.trim(),
    extra:$('#addressExtra').value.trim(), district:$('#addressDistrict').value.trim(), city:$('#addressCity').value.trim(), state:$('#addressState').value.trim().toUpperCase()
  };
}

function renderPaymentDetail() {
  $$('.payment-option').forEach(option => option.classList.toggle('active', option.querySelector('input').checked));
  const descriptions = {
    pix:{ symbol:'◇', title:'Preferência por Pix', copy:'A disponibilidade do Pix é confirmada no pagamento. A loja ainda não emite código ou QR Code de cobrança.' },
    card:{ symbol:'▭', title:'Preferência por cartão', copy:'Condições e disponibilidade são confirmadas no pagamento. Nenhum número de cartão é solicitado nesta página.' },
    boleto:{ symbol:'▥', title:'Preferência por boleto', copy:'A emissão depende de um pagamento disponível. A loja ainda não emite boleto ou informa vencimento de cobrança.' }
  };
  const detail = descriptions[paymentMethod];
  $('#paymentDetail').innerHTML = `<div class="payment-detail-symbol" aria-hidden="true">${detail.symbol}</div><div><h3>${detail.title}</h3><p>${detail.copy}</p></div>`;
}

function reviewBlock(title, body, targetStep) {
  const block = document.createElement('section');
  block.className = 'review-block';
  const header = document.createElement('header');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Editar';
  edit.dataset.editStep = String(targetStep);
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  header.append(heading, edit);
  block.append(header, paragraph);
  return block;
}

function renderReview() {
  const address = readAddress();
  const target = $('#reviewContent');
  target.replaceChildren();
  target.append(
    reviewBlock('Produtos personalizados', cart.map(item => `${item.quantity} × ${productById.get(item.id).name} — ${store.summary(item)}\n${store.priceText(quotes.get(item.lineId))}${briefText(itemBriefs[item.lineId]) ? `\n${briefText(itemBriefs[item.lineId])}` : ''}`).join('\n\n') + ($('#projectDetails').value.trim() ? `\nObservações: ${$('#projectDetails').value.trim()}` : ''), 0),
    reviewBlock('Contato e endereço', `${address.name}\n${address.email} · ${address.phone}\n${address.street}, ${address.number}${address.extra ? `, ${address.extra}` : ''}\n${address.district} · ${address.city}/${address.state} · CEP ${address.cep}`, 1),
    reviewBlock('Preferência de pagamento', `${paymentNames[paymentMethod]}\nA disponibilidade e as condições precisam ser confirmadas na finalização.`, 2)
  );
}

function briefText(brief) {
  if (!brief) return '';
  return [brief.application && `local: ${brief.application}`, brief.measurements && `medidas: ${brief.measurements}`, brief.installation === 'necessaria' && 'com instalação', brief.installation === 'nao-necessaria' && 'sem instalação', brief.notes].filter(Boolean).join(' · ');
}

function checkoutPayload() {
  const address = readAddress();
  return {
    items:cart.map(item => ({ productId:item.id, lineId:item.lineId, quantity:item.quantity, brief:itemBriefs[item.lineId] || null, configuration:item.configuration, priceVersion:quotes.get(item.lineId)?.priceVersion || null })),
    projectNotes:$('#projectDetails').value.trim(),
    customer:{ name:address.name, email:address.email, phone:digits(address.phone) },
    address:{ cep:digits(address.cep), street:address.street, number:address.number, complement:address.extra, district:address.district, city:address.city, state:address.state },
    paymentPreference:paymentMethod,
    checkoutQuote:deliveryQuote ? { priceVersion:deliveryQuote.priceVersion, totalCents:deliveryQuote.totalCents, quoteHash:deliveryQuote.quoteHash } : null,
    currency:'BRL', pricingStatus:cart.every(item => quotes.get(item.lineId)?.status === 'available') ? 'priced' : 'unavailable'
  };
}

function updateFinishAvailability() {
  const priced = cart.length > 0 && cart.every(item => quotes.get(item.lineId)?.status === 'available');
  const available = window.CVT_CHECKOUT?.supportsPurchase === true && typeof window.CVT_CHECKOUT?.submit === 'function';
  const consent = $('#reviewConsent').checked;
  $('#finishCheckout').disabled = submitting || !priced || !available || !deliveryQuote || !consent || cart.some(item => !store.validConfiguration(item.id, item.configuration));
  $('#quoteDelivery').disabled = submitting || !priced || !available || !validateAddress(false);
  if (!submitting) $('#finishStatus').textContent = !priced ? 'Há produtos sem preço disponível. A compra não pode ser concluída.' : !available ? 'O pagamento online está temporariamente indisponível.' : !deliveryQuote ? (deliveryError || 'Confira a entrega e o total antes de continuar.') : !consent ? 'Confirme os dados antes de continuar para pagamento.' : 'Os valores e as condições serão conferidos novamente antes do pagamento.';
  $('#contactAvailability').hidden = !(config.whatsapp || config.email || (window.CVT_CHECKOUT?.submit && !available));
}

function quoteMessage(payload) {
  const location = payload.address;
  return `Olá! Quero consultar a disponibilidade destas configurações:\n${payload.items.map(item => {
    const description = store.summary({ id:item.productId, configuration:item.configuration });
    return `• ${item.quantity} × ${productById.get(item.productId).name} — ${description}${briefText(item.brief) ? ` — ${briefText(item.brief)}` : ''}`;
  }).join('\n')}\n\nContato: ${payload.customer.name} · ${payload.customer.email} · ${payload.customer.phone}\nEndereço: ${location.street}, ${location.number}${location.complement ? `, ${location.complement}` : ''}, ${location.district}, ${location.city}/${location.state}, CEP ${location.cep}\nPreferência de pagamento: ${paymentNames[payload.paymentPreference]}${payload.projectNotes ? `\nDetalhes: ${payload.projectNotes}` : ''}\n\nEsta consulta não é uma compra concluída.`;
}

async function finishCheckout() {
  if ($('#finishCheckout').disabled || submitting || !$('#reviewConsent').checked || !cart.length) return;
  if (!validateAddress(false)) { setStep(1); validateAddress(); return; }
  const status = $('#finishStatus');
  const button = $('#finishCheckout');
  submitting = true;
  try {
    button.disabled = true;
    status.textContent = 'Conferindo disponibilidade e preço…';
    const reviewedQuote = deliveryQuote;
    await refreshPrices();
    if (!cart.every(item => quotes.get(item.lineId)?.status === 'available')) throw new Error('O preço de um produto ficou indisponível. Confira o carrinho.');
    const payload = checkoutPayload();
    payload.checkoutQuote = { priceVersion:reviewedQuote.priceVersion, totalCents:reviewedQuote.totalCents, quoteHash:reviewedQuote.quoteHash };
    const result = await window.CVT_CHECKOUT.submit(payload);
    if (!result?.orderId || !result?.redirectUrl) throw new Error('O pagamento não foi confirmado. Seu carrinho foi mantido.');
    const destination = new URL(result.redirectUrl, window.location.href);
    if (destination.protocol !== 'https:' || destination.username || destination.password || (destination.origin !== window.location.origin && !['www.mercadopago.com.br','sandbox.mercadopago.com.br','www.mercadopago.com','sandbox.mercadopago.com'].includes(destination.hostname))) throw new Error('Não foi possível abrir o pagamento. Seu carrinho foi mantido.');
    // Keep the cart until the provider confirms payment; creating checkout is not payment.
    status.textContent = 'Abrindo a etapa de pagamento…';
    window.location.assign(destination.href);
  } catch (error) {
    submitting = false;
    updateFinishAvailability();
    status.textContent = error.message || 'Não foi possível continuar agora. Seu carrinho foi mantido.';
  }
}

async function contactAvailability(event) {
  event.preventDefault();
  if (!$('#reviewConsent').checked) { $('#finishStatus').textContent = 'Confirme os dados antes de consultar disponibilidade.'; $('#reviewConsent').focus(); return; }
  if (!validateAddress(false)) { setStep(1); validateAddress(); return; }
  const payload = checkoutPayload();
  const message = quoteMessage(payload);
  const status = $('#finishStatus');
  if (config.whatsapp) {
    window.open(`https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    status.textContent = 'Envie a mensagem na nova aba para consultar disponibilidade. Seu carrinho foi mantido.';
  } else if (config.email) {
    window.location.href = `mailto:${config.email}?subject=${encodeURIComponent('Disponibilidade de produtos personalizados')}&body=${encodeURIComponent(message)}`;
    status.textContent = 'E-mail preparado para consultar disponibilidade. Seu carrinho foi mantido.';
  } else if (typeof window.CVT_CHECKOUT?.submit === 'function' && !window.CVT_CHECKOUT.supportsPurchase) {
    try {
      const result = await window.CVT_CHECKOUT.submit({ ...payload, requestType:'availability', pricingStatus:'pending_quote' });
      if (!result?.orderId && result?.status !== 'accepted') throw new Error('Sem confirmação');
      status.textContent = 'Consulta recebida pela loja. Isso não conclui uma compra; seu carrinho foi mantido.';
    } catch { status.textContent = 'Não foi possível consultar agora. Seu carrinho foi mantido.'; }
  }
}

$('#checkoutCart').addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  const increase = event.target.closest('[data-increase]');
  const decrease = event.target.closest('[data-decrease]');
  if (remove) {
    cart = cart.filter(item => item.lineId !== remove.dataset.remove);
    delete itemBriefs[remove.dataset.remove];
    sessionStorage.setItem('cvt-item-briefs', JSON.stringify(itemBriefs));
    saveCart();
  }
  else if (increase) changeQuantity(increase.dataset.increase, 1);
  else if (decrease) changeQuantity(decrease.dataset.decrease, -1);
  else return;
  const action = increase ? 'increase' : decrease ? 'decrease' : null;
  const lineId = increase?.dataset.increase || decrease?.dataset.decrease;
  const nextFocus = action
    ? [...$('#checkoutCart').querySelectorAll(`[data-${action}]`)].find(button => button.dataset[action] === lineId)
    : $('#checkoutCart .item-customize-link');
  if (nextFocus) nextFocus.focus({ preventScroll:true });
  else {
    const heading = $('[data-step="0"] h2');
    heading.tabIndex = -1;
    heading.focus({ preventScroll:true });
  }
});
function updateBrief(event) {
  const field = event.target.closest('[data-config-field]');
  if (field) {
    const item = cart.find(item => item.lineId === field.dataset.lineId);
    if (!item) return;
    const productField = productById.get(item.id).configurationFields.find(entry => entry.key === field.dataset.configField);
    item.configuration ||= {};
    item.configuration[field.dataset.configField] = productField.type === 'number' ? (field.value ? Number(field.value) : null) : field.value.trim();
    store.writeCart(cart);
    $('#toAddress').disabled = cart.some(item => !store.validConfiguration(item.id, item.configuration));
    const row = field.closest('.checkout-cart-item');
    row.querySelector('.item-meta').textContent = store.summary(item);
    row.querySelector('[data-price-line]').textContent = 'Conferindo preço…';
    clearTimeout(briefPriceTimer);
    ++priceSequence;
    quotes.delete(item.lineId);
    renderSummary();
    briefPriceTimer = setTimeout(refreshPrices, 180);
    return;
  }
  const target = event.target.closest('[data-item-field]');
  if (!target) return;
  const id = target.dataset.itemId;
  itemBriefs[id] ||= {};
  itemBriefs[id][target.dataset.itemField] = target.value.trim();
  deliveryQuote = null;
  renderSummary();
  sessionStorage.setItem('cvt-item-briefs', JSON.stringify(itemBriefs));
}
$('#checkoutCart').addEventListener('input', updateBrief);
$('#checkoutCart').addEventListener('change', updateBrief);
$('#toAddress').addEventListener('click', () => setStep(1));
$('#toPayment').addEventListener('click', () => { if (validateAddress()) setStep(2); });
async function quoteDelivery() {
  if (!validateAddress()) return;
  const button = $('#toReview');
  button.disabled = true;
  deliveryError = '';
  try {
    if (window.CVT_CHECKOUT?.supportsPurchase && cart.every(item => quotes.get(item.lineId)?.status === 'available')) {
      const payload = checkoutPayload();
      const snapshot = JSON.stringify({ ...payload, checkoutQuote:null });
      const result = await window.CVT_CHECKOUT.quote(payload);
      if (snapshot !== JSON.stringify({ ...checkoutPayload(), checkoutQuote:null })) throw new Error('O pedido mudou. Confira novamente a entrega e o total.');
      deliveryQuote = result;
      renderSummary();
    }
  } catch (error) { deliveryQuote = null; deliveryError = error.message; }
  finally { button.disabled = false; updateFinishAvailability(); }
}
$('#toReview').addEventListener('click', async () => {
  if (!validateAddress()) return;
  setStep(3);
  await quoteDelivery();
});
$('#quoteDelivery').addEventListener('click', quoteDelivery);
$$('[data-back]').forEach(button => button.addEventListener('click', () => setStep(Number(button.dataset.back))));
$('#reviewContent').addEventListener('click', event => { const edit = event.target.closest('[data-edit-step]'); if (edit) setStep(Number(edit.dataset.editStep)); });
$$('input[name="paymentMethod"]').forEach(input => input.addEventListener('change', () => { paymentMethod = input.value; deliveryQuote = null; renderPaymentDetail(); renderSummary(); }));
$('#addressCep').addEventListener('input', event => {
  event.target.value = formatCep(event.target.value);
  event.target.setCustomValidity('');
  lastLookedUpCep = '';
  clearTimeout(cepTimer);
  if (digits(event.target.value).length === 8) cepTimer = setTimeout(lookupCep, 450);
});
$('#cepLookup').addEventListener('click', lookupCep);
$('#customerPhone').addEventListener('input', event => { event.target.value = formatPhone(event.target.value); event.target.setCustomValidity(''); });
$('#addressState').addEventListener('input', event => { event.target.value = event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2); event.target.setCustomValidity(''); });
$('#addressForm').addEventListener('input', () => { deliveryQuote = null; renderSummary(); sessionStorage.setItem('cvt-address-draft', JSON.stringify(readAddress())); });
$('#reviewConsent').addEventListener('change', updateFinishAvailability);
$('#finishCheckout').addEventListener('click', finishCheckout);
$('#contactAvailability').addEventListener('click', contactAvailability);
$('#projectDetails').value = sessionStorage.getItem('cvt-project-notes') || '';
try {
  const savedAddress = JSON.parse(sessionStorage.getItem('cvt-address-draft') || 'null');
  if (savedAddress) {
    for (const [key, id] of Object.entries({ name:'customerName', email:'customerEmail', phone:'customerPhone', cep:'addressCep', street:'addressStreet', number:'addressNumber', extra:'addressExtra', district:'addressDistrict', city:'addressCity', state:'addressState' })) {
      if (typeof savedAddress[key] === 'string') $(`#${id}`).value = savedAddress[key];
    }
  }
} catch { /* endereço pode ser preenchido manualmente */ }
$('#projectDetails').addEventListener('input', event => { deliveryQuote = null; renderSummary(); sessionStorage.setItem('cvt-project-notes', event.target.value); });
const footerYear = $('#year');
if (footerYear) footerYear.textContent = new Date().getFullYear();
renderCart();
renderSummary();
refreshPrices();
renderPaymentDetail();
updateFinishAvailability();
fetch('/api/config').then(response => response.ok ? response.json() : {}).then(value => { config = value; updateFinishAvailability(); }).catch(() => updateFinishAvailability());
window.addEventListener('cvt-checkout-ready', updateFinishAvailability);
window.addEventListener('cvt-order-paid', () => { cart = store.readCart(); saveCart(); });
