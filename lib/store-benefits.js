import {icon} from './storefront-layout.js';

// Public copy is specific to the conditions currently available at this store.
export function storeBenefits() {
 const items=[
  ['print','Impressão com','Qualidade e cuidado','Impressão','Qualidade e cuidado'],
  ['payment','Formas de pagamento','No seu orçamento','Pagamento','Opções no orçamento'],
  ['value','Mais valor para você','Peças avulsas e lotes','Custo-benefício','Peças e lotes'],
  ['delivery','Entrega do seu pedido','Consulte sua região','Entrega','Consulte sua região'],
  ['shield','Em todas as etapas','Clareza e confiança','Em todas as etapas','Clareza e confiança'],
 ];
 const responsiveText=(wide,compact)=>wide===compact?wide:`<span class="store-benefit-wide">${wide}</span><span class="store-benefit-compact">${compact}</span>`;
 return `<section class="store-benefits store-benefits-five" aria-label="Vantagens de planejar seu projeto com a UP Personaliza">${items.map(([symbol,title,text,mobileTitle,mobileText])=>`<div>${icon(symbol)}<span class="store-benefit-copy"><span class="store-benefit-label">${responsiveText(title,mobileTitle)}</span><strong>${responsiveText(text,mobileText)}</strong></span></div>`).join('')}</section>`;
}
