import fs from 'node:fs/promises';
import path from 'node:path';

export function formatCnpj(value='') {
  const normalized=String(value).toUpperCase().replace(/[.\/\s-]/g,'');
  return /^[A-Z0-9]{12}\d{2}$/.test(normalized)
    ? normalized.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/,'$1.$2.$3/$4-$5') : '';
}
export async function readBusinessIdentity(root) {
  try {return JSON.parse(await fs.readFile(path.join(root,'catalog','store-profile.json'),'utf8'));}
  catch(error) {if(error.code==='ENOENT')return {};throw error;}
}
export function renderBusinessFooter(html,profile) {
  const cnpj=formatCnpj(profile.cnpj);
  const line=`<p class="shop-business-cnpj" data-business="cnpj"${cnpj?'':' hidden'}>${cnpj?'CNPJ: '+cnpj:''}</p>`;
  return html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,footer=>{
    const existing=/<(p|span)\b[^>]*data-business="cnpj"[^>]*>[\s\S]*?<\/\1>/gi;
    if(existing.test(footer))return footer.replace(existing,line);
    return footer.replace(/<\/footer>$/i,`<div class="container shop-business">${line}</div></footer>`);
  });
}
export async function syncBusinessFooters(root,profile) {
  let changed=0;
  async function visit(directory) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())await visit(file);
      else if(entry.isFile()&&entry.name.endsWith('.html')) {
        const previous=await fs.readFile(file,'utf8'),next=renderBusinessFooter(previous,profile);
        if(next!==previous){await fs.writeFile(file,next);changed++;}
      }
    }
  }
  await visit(path.join(root,'public'));
  return changed;
}
