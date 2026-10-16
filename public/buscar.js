(() => {
  const form = document.querySelector('#catalogSearch');
  const input = form.elements.q;
  let category = 'all';
  input.value = new URL(location.href).searchParams.get('q') || '';
  function render() {
    const items = window.UP_SEARCH.find(input.value,category);
    const target = document.querySelector('#searchResults'); target.replaceChildren();
    document.querySelector('#searchResultCount').textContent = `${items.length} ${items.length===1?'resultado':'resultados'}${input.value.trim() ? ` para “${input.value.trim()}”` : ' no catálogo'}.`;
    for (const item of items) {
      const article = document.createElement('article'); article.className='shop-result';
      const image = document.createElement('img'); image.src=item.image; image.alt=item.alt; image.width=400; image.height=300; image.loading='lazy';
      const heading = document.createElement('h2'); heading.textContent=item.title;
      const note = document.createElement('p'); note.textContent=item.type==='custom'?'Imagem de conceito. Personalização e produção sob consulta.':item.description;
      const link = document.createElement('a'); link.href=item.href; link.textContent='Ver detalhes e personalizar'; link.setAttribute('aria-label',`Ver ${item.title}`);
      article.append(image,heading,note,link); target.append(article);
    }
    document.querySelector('#searchAlternatives').hidden=items.length>0;
  }
  form.addEventListener('submit',event => {event.preventDefault(); const url=new URL(location.href); url.searchParams.set('q',input.value.trim()); history.replaceState(null,'',url); render(); document.querySelector('#searchResultCount').focus();});
  document.querySelectorAll('[data-search-type]').forEach(button => button.addEventListener('click',() => {category=button.dataset.searchType; document.querySelectorAll('[data-search-type]').forEach(item=>item.setAttribute('aria-pressed',String(item===button))); render();}));
  render();
})();
