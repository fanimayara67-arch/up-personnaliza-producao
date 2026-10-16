import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {readCatalog,buildPublicCatalog} from '../lib/catalog-repository.js';
import {validateCatalog} from '../lib/catalog-management.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.join(root,'work/cracha-navio-2026-10-16/UP-Personaliza-Site-Cracha-ao-Navio');
const source=JSON.parse(await fs.readFile(path.join(sourceRoot,'integracao/catalogo-rodada2.json'),'utf8'));
const snapshot=await readCatalog(root),data=structuredClone(snapshot.data),at=new Date().toISOString();
const groups={sinalizacao:{id:'up-identificacao-personalizada',name:'Identificação personalizada',intent:'Empresas e identificação',storeCategoryId:'sinalizacao'},natal:{id:'up-natal',name:'Natal personalizado',intent:'Natal',slug:'natal'},utilidades:{id:'up-utilidades',name:'Utilidades personalizadas',intent:'Casa e decoração',slug:'utilidades'},decoracao:{id:'up-decoracao',name:'Decoração personalizada',intent:'Casa e decoração',slug:'decoracao'}};
const copies=new Map(),added=[],skipped=[];
function images(image){
 const base=path.basename(image.src).replace(/-(400|800|1254)\.webp$/,'');
 if(!/^[a-z0-9-]+$/.test(base)||!/^\/assets\/rodada-cracha-navio\/(sinalizacao|natal|utilidades|decoracao)\//.test(image.src))throw new Error('Invalid source image');
 return [400,800,1254].map(width=>{
  const relative=path.posix.dirname(image.src)+`/${base}-${width}.webp`,src=`/assets/catalogo-personalizados/r2-${base}-${width}.webp`;
  copies.set(src,path.join(sourceRoot,'public',relative.slice(1)));return {src,width,height:width};
 });
}
for(const [index,row]of source.products.entries()){
 if(data.models.some(model=>model.id===row.id)){skipped.push(row.id);continue;}
 if(!row.id.startsWith('up-r2-')||!groups[row.categorySlug])throw new Error('Unexpected source product');
 const group=groups[row.categorySlug],variants=row.variants.map(variant=>({id:variant.id,label:variant.label,configuration:variant.configuration||{},alt:variant.detail.alt,images:images(variant.detail)}));
 const current=variants.find(variant=>variant.id===row.defaultVariant);
 const configurationFields=row.configurationFields.map(field=>({key:field.key,label:field.label,type:field.key==='notes'?'textarea':field.type,required:field.required,placeholder:field.placeholder||'',...(field.choices?{choices:field.choices.map(({value,label})=>({value,label}))}:{})}));
 const model={id:row.id,familyId:group.id,sku:`UP-R2-${String(index+1).padStart(3,'0')}`,label:row.subcategory,title:row.name.replace(' — ',': '),description:row.description,alt:row.imageAlt,images:current.images,imageKind:'illustrative_mockup',productionStatus:'prototype_to_validate',stock:{quantity:null,verifiedAt:null,source:null},specifications:{material:null,dimensionsMm:null,productionDays:null,piecesPerKit:null},cost:{unitCents:null,setupCents:null,fixedFeeCents:null,paymentFeeBps:null,taxBps:null,targetContributionBps:null},pricingPlan:{retailCents:null,tiers:[],status:'draft'},pricingResearch:{status:'not_researched',retailTargetCents:null,bulkTargets:[],sources:[]},approvedOffers:[],unit:row.id.includes('-kit-')?'kit':'unit',configurationFields,variants,defaultVariant:row.defaultVariant,importSource:'cracha-navio-2026-10-16',updatedAt:at};
 data.models.push(model);added.push({id:model.id,sku:model.sku,title:model.title,variants:variants.length});
}
for(const [category,definition]of Object.entries(groups)){
 const models=data.models.filter(model=>model.familyId===definition.id);if(!models.length)continue;
 let group=data.groups.find(group=>group.id===definition.id);
 if(!group){group={...definition,modelIds:[],cover:models[0].images.at(-1).src,unit:'unit'};data.groups.push(group);}
 group.modelIds=models.map(model=>model.id);
}
if(data.models.some(model=>model.sku==='UP-PERS-02'||model.sku==='UP-MD-001'||model.id==='cartoes'))throw new Error('A discontinued product was reintroduced');
validateCatalog(data);
for(const source of copies.values())await fs.access(source);
const summary={mode:process.argv.includes('--apply')?'apply':'preview',added,skipped,assets:copies.size,totalModels:data.models.length,groups:data.groups.length,referencePrices:data.models.filter(model=>model.providedPricing).length,checkoutOffers:data.models.reduce((sum,model)=>sum+model.approvedOffers.length,0)};
console.log(JSON.stringify(summary,null,2));
if(!process.argv.includes('--apply')||!added.length)process.exit(0);
const lockFile=path.join(root,'catalog/.personalizados.lock'),lock=await fs.open(lockFile,'wx');
try{
 const current=await readCatalog(root);if(current.revision!==snapshot.revision)throw new Error('Catalog changed; rerun preview');
 await fs.copyFile(path.join(root,'catalog/personalizados.json'),path.join(root,`work/cracha-navio-2026-10-16/catalog-before-${Date.now()}.json`));
 for(const [destination,source]of copies)await fs.copyFile(source,path.join(root,'public',destination.slice(1)));
 data.updatedAt=at;const temporary=path.join(root,`catalog/personalizados.${randomUUID()}.tmp`);
 await fs.writeFile(temporary,JSON.stringify(data,null,2)+'\n');await fs.rename(temporary,path.join(root,'catalog/personalizados.json'));
 await buildPublicCatalog(root,data);
 await fs.mkdir(path.join(root,'catalog/imports'),{recursive:true});
 await fs.writeFile(path.join(root,'catalog/imports/cracha-navio-2026-10-16.json'),JSON.stringify({...summary,at,archive:'UP-Personaliza-Site-Cracha-ao-Navio.zip',sourceHash:createHash('sha256').update(JSON.stringify(source)).digest('hex'),pricing:'No prices or physical stock were provided; quotation only.'},null,2)+'\n');
}finally{await lock.close();await fs.rm(lockFile);}
