import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalog,buildPublicCatalog } from '../lib/catalog-repository.js';
import { validateCatalog } from '../lib/catalog-management.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const skus=process.argv.slice(2);
if(!skus.length || skus.some(sku=>!/^UP-PERS-\d{2}$/.test(sku)))throw new Error('Informe os SKUs a retirar.');
const lockFile=path.join(root,'catalog','.personalizados.lock');
const lock=await fs.open(lockFile,'wx');
try {
  const {data}=await readCatalog(root);
  const archiveFile=path.join(root,'catalog','retired-personalizados.json');
  const archive=JSON.parse(await fs.readFile(archiveFile,'utf8').catch(error=>{if(error.code==='ENOENT')return '[]';throw error;}));
  const retired=data.models.filter(model=>skus.includes(model.sku));
  if(!retired.length){console.log('Os produtos informados já estão retirados.');}
  else {
    for(const model of retired)archive.push({retiredAt:new Date().toISOString(),reason:'Retirada solicitada pelo proprietário',model});
    data.models=data.models.filter(model=>!skus.includes(model.sku));
    const ids=new Set(data.models.map(model=>model.id));
    data.groups=data.groups.map(group=>({...group,modelIds:group.modelIds.filter(id=>ids.has(id))})).filter(group=>group.modelIds.length);
    // A family cover must remain attached to an active model.
    for(const group of data.groups)if(!data.models.some(model=>model.familyId===group.id && model.images.some(image=>image.src===group.cover)))group.cover=data.models.find(model=>model.id===group.modelIds[0]).images.at(-1).src;
    data.updatedAt=new Date().toISOString();validateCatalog(data);
    await fs.writeFile(archiveFile,JSON.stringify(archive,null,2)+'\n');
    const file=path.join(root,'catalog','personalizados.json');
    await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');await fs.rename(file+'.tmp',file);
    await buildPublicCatalog(root,data);
    console.log(JSON.stringify({retired:retired.map(model=>model.sku),activeModels:data.models.length,families:data.groups.length}));
  }
}finally{await lock.close();await fs.rm(lockFile,{force:true});}
