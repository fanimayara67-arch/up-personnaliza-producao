import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = await fs.readFile(new URL('../public/store.js',import.meta.url),'utf8');
const storage = values => {
  const entries = new Map(Object.entries(values));
  return {getItem:key => entries.get(key) ?? null,setItem:(key,value) => entries.set(key,String(value)),removeItem:key => entries.delete(key)};
};
function storeFixture(cart, configurations = {}) {
  const localStorage = storage({'cvt-cart':JSON.stringify(cart)});
  const sessionStorage = storage({'cvt-configurations':JSON.stringify(configurations),'cvt-card-config':'{"draft":"retired"}'});
  const context = {window:{CVT_PRODUCTS:[{id:'impressao',configurationFields:[{key:'widthCm',type:'number',required:true},{key:'heightCm',type:'number',required:true},{key:'notes'}]}]},localStorage,sessionStorage,crypto:{randomUUID},Intl};
  vm.runInNewContext(source,context);
  return {store:context.window.CVT_STORE,localStorage,sessionStorage};
}
test('retired products are removed from old carts and session drafts while active personalizations remain intact', () => {
  const active = {id:'impressao',lineId:'active-line',quantity:3,configuration:{widthCm:30,heightCm:20}};
  const retired = {id:'cartoes',lineId:'retired-line',quantity:1,configuration:{runQuantity:250}};
  const fixture = storeFixture([retired,active],{'active-line':{...active.configuration,notes:'Texto do projeto ativo'},'retired-line':{design:'antigo'}});
  const cart = fixture.store.readCart();
  assert.equal(cart.length,1); assert.equal(cart[0].id,'impressao'); assert.equal(cart[0].quantity,3);
  assert.equal(cart[0].configuration.notes,'Texto do projeto ativo');
  assert.equal(JSON.parse(fixture.localStorage.getItem('cvt-cart')).length,1);
  assert.equal(fixture.sessionStorage.getItem('cvt-card-config'),null);
  assert.equal('retired-line' in JSON.parse(fixture.sessionStorage.getItem('cvt-configurations')),false);
  assert.throws(() => fixture.store.addConfigured('cartoes',retired.configuration),/Produto indisponível/);
});
test('a cart containing only a discontinued product becomes an empty cart', () => {
  const fixture = storeFixture([{id:'cartoes',lineId:'old-product',quantity:1}]);
  assert.equal(fixture.store.readCart().length,0);
  assert.equal(fixture.localStorage.getItem('cvt-cart'),'[]');
  assert.equal(fixture.store.validConfiguration('cartoes',{widthCm:90,heightCm:50}),false);
});
