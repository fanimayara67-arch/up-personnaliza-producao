import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const sources=await Promise.all(['store.js','project.js'].map(file=>fs.readFile(new URL('../public/'+file,import.meta.url),'utf8')));
function fixture() {
  const storage=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key)};};
  const context={localStorage:storage(),sessionStorage:storage(),crypto:{randomUUID},Intl,dispatchEvent(){},CustomEvent:class{}};
  context.window=context;
  context.CVT_PRODUCTS=[{id:'impressao',configurationFields:[{key:'widthCm',label:'Largura',type:'number',required:true},{key:'heightCm',label:'Altura',type:'number',required:true},{key:'notes',label:'Observações'}]}];
  context.UP_COMMERCE={products:[{id:'impressao',type:'service'},{id:'marcador',type:'custom'},{id:'pet',type:'custom',fields:[{key:'finish',label:'Acabamento',type:'text',required:true,choices:[{value:'branco',label:'Branco e dourado'}]},{key:'petName',label:'Nome do pet',type:'text',required:true},{key:'notes',label:'Observações',type:'textarea',required:false}]},{id:'kit',type:'custom',fields:[{key:'piecesPerKit',label:'Peças por kit',type:'number',required:false}]}]};
  for(const source of sources)vm.runInNewContext(source,context);
  return context;
}
const configuration={widthCm:20,heightCm:30,notes:'Arte da peça'};

test('corrupt, duplicate and discontinued custom rows do not erase valid project items',()=>{
  const f=fixture(),key=randomUUID();
  f.sessionStorage.setItem('up-custom-project',JSON.stringify([null,{},false,{key,productId:'marcador',quantity:'11',fields:{personalization:'Ana',notes:{invalid:true}},privateCost:99},{key,productId:'marcador',quantity:2},{key:randomUUID(),productId:'retired',quantity:1},{key:randomUUID(),productId:'marcador',quantity:true}]));
  const items=f.UP_PROJECT.readCustom();
  assert.equal(items.length,1);assert.equal(items[0].quantity,11);assert.equal(items[0].fields.personalization,'Ana');assert.equal(items[0].fields.notes,'');assert.equal('privateCost' in items[0],false);
});
test('a combined project enforces its 20-item limit for both product types and permits edits',()=>{
  const f=fixture(),service=f.UP_PROJECT.addService('impressao',configuration,1);
  for(let i=0;i<19;i++)f.UP_PROJECT.addCustom('marcador',{},1);
  assert.equal(f.UP_PROJECT.all().length,20);
  assert.throws(()=>f.UP_PROJECT.addService('impressao',configuration,1),/20 itens/);
  assert.throws(()=>f.UP_PROJECT.addCustom('marcador',{},1),/20 itens/);
  assert.equal(f.UP_PROJECT.addService('impressao',{...configuration,widthCm:40},2,service),service);
  assert.equal(f.UP_PROJECT.all().length,20);assert.equal(f.UP_PROJECT.all()[0].quantity,2);
});
test('stale and mismatched edit keys cannot append extra products or overwrite another item',()=>{
  const f=fixture(),key=f.UP_PROJECT.addCustom('marcador',{},1);
  assert.throws(()=>f.UP_PROJECT.addService('impressao',configuration,1,key),/removido/);
  assert.throws(()=>f.UP_PROJECT.addCustom('marcador',{},1,randomUUID()),/removido/);
  f.UP_PROJECT.remove(key);
  assert.throws(()=>f.UP_PROJECT.addCustom('marcador',{},1,key),/removido/);
  assert.equal(f.UP_PROJECT.all().length,0);
});
test('invalid quantities are rejected without silently changing the stored quantity',()=>{
  const f=fixture(),custom=f.UP_PROJECT.addCustom('marcador',{},11),service=f.UP_PROJECT.addService('impressao',configuration,1);
  for(const value of [true,false,null,'',0,-1,1.5,'NaN',10001])assert.throws(()=>f.UP_PROJECT.setQuantity(custom,value),/quantidade/);
  assert.throws(()=>f.UP_PROJECT.setQuantity(service,100),/quantidade/);
  assert.equal(f.UP_PROJECT.readCustom()[0].quantity,11);assert.equal(f.UP_PROJECT.all()[0].quantity,1);
});
test('editing preserves the line identity, public payload and session-only personalization',()=>{
  const f=fixture(),key=f.UP_PROJECT.addCustom('marcador',{personalization:'Ana'},10);
  f.UP_PROJECT.addCustom('marcador',{personalization:'Bia'},11,key);
  const service=f.UP_PROJECT.addService('impressao',configuration,2);
  assert.equal(f.UP_PROJECT.all().length,2);assert.equal(f.UP_PROJECT.readCustom()[0].key,key);
  assert.match(f.UP_PROJECT.requestItems()[1].configuration,/Bia/);
  assert.equal(f.localStorage.getItem('cvt-cart').includes('Arte da peça'),false);
  assert.equal(f.localStorage.getItem('up-custom-project'),null);
  f.UP_PROJECT.remove(service);assert.equal(f.UP_PROJECT.all().length,1);
});
test('product-specific required fields and choices are validated and carried into the quote with readable labels',()=>{
  const f=fixture();
  assert.throws(()=>f.UP_PROJECT.addCustom('pet',{finish:'branco'},1),/nome do pet/);
  assert.throws(()=>f.UP_PROJECT.addCustom('pet',{finish:'unknown',petName:'Luna'},1),/acabamento/);
  f.UP_PROJECT.addCustom('pet',{finish:'branco',petName:'Luna',privateCost:99},3);
  const item=f.UP_PROJECT.readCustom()[0];
  assert.equal(item.fields.petName,'Luna');assert.equal('privateCost' in item.fields,false);
  assert.match(f.UP_PROJECT.requestItems()[0].configuration,/Acabamento: Branco e dourado · Nome do pet: Luna/);
});
test('optional kit composition rejects fractional, negative and excessively large quantities',()=>{
  const f=fixture();
  for(const piecesPerKit of ['1.5','-1','0','1001','not-a-number'])assert.throws(()=>f.UP_PROJECT.addCustom('kit',{piecesPerKit},1),/peças por kit/);
  f.UP_PROJECT.addCustom('kit',{piecesPerKit:'6'},2);
  assert.match(f.UP_PROJECT.requestItems()[0].configuration,/Peças por kit: 6/);
});
