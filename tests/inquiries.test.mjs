import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createInquiries, validateInquiry } from '../lib/inquiries.js';
import { createStorefront } from '../lib/storefront.js';
import { readCatalog, readCatalog as snapshot } from '../lib/catalog-repository.js';
import { catalogFixture } from './helpers/catalog-fixture.mjs';
import { loadSettings } from '../lib/settings.js';

const payload=()=>({purpose:'quote',consent:true,website:'',customer:{name:'Cliente de teste',email:'cliente@example.test',phone:''},items:[{productId:'impressao',quantity:3,configuration:'Medidas aproximadas de teste'}],details:{city:'Cidade de teste',postalCode:'',desiredDate:'',installation:'a-definir',notes:''}});
async function harness(t,{production=false,enabled=true,available=true}={}) {
  const fixture=await catalogFixture();t.after(()=>fixture.close());
  const rows=new Map();
  const settings=()=>({supabaseUrl:'https://database.example.test',supabaseKey:'server-secret-only',catalogAdminEnabled:enabled,appUrl:'',whatsapp:'',email:''});
  const database={
    async inquiryReady(){if(!available)throw new Error('offline');return true;},
    async claimInquiry(value){if(!rows.has(value.idempotency_key))rows.set(value.idempotency_key,{...structuredClone(value),status:'new',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return rows.get(value.idempotency_key);},
    async listInquiries(){return [...rows.values()];},
    async updateInquiry(id,status,at){const row=[...rows.values()].find(row=>row.id===id&&row.updated_at===at);if(!row)return null;Object.assign(row,{status,updated_at:new Date(Date.parse(row.updated_at)+1).toISOString()});return row;},
  };
  const environment=production?{NODE_ENV:'production'}:{};
  const inquiries=createInquiries({root:fixture.root,settings,database,environment});
  const storefront=createStorefront({root:fixture.root,settings,inquiries,environment});
  const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');for(const handler of [storefront,inquiries])if(await handler.handle(req,res,url)!==false)return;res.writeHead(404);res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(route,value,headers={},method=value===undefined?'GET':'POST'){
    const response=await fetch(base+route,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},body:value===undefined?undefined:typeof value==='string'?value:JSON.stringify(value)});
    return {status:response.status,body:await response.json()};
  }
  const submit=(value=payload(),key=randomUUID())=>request('/api/inquiries',value,{'Idempotency-Key':key});
  return {root:fixture.root,request,submit,rows};
}
test('quote requests are durable before acknowledgment and retries return one reference without creating orders',async t=>{
  const h=await harness(t),key=randomUUID();
  const one=await h.submit(payload(),key),two=await h.submit(payload(),key);
  assert.equal(one.status,200);assert.equal(one.body.reference,two.body.reference);assert.equal(h.rows.size,1);
  assert.deepEqual(Object.keys(one.body).sort(),['message','reference','status']);
  const changed=payload();changed.items[0].quantity=4;
  assert.equal((await h.submit(changed,key)).status,409);assert.equal(h.rows.size,1);
});
test('a kit keeps its selling unit when it shares a category with individual products',async t=>{
  const h=await harness(t),value=payload();
  value.items=[{productId:'up-r2-kit-porta-copos-colmeia',quantity:2,configuration:'6 porta-copos em cada kit'},{productId:'kit-mexedores-marcadores',quantity:3,configuration:'Composição a confirmar'},{productId:'up-r2-porta-copo-monograma',quantity:12,configuration:'Iniciais AB'}];
  assert.equal((await h.submit(value)).status,200);
  const items=[...h.rows.values()][0].items;
  assert.deepEqual(items.map(item=>item.unit),['kit','kit','unit']);
  assert.deepEqual(items.map(item=>item.quantity),[2,3,12]);
});
test('quote validation rejects retired products, invalid contacts and missing authorization before storage',async t=>{
  const h=await harness(t),catalog=(await readCatalog(h.root)).data;
  for(const id of ['cartoes','porta-bombom-natal','not-a-product']){
    const value=payload();value.items[0].productId=id;assert.throws(()=>validateInquiry(value,catalog),error=>error.code==='invalid_items');
  }
  const invalid=payload();invalid.customer.email='';assert.equal((await h.submit(invalid)).status,400);
  const noConsent=payload();noConsent.consent=false;assert.equal((await h.submit(noConsent)).status,400);
  const badQty=payload();badQty.items[0].quantity=10001;assert.equal((await h.submit(badQty)).status,400);
  const badCep=payload();badCep.details.postalCode='123';assert.equal((await h.submit(badCep)).status,400);
  assert.equal(h.rows.size,0);
});
test('same-origin protection, JSON limits and unavailable storage never produce a false receipt',async t=>{
  const h=await harness(t);
  assert.equal((await h.request('/api/inquiries',payload(),{'Idempotency-Key':randomUUID(),Origin:'https://attacker.example'})).status,403);
  assert.equal((await h.request('/api/inquiries',payload(),{'Idempotency-Key':randomUUID(),'Content-Type':'text/plain'})).status,415);
  assert.equal((await h.request('/api/inquiries','x'.repeat(40000),{'Idempotency-Key':randomUUID()})).status,413);
  assert.equal(h.rows.size,0);
  const offline=await harness(t,{available:false});const response=await offline.submit();assert.equal(response.status,503);assert.equal('reference' in response.body,false);
});
test('support accepts a request without products and records only fields required for support',async t=>{
  const h=await harness(t),value=payload();value.purpose='support';value.items=[];value.details.notes='Pedido de informação sobre dados pessoais.';value.customer.email='';value.customer.phone='(11) 99999-9999';
  assert.equal((await h.submit(value)).status,200);
  const row=[...h.rows.values()][0];assert.equal(row.purpose,'support');assert.equal(row.items.length,0);assert.equal(row.customer.phone,'11999999999');
});
test('private administration lists requests and detects stale status updates, and is unavailable in production',async t=>{
  const h=await harness(t);await h.submit();const list=await h.request('/api/admin/inquiries');assert.equal(list.status,200);
  const item=list.body.items[0];const route=`/api/admin/inquiries/${item.id}`;
  assert.equal((await h.request(route,{status:'reviewing',updatedAt:item.updated_at},{},'PATCH')).status,200);
  assert.equal((await h.request(route,{status:'closed',updatedAt:item.updated_at},{},'PATCH')).status,409);
  const production=await harness(t,{production:true});assert.equal((await production.request('/api/admin/inquiries')).status,404);
  const disabled=await harness(t,{enabled:false});assert.equal((await disabled.request('/api/admin/inquiries')).status,404);
});
test('business profile exposes only public fields, supports the current CNPJ format and rejects credential fields',async t=>{
  const h=await harness(t);
  const publicData=await h.request('/api/storefront');assert.equal(publicData.body.inquiryReady,true);assert.equal(JSON.stringify(publicData.body).includes('server-secret'),false);
  const current=await h.request('/api/admin/store-profile');const profile={...current.body.profile,legalName:'Empresa de teste',cnpj:'12.ABC.345/01DE-35',email:'contato@example.test'};
  const save=await h.request('/api/admin/store-profile',{revision:current.body.revision,profile},{},'PUT');assert.equal(save.status,200);assert.equal(save.body.profile.cnpj,'12ABC34501DE35');
  assert.equal((await h.request('/api/admin/store-profile',{revision:save.body.revision,profile:{...profile,mpAccessToken:'never-store-this'}},{},'PUT')).status,400);
  assert.equal((await h.request('/api/admin/store-profile',{revision:current.body.revision,profile},{},'PUT')).status,409);
  assert.equal((await snapshot(h.root)).data.models[0].stock.quantity,null);
});
