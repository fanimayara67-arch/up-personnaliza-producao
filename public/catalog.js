const CVT_CONFIGURATION_FIELDS = {
  fachada:[{ key:'widthCm', label:'Largura do letreiro (cm)', type:'number', required:true },{ key:'heightCm', label:'Altura do letreiro (cm)', type:'number', required:true },{ key:'application', label:'Local da fachada', placeholder:'Ex.: frente de loja' },{ key:'notes', label:'Texto ou identificação do letreiro' }],
  adesivo:[{ key:'widthCm', label:'Largura do adesivo (cm)', type:'number', required:true },{ key:'heightCm', label:'Altura do adesivo (cm)', type:'number', required:true },{ key:'application', label:'Superfície de aplicação', placeholder:'Ex.: vidro ou parede' },{ key:'notes', label:'Descrição da arte e do recorte' }],
  luminoso:[{ key:'widthCm', label:'Largura do letreiro (cm)', type:'number', required:true },{ key:'heightCm', label:'Altura do letreiro (cm)', type:'number', required:true },{ key:'application', label:'Local do letreiro luminoso' },{ key:'notes', label:'Texto e detalhes da iluminação' }],
  impressao:[{ key:'widthCm', label:'Largura da impressão (cm)', type:'number', required:true },{ key:'heightCm', label:'Altura da impressão (cm)', type:'number', required:true },{ key:'application', label:'Aplicação do impresso', placeholder:'Ex.: campanha ou evento' },{ key:'notes', label:'Detalhes do arquivo e acabamento' }],
  sinalizacao:[{ key:'widthCm', label:'Largura da placa (cm)', type:'number', required:true },{ key:'heightCm', label:'Altura da placa (cm)', type:'number', required:true },{ key:'usage', label:'Ambiente de uso', choices:[{ value:'interno', label:'Interno' },{ value:'externo', label:'Externo' }] },{ key:'notes', label:'Texto ou orientação da placa' }],
};
window.CVT_PRODUCTS = Object.freeze([
  { id:'fachada', name:'Fachadas e letreiros', category:'Fachadas', image:'/assets/real/bel-fachada-card-1200.webp', badge:'Sob medida', teaser:'Personalize as medidas e a identificação.', description:'Personalize a identificação do seu ponto comercial. Informe as medidas, o local da fachada e o texto ou nome que a peça deve apresentar.', options:['Medidas e identificação personalizadas','Aplicação conforme o ambiente','Confira preço e disponibilidade da configuração'] },
  { id:'adesivo', name:'Adesivos para ambientes', category:'Adesivos', image:'/assets/real/mural-adesivo-card-672.webp', badge:'Ambientes', teaser:'Escolha medidas, superfície e arte.', description:'Configure o adesivo para sua vitrine, parede ou ambiente. Informe as medidas, a superfície e os detalhes da arte e do recorte.', options:['Medidas e descrição do recorte','Superfície de aplicação','Confira preço e disponibilidade da configuração'] },
  { id:'luminoso', name:'Letreiros luminosos', category:'Fachadas', image:'/assets/real/studio-l-card-1200.webp', badge:'Iluminação', teaser:'Configure as medidas e a identificação.', description:'Personalize a identificação iluminada do seu negócio. Informe as dimensões, o local e os detalhes do letreiro.', options:['Medidas e identificação personalizadas','Detalhes do local e da iluminação','Confira preço e disponibilidade da configuração'] },
  { id:'impressao', name:'Impressão em grande formato', category:'Impressos', image:'/assets/real/palco-feira-card-800.webp', badge:'Grande formato', teaser:'Defina tamanho, quantidade e aplicação.', description:'Configure uma impressão de grande formato para vitrines, campanhas ou eventos. Informe tamanho, quantidade e detalhes do arquivo e da aplicação.', options:['Medidas e quantidade','Detalhes do arquivo e da aplicação','Confira preço e disponibilidade da configuração'] },
  { id:'sinalizacao', name:'Sinalização de espaços', category:'Sinalização', image:'/assets/real/aurea-portrait-900.webp', badge:'Orientação', teaser:'Personalize medidas e orientação das placas.', description:'Personalize placas para identificar ambientes e orientar a circulação. Informe as medidas, o ambiente de uso e o conteúdo da sinalização.', options:['Medidas e conteúdo das placas','Uso interno ou externo','Confira preço e disponibilidade da configuração'] }
].map(product => {
  const media = window.UP_REAL_MEDIA.products[product.id];
  return {
    ...product,
    image:media.src, imageAlt:media.alt, imageSrcSet:media.srcset,
    imageWidth:media.width, imageHeight:media.height,
    imageFit:media.fit, imagePosition:media.position,
    imageKind:media.imageKind, imageDetail:media.detail,
    configurationFields:CVT_CONFIGURATION_FIELDS[product.id]
  };
}));
