(() => {
  const form=document.querySelector('form'),status=document.querySelector('#status');let revision;
  async function load(){const r=await fetch('/api/admin/store-profile',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);revision=data.revision;for(const [key,value]of Object.entries(data.profile))form.elements.namedItem(key).value=value;status.textContent='Dados carregados. Preencha somente informações confirmadas para divulgação pública.';}
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const r=await fetch('/api/admin/store-profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,profile:Object.fromEntries(new FormData(form))})});const data=await r.json();if(!r.ok)throw new Error(data.error);revision=data.revision;status.textContent='Dados públicos salvos. A loja usa as informações atualizadas.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
  load().catch(error=>{status.textContent=error.message;});
})();
