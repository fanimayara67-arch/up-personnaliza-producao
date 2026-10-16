import fs from 'node:fs/promises';
import path from 'node:path';
import {esc} from './storefront-layout.js';

// Only the marks supplied for this store are included. sources.json records their provenance.
export async function brandLoop(root) {
  let brands;
  try { brands = JSON.parse(await fs.readFile(path.join(root,'public/assets/brands/sources.json'),'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  const marks = brands.filter(brand => /^[a-z0-9-]+\.(svg|webp|png)$/.test(brand.file) && typeof brand.name === 'string');
  if (!marks.length) return '';
  return `<section class="brand-loop" aria-labelledby="brands-title"><div class="brand-loop__head"><h2 id="brands-title" class="brand-loop__title"><span aria-hidden="true"></span>Quem confia no nosso trabalho</h2></div><div class="brand-loop__viewport" tabindex="0" role="group" aria-label="Marcas de empresas e projetos"><div class="brand-loop__track" id="brands-track"><ul class="brand-loop__group" aria-label="Marcas">${marks.map(brand => `<li class="brand-loop__mark" data-brand="${esc(brand.id)}"><img src="/assets/brands/${brand.file}" alt="${esc(brand.name)}"${brand.width&&brand.height?` width="${Number(brand.width)}" height="${Number(brand.height)}"`:''} loading="lazy" decoding="async" draggable="false"></li>`).join('')}</ul></div></div></section>`;
}
