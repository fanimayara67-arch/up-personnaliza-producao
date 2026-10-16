const products = window.CVT_PRODUCTS;
const store = window.CVT_STORE;

const $ = (selector) => document.querySelector(selector);
const grid = $('#productGrid');
const quoteCount = $('#quoteCount');
const drawer = $('#quoteDrawer');
const overlay = $('#overlay');
const dialog = $('#productDialog');
let activeFilter = 'Todos';
let searchTerm = '';
let lastFocus = null;
let config = { whatsapp:'', email:'', photosEnabled:false };
let cart = store.readCart();
let productPriceSequence = 0;
const inertBackground = new Map();

function setBackgroundInert(active) {
  if (active) {
    for (const element of document.body.children) {
      if (element === drawer || element === overlay || element === dialog || element.tagName === 'SCRIPT') continue;
      inertBackground.set(element, element.inert);
      element.inert = true;
    }
  } else {
    for (const [element, wasInert] of inertBackground) element.inert = wasInert;
    inertBackground.clear();
  }
}
function syncScrollLock() {
  document.body.classList.toggle('locked', dialog.open || drawer.classList.contains('open'));
}
function focusResults() {
  const heading = $('#solucoes h2');
  heading.tabIndex = -1;
  heading.focus({ preventScroll:true });
  $('#solucoes').scrollIntoView();
}

