(() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').trim();
  const aliases = {fachada:'fachada letreiro logo loja negocio',adesivo:'adesivacao vinil vitrine parede decoracao',luminoso:'luz iluminado luminoso letreiro',impressao:'banner lona painel impresso evento',sinalizacao:'placa orientacao identificacao sinalizacao'};
  const records = () => [
    ...(window.CVT_PRODUCTS || []).map(item => ({id:item.id,title:item.name,description:item.teaser,type:'service',image:item.image,alt:item.imageAlt || item.name,href:`/#produto=${encodeURIComponent(item.id)}`,keywords:aliases[item.id] || '',category:item.category})),
    ...(window.UP_PERSONALIZADOS?.models || []).map(item => ({id:item.id,title:item.title,description:item.description,type:'custom',image:item.images[0].src,alt:item.alt,href:`/personalizados.html?produto=${encodeURIComponent(item.familyId)}&modelo=${encodeURIComponent(item.id)}`,keywords:`${item.sku} ${item.label} ${window.UP_PERSONALIZADOS.groups.find(group => group.id === item.familyId)?.intent || ''}`,category:'Presentes e personalizados'})),
  ];
  const stop = new Set(['de','do','da','dos','das','para','com','em','e','a','o','um','uma']);
  const tokens = query => normalize(query).split(/\s+/).filter(token => token && !stop.has(token));
  const find = (query,type='all') => {
    const terms = tokens(query);
    return records().filter(item => (type === 'all' || item.type === type) && terms.every(term => normalize(`${item.title} ${item.description} ${item.keywords}`).includes(term) || (term.length>3 && normalize(`${item.title} ${item.description} ${item.keywords}`).includes(term.replace(/s$/,'')))));
  };
  window.UP_SEARCH = {normalize,records:()=>records().map(item=>({...item,href:`/produtos/${encodeURIComponent(item.id)}.html`})),find:(query,type)=>find(query,type).map(item=>({...item,href:`/produtos/${encodeURIComponent(item.id)}.html`}))};
})();

