(() => {
  const $=id=>document.getElementById(id), form=$('quoteForm');
  const parameters=new URL(location.href).searchParams;
  const purpose=parameters.get('tipo')==='atendimento'?'support':'quote';
  const draftKey=`up-inquiry-${purpose}`;
  const modelList=window.UP_PERSONALIZADOS.models;
  const services=window.CVT_PRODUCTS;
  const available=[...services.map(product=>({id:product.id,title:product.name})),...modelList.map(model=>({id:model.id,title:model.title}))];
  let state={items:[],customer:{},details:{}}, sending=false, pendingMemory=null;
  const safeParse=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  const saved=safeParse(draftKey);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  if(saved && Array.isArray(saved.items)) {
    const seen=new Set();
    state={items:saved.items.filter(item=>item&&available.some(product=>product.id===item.productId)).map(item=>{
      const key=typeof item.key==='string'&&/^[a-f0-9-]{36}$/i.test(item.key)&&!seen.has(item.key)?item.key:crypto.randomUUID();seen.add(key);
      const quantity=['number','string'].includes(typeof item.quantity)?Number(item.quantity):NaN;
      return {key,productId:item.productId,quantity:Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=10000?quantity:1,configuration:typeof item.configuration==='string'?item.configuration.slice(0,2000):''};
    }),customer:object(saved.customer),details:object(saved.details)};
  }
  if(purpose==='quote' && (!state.items.length||parameters.get('origem')==='projeto'))state.items=window.UP_PROJECT?window.UP_PROJECT.requestItems():window.CVT_STORE.readCart().map(item=>({key:item.lineId,productId:item.id,quantity:item.quantity,configuration:window.CVT_STORE.summary(item)}));
  if(purpose==='quote'&&parameters.get('origem')==='projeto'){try{state.details.notes=sessionStorage.getItem('cvt-project-notes')||state.details.notes||'';}catch{/* Keep the existing notes. */}}
  const requested=parameters.get('produto');
  if(requested && available.some(product=>product.id===requested) && !state.items.some(item=>item.productId===requested)) {
    const consultation=safeParse('up-personalizados-consultation');
    const fields=consultation?.modelId===requested?consultation.fields||{}:{};
    const configuration=Object.entries({personalization:'Personalização',finish:'Cor/acabamento',dimensions:'Medidas',stirrersPerKit:'Mexedores por kit',markersPerKit:'Marcadores por kit',notes:'Observações'}).filter(([key])=>typeof fields[key]==='string'&&fields[key].trim()).map(([key,label])=>`${label}: ${fields[key].trim()}`).join('\n').slice(0,2000);
    state.items.push({key:crypto.randomUUID(),productId:requested,quantity:Number(fields.quantity)||1,configuration});
    if(fields.postalCode && !state.details.postalCode)state.details.postalCode=fields.postalCode;
  }
  if(purpose==='support') {
    document.title='Atendimento | UP Personaliza';
    $('quoteTitle').textContent='Fale com a UP Personaliza.';
    $('quoteIntro').textContent='Tire dúvidas ou solicite atendimento sobre um orçamento, pedido ou seus dados pessoais.';
    $('quoteItemsSection').hidden=true; $('installationChoice').hidden=true;
    form.elements.notes.required=true; $('notesHelp').textContent='Informe o assunto e a referência do pedido ou orçamento, se houver. Não envie dados de cartão ou documentos pessoais.';
    form.elements.notes.closest('label').firstChild.textContent='Sua mensagem ';
  }
  for(const [key,value]of Object.entries({...state.customer,...state.details})) {const input=form.elements.namedItem(key);if(input && typeof value==='string')input.value=value;}
  function persist() {
    state.customer=Object.fromEntries(['name','email','phone'].map(key=>[key,form.elements.namedItem(key).value]));
    state.details=Object.fromEntries(['postalCode','city','desiredDate','notes'].map(key=>[key,form.elements.namedItem(key).value]));
    state.details.installation=form.elements.installation.value;
    try{sessionStorage.setItem(draftKey,JSON.stringify(state));}catch{$('quoteStatus').textContent='O navegador não guardou o rascunho. Mantenha esta página aberta até concluir.';}
  }
  function renderItems() {
    const target=$('quoteItems'); target.replaceChildren();
    for(const item of state.items) {
      if(!item.key)item.key=crypto.randomUUID();
      const record=available.find(product=>product.id===item.productId);
      const li=document.createElement('li'), title=document.createElement('h3');title.textContent=record.title;
      const quantityLabel=document.createElement('label');quantityLabel.className='shop-field';const model=modelList.find(model=>model.id===item.productId);quantityLabel.textContent=model?.unit==='kit'||model?.familyId==='up-kits-eventos'?'Quantidade de kits':'Quantidade de unidades';
      const quantity=document.createElement('input');quantity.id=`qty-${item.key}`;quantity.type='number';quantity.min='1';quantity.max='10000';quantity.step='1';quantity.required=true;quantity.value=item.quantity;
      quantity.addEventListener('input',()=>{item.quantity=Number(quantity.value);persist();});quantityLabel.append(quantity);
      const configurationLabel=document.createElement('label');configurationLabel.className='shop-field';configurationLabel.textContent='Detalhes e medidas aproximadas (opcional)';
      const configuration=document.createElement('textarea');configuration.rows=3;configuration.maxLength=2000;configuration.value=item.configuration||'';
      configuration.addEventListener('input',()=>{item.configuration=configuration.value;persist();});configurationLabel.append(configuration);
      const remove=document.createElement('button');remove.type='button';remove.className='shop-muted-button';remove.textContent='Retirar deste orçamento';remove.setAttribute('aria-label',`Retirar ${record.title} deste orçamento`);
      remove.addEventListener('click',()=>{const index=state.items.indexOf(item);state.items=state.items.filter(row=>row.key!==item.key);persist();renderItems();const remaining=$('quoteItems').querySelectorAll('input');(remaining[Math.min(index,remaining.length-1)]||$('quoteProductChoices').closest('details').querySelector('summary')).focus();$('quoteStatus').textContent=record.title+' retirado deste orçamento.';});
      li.append(title,quantityLabel,configurationLabel,remove);target.append(li);
    }
    $('quoteProductChoices').closest('details').open=!state.items.length;
    if(!state.items.length){const li=document.createElement('li');li.textContent='Escolha um produto abaixo para começar. Você pode pedir orientação sobre medidas e materiais.';target.append(li);}
  }
  for(const item of available) {
    const button=document.createElement('button');button.type='button';button.className='shop-muted-button';button.textContent=item.title;
    button.addEventListener('click',()=>{if(state.items.length>=20){showErrors(['Reúna até 20 itens por solicitação. Envie este orçamento antes de começar outro.']);return;}state.items.push({key:crypto.randomUUID(),productId:item.id,quantity:1,configuration:''});persist();renderItems();$('quoteItems').lastElementChild.querySelector('input').focus();$('quoteStatus').textContent=item.title+' adicionado ao orçamento.';});
    $('quoteProductChoices').append(button);
  }
  renderItems();
  form.addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');persist();});
  form.addEventListener('change',persist);
  function showErrors(messages) {
    const target=$('quoteErrors');target.replaceChildren();target.hidden=!messages.length;
    if(!messages.length)return;
    const intro=document.createElement('strong');intro.textContent='Confira antes de enviar:';
    const ul=document.createElement('ul');for(const message of messages){const li=document.createElement('li');li.textContent=message;ul.append(li);}target.append(intro,ul);target.focus();
  }
  function validate() {
    const messages=[];
    for(const input of form.querySelectorAll('input,textarea')) {
      input.removeAttribute('aria-invalid');
      if(!input.checkValidity()){input.setAttribute('aria-invalid','true');messages.push(input.name==='consent'?'Autorize o contato para enviar sua solicitação.':`Confira ${input.closest('label')?.firstChild.textContent.trim()||'o campo indicado'}.`);}
    }
    const email=form.elements.email.value.trim(),phone=form.elements.phone.value.replace(/\D/g,'');
    if(!email && !phone){messages.push('Informe e-mail ou celular com DDD para receber a resposta.');form.elements.email.setAttribute('aria-invalid','true');form.elements.phone.setAttribute('aria-invalid','true');}
    if(phone && !/^\d{10,11}$/.test(phone)){messages.push('O celular deve ter DDD e 10 ou 11 dígitos.');form.elements.phone.setAttribute('aria-invalid','true');}
    const cep=form.elements.postalCode.value.replace(/\D/g,'');
    if(cep && cep.length!==8){messages.push('O CEP deve ter 8 dígitos.');form.elements.postalCode.setAttribute('aria-invalid','true');}
    if(purpose==='quote' && !state.items.length)messages.push('Escolha ao menos um produto para o orçamento.');
    if(purpose==='quote' && state.items.length>20)messages.push('Remova alguns produtos para enviar até 20 itens por solicitação.');
    return [...new Set(messages)];
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending)return; persist();
    const errors=validate();showErrors(errors);if(errors.length)return;
    const payload={purpose,customer:state.customer,details:state.details,items:purpose==='support'?[]:state.items.map(({productId,quantity,configuration})=>({productId,quantity,configuration})),consent:form.elements.consent.checked,website:form.elements.website.value};
    if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>32768){showErrors(['A solicitação contém muitos detalhes. Resuma as observações ou divida os produtos em duas solicitações. Seu rascunho foi mantido.']);return;}
    const signature=JSON.stringify(payload), pendingKey=draftKey+'-pending';
    const validPending=value=>value?.signature===signature&&typeof value.key==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.key);
    const storedPending=safeParse(pendingKey);
    const pending=validPending(storedPending)?storedPending:validPending(pendingMemory)?pendingMemory:{signature,key:crypto.randomUUID()};
    pendingMemory=pending;
    try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{/* Reuse this in-memory key for the request. */}
    sending=true;form.querySelectorAll('input,textarea,button').forEach(control=>{control.disabled=true;});form.setAttribute('aria-busy','true');$('quoteStatus').textContent='Registrando sua solicitação…';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:JSON.stringify(payload),signal:controller.signal});
      let result;try{result=await response.json();}catch{throw new Error('A loja retornou uma resposta incompleta. Seu rascunho foi mantido; tente novamente para confirmar o envio.');}
      if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Não foi possível enviar. Tente novamente em instantes.');
      if(result?.status!=='received'||typeof result.reference!=='string'||!/^UP-[A-Z0-9-]{1,64}$/.test(result.reference))throw new Error('A loja ainda não confirmou uma referência válida. Tente novamente para recuperar a mesma solicitação.');
      $('quoteWorkspace').hidden=true;$('quoteSuccess').hidden=false;$('quoteReceipt').textContent=`Sua referência: ${result.reference}.`;$('quoteSuccess').focus();
      try{sessionStorage.removeItem(draftKey);sessionStorage.removeItem(pendingKey);}catch{/* The receipt remains visible. */}
      pendingMemory=null;
      window.dispatchEvent(new CustomEvent('up-store-event',{detail:{name:'inquiry_received',purpose}}));
    }catch(error){const message=error.name==='AbortError'?'A resposta demorou. Seu rascunho foi mantido; tente novamente para recuperar a mesma solicitação.':error instanceof TypeError?'Não foi possível conectar à loja. Confira sua conexão e tente novamente. Seu rascunho foi mantido.':error.message;showErrors([message]);$('quoteStatus').textContent='Não foi possível confirmar o envio. Os detalhes continuam nesta página.';}
    finally{clearTimeout(timeout);sending=false;form.querySelectorAll('input,textarea,button').forEach(control=>{control.disabled=false;});form.removeAttribute('aria-busy');}
  });
})();
