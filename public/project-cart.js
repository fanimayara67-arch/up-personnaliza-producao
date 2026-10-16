(() => {
  const target = document.querySelector('#projectItems');
  const notes = document.querySelector('#projectNotes');
  const error = document.querySelector('#projectErrors');
  const notice = document.querySelector('#projectNotice');
  const continueLink = document.querySelector('#projectContinue');
  function showError(message) { error.hidden = !message; error.textContent = message; }
  function referencePrice(product,count) {
    const price = product.referencePricing;
    return price ? `Referência dos produtos: ${CVT_STORE.money(count * (count >= price.bulkMinimumQuantity ? price.bulkUnitCents : price.retailCents))}. Entrega e condições finais a confirmar.` : 'Preço sob orçamento.';
  }
  function render() {
    const items = UP_PROJECT.all();
    target.replaceChildren();
    document.querySelector('#projectEmpty').hidden = items.length > 0;
    document.querySelector('#projectCount').textContent = `${items.length} ${items.length === 1 ? 'item selecionado' : 'itens selecionados'}. A loja confirmará as condições do projeto.`;
    continueLink.hidden = !items.length || items.length > UP_PROJECT.maxItems;
    if (items.length > UP_PROJECT.maxItems) showError('Seu orçamento tem mais de 20 itens. Remova alguns para enviar esta solicitação.');
    items.forEach((row,index) => {
      const product = UP_COMMERCE.products.find(item => item.id === row.productId);
      const article = document.createElement('article'); article.className = 'store-cart-item';
      const image = document.createElement('img'); image.src = product.cardImage.src; image.alt = ''; image.width = 120; image.height = 120;
      const content = document.createElement('div'), heading = document.createElement('h2'), link = document.createElement('a');
      link.href = '/produtos/' + product.id + '.html'; link.textContent = product.title; heading.append(link);
      const summary = document.createElement('p'); summary.textContent = UP_PROJECT.summary(row) || 'Personalização a confirmar com a loja.';
      const edit = document.createElement('a'); edit.className = 'store-text-link'; edit.href = link.href + '?line=' + encodeURIComponent(row.key); edit.textContent = 'Editar personalização';
      const label = document.createElement('label'); label.className = 'shop-field'; label.textContent = product.unit === 'kit' ? 'Quantidade de kits' : 'Quantidade de unidades';
      const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = row.type === 'service' ? '99' : '10000'; input.step = '1'; input.inputMode = 'numeric'; input.value = row.quantity; input.setAttribute('aria-label','Quantidade de ' + product.title);
      const price = document.createElement('p'); price.className = 'store-cart-price'; price.textContent = referencePrice(product,row.quantity);
      input.addEventListener('change',() => {
        try {
          UP_PROJECT.setQuantity(row.key,input.value);
          row.quantity = Number(input.value); input.value = row.quantity;
          input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); showError('');
          price.textContent = referencePrice(product,row.quantity);
          notice.textContent = `Quantidade de ${product.title} atualizada para ${row.quantity}. ${price.textContent}`;
        } catch (failure) {
          input.value = row.quantity; input.setAttribute('aria-invalid','true'); input.setAttribute('aria-describedby','projectErrors');
          showError(failure.message + ' A quantidade anterior foi mantida.');
        }
      });
      label.append(input);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'shop-muted-button'; remove.textContent = 'Remover'; remove.setAttribute('aria-label','Remover ' + product.title);
      remove.addEventListener('click',() => {
        try {
          UP_PROJECT.remove(row.key); showError(''); render();
          const remaining = target.querySelectorAll('input[type=number]');
          (remaining[Math.min(index,remaining.length - 1)] || document.querySelector('#projectEmpty a')).focus();
          notice.textContent = `${product.title} removido do orçamento.`;
        } catch (failure) { showError(failure.message); }
      });
      content.append(heading,summary,edit,label,price); article.append(image,content,remove); target.append(article);
    });
  }
  try { notes.value = sessionStorage.getItem('cvt-project-notes') || ''; } catch { /* Optional notes. */ }
  notes.addEventListener('input',() => {
    try { sessionStorage.setItem('cvt-project-notes',notes.value); }
    catch { showError('Não foi possível guardar as observações. Copie o texto para a próxima etapa.'); }
  });
  window.addEventListener('storage',event => { if (event.key === 'cvt-cart' || event.key === null) render(); });
  continueLink.href = '/orcamento.html?origem=projeto';
  render();
})();
