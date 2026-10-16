import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshSupportPage} from '../lib/storefront-pages.js';
import {header,footer} from '../lib/storefront-layout.js';

const business={cnpj:'08833419000136'};
const utility=header([]).split('<header')[0];
const page=`<!doctype html><html><head><title>Orçamento</title></head><body class="shop-page">${utility.repeat(4)}${header([])}<main><form id="quoteForm"><label>Nome<input name="name" required></label></form></main>${footer([],business)}</body></html>`;
test('support page regeneration removes accumulated top strips and stays stable across repeated builds',()=>{
  let current=refreshSupportPage(page,[],business,['orcamento.js']);
  const first=current;
  for(let i=0;i<5;i++)current=refreshSupportPage(current,[],business,['orcamento.js']);
  assert.equal(current,first);
  assert.equal((current.match(/class="store-utility"/g)||[]).length,1);
  assert.equal((current.match(/<header\b/g)||[]).length,1);
  assert.equal((current.match(/src="\/orcamento.js\?/g)||[]).length,1);
  assert.ok(current.includes('<form id="quoteForm"><label>Nome<input name="name" required></label></form>'));
  assert.match(current,/CNPJ: 08\.833\.419\/0001-36/);
});
test('support pages without a body class receive the shared layout once',()=>{
  const result=refreshSupportPage(page.replace(' class="shop-page"',''),[],business);
  assert.match(result,/<body class="store-page">/);
  assert.equal(refreshSupportPage(result,[],business),result);
});