function saveCart(persist = true) {
  if (persist) store.writeCart(cart);
  quoteCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
  renderDrawer();
}
function setFilter(value) {
  activeFilter = value;
  document.querySelectorAll('.filter').forEach(button => {
    const active = button.dataset.filter === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderProducts();
}
function renderProducts() {
  const term = searchTerm.toLocaleLowerCase('pt-BR');
  const visible = products.filter(product => (activeFilter === 'Todos' || product.category === activeFilter) && `${product.name} ${product.category} ${product.teaser}`.toLocaleLowerCase('pt-BR').includes(term));
  grid.replaceChildren();
  for (const product of visible) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `<div class="product-image"><img alt="${product.imageAlt}" loading="lazy"><span class="badge">${product.badge}</span><button type="button" class="quickview" data-view="${product.id}">Personalizar ↗</button></div><div class="product-body"><div><small>${product.category}</small><h3>${product.name}</h3><p>${product.teaser}</p></div><button type="button" data-add="${product.id}" aria-label="Personalizar ${product.name}">↗</button></div>`;
    const imageArea = card.querySelector('.product-image');
    imageArea.classList.add('real-product-image');
    imageArea.dataset.photo = product.id;
    window.UP_REAL_IMAGE(card.querySelector('img'), window.UP_REAL_MEDIA.products[product.id], '(max-width:700px) calc((100vw - 48px) / 2), (max-width:960px) calc((100vw - 76px) / 3), 408px');
    card.querySelector('.quickview').setAttribute('aria-label', `Personalizar ${product.name}`);
    imageArea.addEventListener('click', event => { if (!event.target.closest('button')) showProduct(product.id); });
    grid.append(card);
  }
  $('#resultCount').textContent = `${visible.length} ${visible.length === 1 ? 'produto' : 'produtos'}`;
  $('#emptyState').hidden = visible.length > 0;
}
function addProduct(id) {
  showProduct(id);
}
function showProduct(id, lineId = null) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  const existing = cart.find(item => item.lineId === lineId && item.id === id);
  $('#productDetail').innerHTML = `<div class="product-detail"><img alt="${product.imageDetail.alt}"><div class="detail-copy"><span class="eyebrow">${product.category} / personalize seu produto</span><h2 id="productTitle">${product.name}</h2><p>${product.description}</p><ul>${product.options.map(option => `<li>${option}</li>`).join('')}</ul><form id="productConfigForm"><div class="checkout-fields two-col">${store.fieldsHtml(product, existing?.configuration, 'product-')}</div><label class="checkout-field"><span>Quantidade</span><input name="quantity" type="number" min="1" max="99" step="1" required value="${existing?.quantity || 1}" inputmode="numeric"></label><p id="productPrice" role="status" aria-live="polite">Complete a personalização para conferir o preço.</p><button type="submit" class="button button-dark">${existing ? 'Salvar personalização' : 'Adicionar ao carrinho'} <span aria-hidden="true">↗</span></button></form></div></div>`;
  const form = $('#productConfigForm');
  window.UP_REAL_IMAGE($('#productDetail img'), product.imageDetail, '(max-width:700px) calc(100vw - 30px), 425px');
  let priceTimer;
  let adding = false;
  async function updatePrice() {
    const sequence = ++productPriceSequence;
    const item = { id, quantity:Number(form.elements.quantity.value), configuration:store.readFields(form, product) };
    $('#productPrice').textContent = 'Conferindo preço…';
    const quote = await store.price(item);
    if (sequence === productPriceSequence && form.isConnected) $('#productPrice').textContent = store.priceText(quote);
  }
  function schedulePrice() {
    clearTimeout(priceTimer);
    ++productPriceSequence;
    $('#productPrice').textContent = 'Conferindo preço…';
    priceTimer = setTimeout(() => { if (form.isConnected && dialog.open) updatePrice(); }, 180);
  }
  form.addEventListener('input', event => { event.target.setCustomValidity?.(''); schedulePrice(); });
  form.addEventListener('change', schedulePrice);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (adding) return;
    const configuration = store.readFields(form, product);
    if (!store.validConfiguration(id, configuration)) {
      const invalid = [...form.querySelectorAll('input[type="number"][data-config-field]')].find(input => !Number.isFinite(Number(input.value)) || Number(input.value) <= 0);
      invalid?.setCustomValidity('Informe uma medida maior que zero.');
      form.reportValidity();
      return;
    }
    if (!form.reportValidity()) return;
    adding = true;
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      cart = store.addConfigured(id, configuration, Number(form.elements.quantity.value), existing?.lineId);
      saveCart(false);
    } catch {
      adding = false;
      form.querySelector('button[type="submit"]').disabled = false;
      $('#productPrice').textContent = 'Não foi possível salvar o carrinho neste navegador. Confira o armazenamento e tente novamente.';
      return;
    }
    clearTimeout(priceTimer);
    dialog.close();
    openDrawer();
  });
  dialog.showModal();
  syncScrollLock();
  updatePrice();
}
function openDrawer() {
  if (drawer.classList.contains('open')) return;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  drawer.inert = false;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  setBackgroundInert(true);
  syncScrollLock();
  $('#closeDrawer').focus();
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.inert = true;
  overlay.hidden = true;
  setBackgroundInert(false);
  syncScrollLock();
  $('#contactMessage').textContent = '';
  lastFocus?.focus?.();
}
function renderDrawer() {
  const target = $('#drawerItems');
  target.replaceChildren();
  const needsConfiguration = cart.some(item => !store.validConfiguration(item.id, item.configuration));
  $('#sendQuote').disabled = cart.length === 0;
  $('#sendQuote').firstChild.textContent = 'Pedir orçamento ';
  if (!cart.length) {
    target.innerHTML = '<div class="drawer-empty"><span style="font-size:42px;color:var(--orange)">◇</span><h3>Seu carrinho está vazio</h3><p>Escolha um produto e personalize para começar.</p></div>';
    return;
  }
  for (const item of cart) {
    const product = products.find(entry => entry.id === item.id);
    const row = document.createElement('div');
    row.className = 'drawer-item';
    row.innerHTML = `<img src="${product.image}" alt=""><div><strong>${product.name}</strong><small class="drawer-configuration"></small><small class="drawer-price" role="status"></small><a class="drawer-edit-link" href="${store.editUrl(item)}">Editar personalização ↗</a><div class="drawer-quantity"><button type="button" data-decrease="${item.lineId}" aria-label="Diminuir ${product.name}">−</button><span>${item.quantity}</span><button type="button" data-increase="${item.lineId}" aria-label="Aumentar ${product.name}">+</button></div></div><button type="button" data-remove="${item.lineId}" aria-label="Remover ${product.name}">×</button>`;
    row.querySelector('.drawer-configuration').textContent = store.summary(item);
    window.UP_REAL_IMAGE(row.querySelector('img'), window.UP_REAL_MEDIA.products[product.id], '76px', true);
    row.querySelector('.drawer-edit-link').addEventListener('click', event => { event.preventDefault(); closeDrawer(); showProduct(item.id, item.lineId); });
    row.querySelector('.drawer-price').textContent = 'Conferindo preço…';
    store.price(item).then(quote => { if (row.isConnected) row.querySelector('.drawer-price').textContent = store.priceText(quote); });
    target.append(row);
  }
}
function openCheckout() {
  if (!cart.length) return;
  sessionStorage.setItem('cvt-project-notes', $('#projectNotes').value.trim());
  window.location.href = '/orcamento.html';
}
function renderInspiration(photos) {
  const gallery = $('#inspirationGrid');
  gallery.classList.add('real-gallery-grid');
  gallery.replaceChildren();
  for (const photo of photos.slice(0, 3)) {
    const card = document.createElement('figure');
    card.className = 'inspiration-card real-gallery-card';
    const img = document.createElement('img');
    img.loading = 'lazy';
    window.UP_REAL_IMAGE(img, photo, '(max-width:700px) calc(100vw - 34px), (max-width:960px) 30vw, 408px');
    const caption = document.createElement('figcaption');
    caption.textContent = photo.caption;
    card.append(img, caption);
    gallery.append(card);
  }
}
async function loadConfiguration() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) config = await response.json();
  } catch { /* imagens locais mantêm a vitrine funcional */ }
  $('#inspirationStatus').textContent = '';
}

