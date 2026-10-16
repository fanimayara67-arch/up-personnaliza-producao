(() => {
 const node=document.querySelector('[data-pdp]'),form=document.querySelector('#pdpForm');if(!node||!form)return;
 const product=UP_COMMERCE.products.find(p=>p.id===node.dataset.pdp),parameters=new URL(location.href).searchParams;
 let editKey=parameters.get('line'),busy=false;
 let current=UP_PROJECT.all().find(row=>row.key===editKey&&row.productId===product.id);
 const draftName=line=>'up-product-draft-'+product.id+(line?'-line-'+line:'');
 const snapshot=row=>row?{...(row.type==='service'?row.configuration:row.fields),quantity:row.quantity}:null;
 let draftKey=draftName(editKey),baseSnapshot=JSON.stringify(snapshot(current));
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 let draft,saved;try{saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{/* Usable without saved drafts. */}
 if(saved?.version===1&&saved.base===baseSnapshot&&object(saved.fields))draft=saved.fields;
 else if(!editKey&&object(saved)&&!saved.version)draft=saved;
 if(!draft&&!editKey&&product.type==='custom'){try{const legacy=JSON.parse(sessionStorage.getItem('up-personalizados-consultation')||'null');if(legacy?.modelId===product.id&&object(legacy.fields))draft=legacy.fields;}catch{/* Optional legacy draft. */}}
 const values=draft||snapshot(current);
 if(values&&typeof values==='object')for(const [key,value]of Object.entries(values)){const field=form.elements.namedItem(key);if(field&&['string','number'].includes(typeof value))field.value=value;}
 function showError(message){const errors=document.querySelector('#pdpErrors');errors.textContent=message;errors.hidden=false;errors.focus();}
 if(editKey&&!current){const errors=document.querySelector('#pdpErrors');errors.textContent='Este item foi removido do orçamento. ';const restart=document.createElement('a');restart.href=location.pathname;restart.textContent='Começar uma nova configuração';errors.append(restart);errors.hidden=false;}
 if(current)form.querySelector('[type=submit]').firstChild.textContent='Salvar alterações ';
 function estimate(){const reference=product.referencePricing,count=Number(form.elements.quantity.value),target=document.querySelector('#pdpEstimate');target.textContent=reference&&Number.isSafeInteger(count)&&count>0&&count<=10000?`Referência dos produtos: ${count} × ${CVT_STORE.money(count>=reference.bulkMinimumQuantity?reference.bulkUnitCents:reference.retailCents)} = ${CVT_STORE.money(count*(count>=reference.bulkMinimumQuantity?reference.bulkUnitCents:reference.retailCents))}. Entrega e condições finais no orçamento.`:'';}
 form.addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');event.target.removeAttribute('aria-describedby');document.querySelector('#pdpAdded').hidden=true;estimate();try{sessionStorage.setItem(draftKey,JSON.stringify({version:1,base:baseSnapshot,fields:Object.fromEntries(new FormData(form))}));}catch{/* Saving the product will report an unavailable browser store. */}});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;
  const invalid=[...form.querySelectorAll('input,textarea,select')].filter(field=>!field.checkValidity());for(const field of invalid)field.setAttribute('aria-invalid','true');
  const count=Number(form.elements.quantity.value),values=Object.fromEntries(new FormData(form)),errors=document.querySelector('#pdpErrors');
  let message=invalid.length?'Confira: '+invalid.map(field=>field.closest('label')?.firstChild.textContent.trim()||'quantidade').join(', ')+'.':'';
  for(const field of invalid)field.setAttribute('aria-describedby','pdpErrors');
  if(product.unit==='kit'&&Number(values.stirrersPerKit)+Number(values.markersPerKit)<=0)message='Informe ao menos uma peça na composição de cada kit.';
  if(product.type==='custom'&&UP_PROJECT.summary({type:'custom',productId:product.id,fields:values}).length>2000)message='Resuma um pouco as observações para enviar todos os detalhes do produto no mesmo orçamento.';
  if(message){errors.textContent=message;errors.hidden=false;errors.focus();return;}errors.hidden=true;
  busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try {
   const wasEditing=Boolean(editKey),previousDraftKey=draftKey;
   if(product.type==='service'){
    const original=CVT_PRODUCTS.find(p=>p.id===product.id),configuration=CVT_STORE.readFields(form,original);
    editKey=UP_PROJECT.addService(product.id,configuration,count,editKey);
   }else editKey=UP_PROJECT.addCustom(product.id,values,count,editKey);
   current=UP_PROJECT.all().find(row=>row.key===editKey&&row.productId===product.id);
   baseSnapshot=JSON.stringify(snapshot(current));draftKey=draftName(editKey);
   try{sessionStorage.removeItem(previousDraftKey);sessionStorage.removeItem(draftKey);}catch{/* The product is already saved; optional draft cleanup must not report failure. */}
   submit.firstChild.textContent='Salvar alterações ';
   const url=new URL(location.href);url.searchParams.set('line',editKey);history.replaceState(null,'',url);
   const result=document.querySelector('#pdpAdded');result.querySelector('strong').textContent=wasEditing?'Alterações salvas no orçamento.':'Produto adicionado ao orçamento.';result.hidden=false;result.focus();
  }catch(error){showError(error.message||'Não foi possível guardar suas escolhas neste navegador. Tente novamente.');}
  finally{busy=false;submit.disabled=false;}
 });
 if(product.variants?.length){
  function showVariant(variant,fill=false){
   if(!variant)return;
   if(fill)for(const [key,value]of Object.entries(variant.configuration)){const field=form.elements.namedItem(key);if(field){field.value=value;field.removeAttribute('aria-invalid');}}
   const image=document.querySelector('.pdp-gallery img[data-zoom]'),largest=variant.images.at(-1);
   image.src=largest.src;image.srcset=variant.images.map(image=>`${image.src} ${image.width}w`).join(', ');image.width=largest.width;image.height=largest.height;image.alt=variant.alt;
   for(const button of document.querySelectorAll('[data-variant-id]'))button.setAttribute('aria-pressed',String(button.dataset.variantId===variant.id));
   const status=document.querySelector('#pdpVariantStatus');if(status)status.textContent='Modelo: '+variant.label;
  }
  const selected=()=>product.variants.find(variant=>Object.entries(variant.configuration).length&&Object.entries(variant.configuration).every(([key,value])=>form.elements.namedItem(key)?.value===value));
  const fromUrl=!current&&product.variants.find(variant=>variant.id===parameters.get('variante'));
  showVariant(fromUrl||selected()||product.variants.find(variant=>variant.id===product.defaultVariant),true);
  form.addEventListener('input',()=>showVariant(selected()));
  for(const button of document.querySelectorAll('[data-variant-id]'))button.addEventListener('click',()=>{const variant=product.variants.find(variant=>variant.id===button.dataset.variantId);showVariant(variant,true);form.dispatchEvent(new Event('input',{bubbles:true}));});
 }
 estimate();
})();
