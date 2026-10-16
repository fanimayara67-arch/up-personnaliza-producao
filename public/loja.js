(() => {
  const config = fetch('/api/storefront',{cache:'no-store'}).then(response => response.ok ? response.json() : {}).catch(()=>({}));
  window.UP_STOREFRONT = config;
  config.then(value => {
    for(const node of document.querySelectorAll('[data-business]')) {
      if(!value.business)continue;
      let content=value.business[node.dataset.business];
      if(node.dataset.business==='cnpj' && content)content=content.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/,'$1.$2.$3/$4-$5');
      node.hidden=!content;
      if(content) node.textContent=(node.dataset.business==='cnpj'?'CNPJ: ':'')+content;
    }
    for(const node of document.querySelectorAll('[data-contact-whatsapp]')) {
      node.hidden=!value.whatsapp;
      if(value.whatsapp) node.href=`https://wa.me/${value.whatsapp}`;
    }
    for(const node of document.querySelectorAll('[data-contact-email]')) {
      node.hidden=!value.email;
      if(value.email) {node.href=`mailto:${encodeURIComponent(value.email).replace(/%40/g,'@')}`;node.textContent=value.email;}
    }
  });
  const input=document.querySelector('#siteSearch');
  if(input && window.UP_SEARCH) {
    const target=document.createElement('div');target.className='shop-typeahead';target.id='searchSuggestions';target.setAttribute('aria-label','Sugestões de produtos');
    document.querySelector('.search-inner').append(target);
    input.setAttribute('aria-controls',target.id);
    input.addEventListener('input',()=>{
      target.replaceChildren(); if(!input.value.trim())return;
      for(const item of window.UP_SEARCH.find(input.value).slice(0,5)) {const link=document.createElement('a');link.href=item.href;link.textContent=item.title;target.append(link);}
      const all=document.createElement('a');all.href=`/buscar.html?q=${encodeURIComponent(input.value.trim())}`;all.textContent='Ver todos os resultados';target.append(all);
    });
  }
  const grid=document.querySelector('#homeCollectionGrid');
  if(grid && window.UP_PERSONALIZADOS) {
    for(const group of window.UP_PERSONALIZADOS.groups.slice(0,6)) {
      const model=window.UP_PERSONALIZADOS.models.find(model=>model.familyId===group.id);
      if(!model)continue;
      const link=document.createElement('a');link.href=`/personalizados.html?produto=${encodeURIComponent(group.id)}`;
      const img=document.createElement('img');img.src=model.images[0].src;img.alt=model.alt;img.width=400;img.height=400;img.loading='lazy';
      const name=document.createElement('strong');name.textContent=group.name;link.append(img,name);grid.append(link);
    }
  }
  document.querySelector('#clearLocalDrafts')?.addEventListener('click',()=>{
    if(!window.confirm('Apagar o carrinho e os rascunhos salvos neste navegador? Solicitações já enviadas à loja não serão apagadas.'))return;
    try {
      for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.startsWith('cvt-') || key.startsWith('up-inquiry-') || key.startsWith('up-product-draft-') || key==='up-personalizados-consultation' || key==='up-custom-project')storage.removeItem(key);
      document.querySelector('#clearDraftStatus').textContent='Carrinho e rascunhos deste navegador apagados.';
    }catch{document.querySelector('#clearDraftStatus').textContent='Não foi possível apagar tudo. Use as opções de armazenamento do navegador.';}
  });
  const observe=(name,data={})=>window.dispatchEvent(new CustomEvent('up-store-event',{detail:{name,...data}}));
  const zoomImage=document.querySelector('[data-zoom],#detailImage');
  if(zoomImage) {
    const trigger=document.createElement('button');trigger.type='button';trigger.className='shop-muted-button';trigger.textContent='Ampliar imagem';
    zoomImage.closest('figure').append(trigger);
    trigger.addEventListener('click',()=>{
      const dialog=document.createElement('dialog');dialog.className='shop-zoom';dialog.setAttribute('aria-label','Imagem ampliada do produto');
      const close=document.createElement('button');close.type='button';close.className='shop-muted-button';close.textContent='Fechar imagem';
      const img=document.createElement('img');img.src=zoomImage.getAttribute('src');img.alt=zoomImage.alt;
      close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();});
      dialog.append(close,img);document.body.append(dialog);dialog.showModal();close.focus();
    });
  }
  // Local integration hook: no analytics SDK or personal data is sent to a third party.
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(link?.getAttribute('href')?.startsWith('/orcamento.html'))observe('quote_open');});
})();
