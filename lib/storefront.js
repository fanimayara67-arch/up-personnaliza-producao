import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from './commerce.js';
import { localAdminAllowed } from './catalog-admin.js';
import { HttpError,fail,json,readJson } from './http.js';
import { syncBusinessFooters } from './business-footer.js';

const fields = ['legalName','cnpj','address','city','state','whatsapp','email','businessHours','serviceArea','productionPolicy'];
export async function readStoreProfile(root) {
  let source;
  try { source=await fs.readFile(path.join(root,'catalog','store-profile.json'),'utf8'); }
  catch(error) { if(error.code!=='ENOENT') throw error; source='{}'; }
  const value=JSON.parse(source);
  return {profile:Object.fromEntries(fields.map(key=>[key,typeof value[key]==='string'?value[key]:''])),revision:hash(source)};
}
export function createStorefront({root,settings,inquiries,environment=process.env}) {
  return { async handle(req,res,url) {
    if (!['/api/storefront','/api/admin/store-profile'].includes(url.pathname)) return false;
    try {
      const current=await readStoreProfile(root);
      if(url.pathname==='/api/storefront') {
        if(req.method!=='GET') fail(405,'method_not_allowed','Método não permitido.');
        return json(res,200,{business:current.profile,whatsapp:(current.profile.whatsapp||settings().whatsapp).replace(/\D/g,''),email:current.profile.email||settings().email,inquiryReady:await inquiries.ready()});
      }
      if(!localAdminAllowed(req,settings(),environment)) fail(404,'not_found','Página não encontrada.');
      if(req.method==='GET') return json(res,200,current);
      if(req.method!=='PUT') fail(405,'method_not_allowed','Método não permitido.');
      if(req.headers.origin!==`http://${req.headers.host}`) fail(403,'invalid_origin','Use o painel local.');
      const value=await readJson(req);
      if(value?.revision!==current.revision) fail(409,'profile_changed','Os dados foram alterados em outra janela. Recarregue.');
      if(!value.profile || Object.keys(value.profile).some(key=>!fields.includes(key))) fail(400,'invalid_profile','Confira os dados da empresa.');
      const profile={};
      for(const key of fields) {
        const text=value.profile[key] ?? '';
        if(typeof text!=='string' || text.length>1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail(400,'invalid_profile','Confira os dados da empresa.');
        profile[key]=text.trim();
      }
      profile.cnpj=profile.cnpj.toUpperCase().replace(/[.\/\s-]/g,''); profile.whatsapp=profile.whatsapp.replace(/\D/g,''); profile.email=profile.email.toLowerCase();
      if(profile.cnpj && !/^[A-Z0-9]{12}\d{2}$/.test(profile.cnpj)) fail(400,'invalid_profile','O CNPJ deve ter 14 posições; os dois últimos caracteres são dígitos.');
      if(profile.whatsapp && !/^\d{10,13}$/.test(profile.whatsapp)) fail(400,'invalid_profile','Confira o número de WhatsApp com DDD e código do país.');
      if(profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail(400,'invalid_profile','Confira o e-mail de atendimento.');
      const file=path.join(root,'catalog','store-profile.json');
      // Serialize profile writes through an exclusive file lock and check the revision again.
      let lock;
      try {lock=await fs.open(file+'.lock','wx');} catch(error) {if(error.code==='EEXIST') fail(409,'profile_busy','Outro processo está salvando. Tente novamente.'); throw error;}
      try {
        if((await readStoreProfile(root)).revision!==value.revision) fail(409,'profile_changed','Os dados mudaram. Recarregue antes de salvar.');
        await fs.writeFile(file+'.tmp',JSON.stringify(profile,null,2)+'\n'); await fs.rename(file+'.tmp',file);
        await syncBusinessFooters(root,profile);
      } finally {await lock.close(); await fs.rm(file+'.lock',{force:true});}
      return json(res,200,await readStoreProfile(root));
    } catch(error) {return json(res,error instanceof HttpError?error.status:503,{error:error instanceof HttpError?error.message:'Não foi possível carregar os dados da loja.'});}
  }};
}
