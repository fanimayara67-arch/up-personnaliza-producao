(() => {
  const $=id=>document.getElementById(id),labels={new:'Nova',reviewing:'Em análise',quoted:'Orçamento enviado',closed:'Encerrada'};
  async function load() {
    $('status').textContent='Carregando solicitações…';$('requests').replaceChildren();
    try {
      const response=await fetch('/api/admin/inquiries',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);
      $('status').textContent=`${result.items.length} solicitações mais recentes. Os contatos são privados.`;
      for(const item of result.items) {
        const panel=document.createElement('article');panel.className='readiness';
        const title=document.createElement('h2');title.textContent=`${item.reference} · ${item.purpose==='quote'?'Orçamento':'Atendimento'}`;
        const contact=document.createElement('p');contact.textContent=`${item.customer.name} · ${item.customer.phone||item.customer.email}${item.customer.email&&item.customer.phone?' · '+item.customer.email:''}`;
        const date=document.createElement('p');date.textContent=`Recebida em ${new Date(item.created_at).toLocaleString('pt-BR')} · ${labels[item.status]}`;
        const list=document.createElement('ul');for(const product of item.items){const li=document.createElement('li');li.textContent=`${product.quantity} ${product.unit==='kit'?'kits':'un.'} · ${product.title}${product.configuration?' · '+product.configuration:''}`;list.append(li);}
        const details=document.createElement('p');details.textContent=[item.details.city,item.details.postalCode,item.details.desiredDate,item.details.notes].filter(Boolean).join(' · ');
        const actions=document.createElement('div');actions.className='section-heading';
        for(const [value,label]of Object.entries(labels)){
          const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=item.status===value;
          button.addEventListener('click',async()=>{
            button.disabled=true;
            try{const r=await fetch(`/api/admin/inquiries/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:value,updatedAt:item.updated_at})});const body=await r.json();if(!r.ok)throw new Error(body.error);await load();}
            catch(error){$('status').textContent=error.message;button.disabled=false;}
          });actions.append(button);
        }
        panel.append(title,contact,date,list,details,actions);$('requests').append(panel);
      }
      if(!result.items.length){const p=document.createElement('p');p.textContent='Nenhuma solicitação registrada. Os novos envios aparecerão aqui.';$('requests').append(p);}
    }catch(error){$('status').textContent=error.message||'Não foi possível carregar.';}
  }
  $('refresh').addEventListener('click',load);load();
})();
