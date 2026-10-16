(() => {
 const data=window.UP_COMMERCE,button=document.querySelector('#storeMenuToggle'),menu=document.querySelector('#storeCategoryMenu');
 const input=document.querySelector('#storeSearch'),suggestions=document.querySelector('#storeSuggestions'),search=input?.closest('form');
 function closeMenu(returnFocus=false){if(!menu||!button)return;menu.hidden=true;button.setAttribute('aria-expanded','false');if(returnFocus)button.focus();}
 function closeSuggestions(){if(suggestions)suggestions.hidden=true;}
 function openMenu(){closeSuggestions();menu.hidden=false;button.setAttribute('aria-expanded','true');}
 button?.addEventListener('click',()=>{if(menu.hidden)openMenu();else closeMenu();});
 button?.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();openMenu();menu.querySelector('a')?.focus();}});
 function dismissOutside(target){if(menu&&!menu.hidden&&!menu.contains(target)&&!button.contains(target))closeMenu();if(search&&!search.contains(target))closeSuggestions();}
 document.addEventListener('click',event=>dismissOutside(event.target));
 document.addEventListener('focusin',event=>dismissOutside(event.target));
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(menu&&!menu.hidden){event.preventDefault();closeMenu(true);}
  if(suggestions&&!suggestions.hidden){event.preventDefault();closeSuggestions();if(suggestions.contains(document.activeElement))input.focus();closeSuggestions();}
 });
 function count(){const items=UP_PROJECT.all();for(const node of document.querySelectorAll('[data-project-count]'))node.textContent=items.length;}
 count();window.addEventListener('up-project-change',count);window.addEventListener('storage',count);window.addEventListener('pageshow',count);
 const activeProduct=data.products.find(p=>location.pathname==='/produtos/'+p.id+'.html');
 for(const link of document.querySelectorAll('.store-quick-nav a,#storeCategoryMenu a')){
  if(link.getAttribute('href')===location.pathname)link.setAttribute('aria-current','page');
  else if(activeProduct&&link.getAttribute('href')==='/categorias/'+activeProduct.categorySlug+'.html')link.classList.add('store-current-section');
 }
 if(input&&suggestions){
  input.setAttribute('aria-controls','storeSuggestions');suggestions.setAttribute('role','group');suggestions.setAttribute('aria-label','Sugestões de produtos');
  function renderSuggestions(){
   suggestions.replaceChildren();const value=input.value.trim();suggestions.hidden=!value;if(!value)return;closeMenu();
   const matches=UP_SEARCH.find(value).slice(0,5);
   for(const record of matches){const link=document.createElement('a');link.href=record.href;link.textContent=record.title;suggestions.append(link);}
   const all=document.createElement('a');all.href='/buscar.html?q='+encodeURIComponent(value);all.textContent=matches.length?'Ver todos os resultados':'Buscar no catálogo completo';suggestions.append(all);
  }
  input.addEventListener('input',renderSuggestions);input.addEventListener('focus',renderSuggestions);
  input.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)&&input.value.trim()){event.preventDefault();renderSuggestions();(event.key==='ArrowDown'?suggestions.firstElementChild:suggestions.lastElementChild)?.focus();}});
  suggestions.addEventListener('keydown',event=>{
   if(!['ArrowDown','ArrowUp'].includes(event.key))return;
   event.preventDefault();const links=[...suggestions.querySelectorAll('a')],index=links.indexOf(document.activeElement),next=index+(event.key==='ArrowDown'?1:-1);
   if(next<0||next>=links.length)input.focus();else links[next].focus();
  });
 }
 // Preserve links saved before products gained their own configuration page.
 const parameters=new URL(location.href).searchParams;
 if(location.pathname==='/personalizados.html'&&parameters.has('produto')){const model=data.products.find(p=>p.id===parameters.get('modelo')&&p.familyId===parameters.get('produto')),category=data.categories.find(c=>c.id===parameters.get('produto'));if(model)location.replace('/produtos/'+model.id+'.html');else if(category)location.replace('/categorias/'+category.slug+'.html');}
 if(location.pathname==='/'&&location.hash.startsWith('#produto=')){const values=new URLSearchParams(location.hash.slice(1)),product=data.products.find(p=>p.id===values.get('produto'));if(product){const query=new URLSearchParams();for(const key of ['line','variante'])if(values.has(key))query.set(key,values.get(key));location.replace('/produtos/'+product.id+'.html'+(query.size?'?'+query:''));}}
 if(location.pathname==='/'&&location.hash.startsWith('#categoria=')){const values=new URLSearchParams(location.hash.slice(1)),category=data.categories.find(category=>[category.id,category.slug].includes(values.get('categoria')));if(category)location.replace('/categorias/'+category.slug+'.html');}
})();
