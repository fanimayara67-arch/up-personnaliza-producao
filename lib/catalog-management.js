export function validateCatalog(data) {
  if (data?.version !== 1 || !Array.isArray(data.groups) || !Array.isArray(data.models)) throw new Error('Invalid catalog format.');
  const ids = new Set(); const skus = new Set();
  for (const model of data.models) {
    if (!/^[a-z0-9-]+$/.test(model.id) || ids.has(model.id) || !/^UP-(?:PERS-\d{2}|M[PTX]-\d{3}|R2-\d{3})$/.test(model.sku) || skus.has(model.sku)) throw new Error('Invalid/duplicate model or SKU.');
    ids.add(model.id); skus.add(model.sku);
    if (!model.title?.trim() || !model.description?.trim() || !['ai_generated_product_concept','illustrative_mockup'].includes(model.imageKind)) throw new Error('Missing product content or image origin.');
    if (model.stock.quantity !== null && (!Number.isSafeInteger(model.stock.quantity) || model.stock.quantity < 0)) throw new Error('Stock must be unknown or a non-negative integer.');
    if (model.stock.quantity !== null && (!model.stock.verifiedAt || !model.stock.source?.trim())) throw new Error('Counted stock requires a date and source.');
    const validImage=image=>/^\/assets\/catalogo-personalizados\/[a-z0-9-]+\.webp$/.test(image.src)&&Number.isSafeInteger(image.width)&&image.width>0&&image.width===image.height;
    for (const image of model.images) if (!validImage(image)) throw new Error('Invalid image path or dimensions.');
    if(model.configurationFields){
      if(!Array.isArray(model.configurationFields)||model.configurationFields.length>12)throw new Error('Invalid configuration fields.');
      const keys=new Set();
      for(const field of model.configurationFields){
        if(!/^[a-z][a-zA-Z0-9]{0,39}$/.test(field.key)||['constructor','prototype'].includes(field.key)||keys.has(field.key)||!field.label?.trim()||field.label.length>160||!['text','number','textarea'].includes(field.type)||typeof field.required!=='boolean')throw new Error('Invalid configuration field.');
        keys.add(field.key);
        if(field.choices&&(!Array.isArray(field.choices)||!field.choices.length||field.choices.length>20||new Set(field.choices.map(choice=>choice.value)).size!==field.choices.length||field.choices.some(choice=>typeof choice.value!=='string'||!choice.value||!choice.label?.trim())))throw new Error('Invalid configuration choices.');
      }
    }
    if(model.variants){
      if(!Array.isArray(model.variants)||!model.variants.length||model.variants.length>20||new Set(model.variants.map(variant=>variant.id)).size!==model.variants.length)throw new Error('Invalid product variants.');
      for(const variant of model.variants){
        if(!/^[a-z0-9-]+$/.test(variant.id)||!variant.label?.trim()||variant.images.length!==3||variant.images.some(image=>!validImage(image)))throw new Error('Invalid variant content.');
        for(const [key,value]of Object.entries(variant.configuration||{})){const field=model.configurationFields?.find(field=>field.key===key);if(!field||!field.choices?.some(choice=>choice.value===value))throw new Error('Variant does not match product options.');}
      }
      if(!model.variants.some(variant=>variant.id===model.defaultVariant))throw new Error('Invalid default variant.');
    }
    let previous = 0;
    for (const tier of model.pricingResearch.bulkTargets) {
      if (!Number.isSafeInteger(tier.minimumQuantity) || tier.minimumQuantity <= previous || !Number.isSafeInteger(tier.unitTargetCents) || tier.unitTargetCents <= 0) throw new Error('Invalid quantity-price proposal.');
      previous = tier.minimumQuantity;
    }
    if(model.providedPricing) {
      const price=model.providedPricing;
      if(![price.retailCents,price.bulkUnitCents,price.bulkMinimumQuantity].every(value=>Number.isSafeInteger(value)&&value>0) || price.bulkMinimumQuantity<2 || typeof price.bulkCondition!=='string' || price.mixedModelsAllowed!==false)throw new Error('Invalid owner-provided reference prices.');
    }
  }
  for (const group of data.groups) {
    if (!group.modelIds.length || group.modelIds.some(id => !ids.has(id))) throw new Error('A family references a missing model.');
    for (const id of group.modelIds) if (data.models.find(model => model.id === id).familyId !== group.id) throw new Error('Model-family mismatch.');
  }
  return data;
}
export function minimumOrderPrice(cost, quantity) {
  const cents = ['unitCents','setupCents','fixedFeeCents'];
  const rates = ['paymentFeeBps','taxBps','targetContributionBps'];
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid quantity.');
  if (cents.some(key => !Number.isSafeInteger(cost[key]) || cost[key] < 0) || rates.some(key => !Number.isSafeInteger(cost[key]) || cost[key] < 0)) return null;
  const denominatorBps = 10000 - rates.reduce((sum,key) => sum + cost[key],0);
  if (denominatorBps <= 0) throw new Error('Taxes, fees and contribution target must total less than 100%.');
  const numerator = cost.unitCents * quantity + cost.setupCents + cost.fixedFeeCents;
  if (!Number.isSafeInteger(numerator * 10000)) throw new Error('Calculation exceeds safe range.');
  const totalCents = Math.ceil(numerator * 10000 / denominatorBps);
  return { totalCents, unitCents:Math.ceil(totalCents / quantity) };
}
export function publicCatalog(data) {
  validateCatalog(data);
  return { brand:data.brand, collection:data.collection, groups:data.groups,
    models:data.models.map(({id,familyId,sku,label,title,description,alt,images,imageKind,providedPricing,unit,configurationFields,variants,defaultVariant}) => ({ id,familyId,sku,label,title,description,alt,images,imageKind,
      ...(unit?{unit}:{}),...(configurationFields?{configurationFields,variants,defaultVariant}:{}),
      availability:'consultation', canCheckout:false, price:null,
      ...(providedPricing?{referencePricing:{retailCents:providedPricing.retailCents,bulkMinimumQuantity:providedPricing.bulkMinimumQuantity,bulkUnitCents:providedPricing.bulkUnitCents,bulkCondition:providedPricing.bulkCondition,mixedModelsAllowed:false}}:{}) })) };
}