grid.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  const view = event.target.closest('[data-view]');
  if (add) addProduct(add.dataset.add);
  if (view) showProduct(view.dataset.view);
});
$('#productDetail').addEventListener('click', event => { const add = event.target.closest('[data-add]'); if (add) addProduct(add.dataset.add); });
$('#drawerItems').addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  const increase = event.target.closest('[data-increase]');
  const decrease = event.target.closest('[data-decrease]');
  if (remove) {
    cart = cart.filter(item => item.lineId !== remove.dataset.remove);
  }
  else if (increase) cart.find(item => item.lineId === increase.dataset.increase).quantity = Math.min(99, cart.find(item => item.lineId === increase.dataset.increase).quantity + 1);
  else if (decrease) {
    const item = cart.find(entry => entry.lineId === decrease.dataset.decrease);
    item.quantity = Math.max(1, item.quantity - 1);
  } else return;
  try { saveCart(); }
  catch {
    cart = store.readCart();
    saveCart(false);
    $('#contactMessage').textContent = 'Não foi possível atualizar o carrinho neste navegador. Tente novamente.';
  }
  const action = increase ? 'increase' : decrease ? 'decrease' : null;
  const lineId = increase?.dataset.increase || decrease?.dataset.decrease;
  const nextFocus = action ? [...drawer.querySelectorAll(`[data-${action}]`)].find(button => button.dataset[action] === lineId) : drawer.querySelector('.drawer-edit-link') || $('#closeDrawer');
  nextFocus?.focus({ preventScroll:true });
});
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
document.querySelectorAll('[data-category], [data-nav-filter]').forEach(link => link.addEventListener('click', () => { searchTerm = ''; $('#siteSearch').value = ''; setFilter(link.dataset.category || link.dataset.navFilter); $('#mainNav').classList.remove('open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); }));
$('#resetFilters').addEventListener('click', () => { searchTerm = ''; $('#siteSearch').value = ''; setFilter('Todos'); });
$('#searchToggle').addEventListener('click', () => { const panel = $('#searchPanel'); panel.hidden = !panel.hidden; $('#searchToggle').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) $('#siteSearch').focus(); });
$('#siteSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); window.location.href=`/buscar.html?q=${encodeURIComponent(event.target.value.trim())}`; } });
$('#searchGo').addEventListener('click', () => { window.location.href=`/buscar.html?q=${encodeURIComponent($('#siteSearch').value.trim())}`; });
$('#menuToggle').addEventListener('click', () => { const open = $('#mainNav').classList.toggle('open'); $('#menuToggle').setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('#mainNav a').forEach(link => link.addEventListener('click', () => { $('#mainNav').classList.remove('open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); }));
document.querySelectorAll('#openQuote,#contactQuote,#footerQuote').forEach(button => button.addEventListener('click', openDrawer));
$('#closeDrawer').addEventListener('click', closeDrawer);
$('#closeProduct').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', syncScrollLock);
$('#overlay').addEventListener('click', closeDrawer);
$('#sendQuote').addEventListener('click', openCheckout);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !drawer.classList.contains('open') && !dialog.open) {
    if (!$('#searchPanel').hidden) { $('#searchPanel').hidden = true; $('#searchToggle').setAttribute('aria-expanded','false'); $('#searchToggle').focus(); }
    else if ($('#mainNav').classList.contains('open')) { $('#mainNav').classList.remove('open'); $('#menuToggle').setAttribute('aria-expanded','false'); $('#menuToggle').focus(); }
  }
  if (!drawer.classList.contains('open')) return;
  if (event.key === 'Escape') { closeDrawer(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...drawer.querySelectorAll('button:not([disabled]),textarea:not([disabled]),a[href]')].filter(element => element.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$('#year').textContent = new Date().getFullYear();
$('#projectNotes').value = sessionStorage.getItem('cvt-project-notes') || '';
$('#projectNotes').addEventListener('input', event => sessionStorage.setItem('cvt-project-notes', event.target.value));
renderProducts();
quoteCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
renderDrawer();
drawer.inert = true;
renderInspiration(window.UP_REAL_MEDIA.gallery);
loadConfiguration();
function openProductFromLocation() {
  const query = new URLSearchParams(window.location.hash.slice(1));
  if (query.has('produto')) { if (drawer.classList.contains('open')) closeDrawer(); showProduct(query.get('produto'), query.get('line')); }
}
window.addEventListener('hashchange', openProductFromLocation);
openProductFromLocation();
