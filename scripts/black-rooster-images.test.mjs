import test from 'node:test';import assert from 'node:assert/strict';import {extractPage} from './parse.mjs';
test('Black Rooster : choisir la capture de la bonne interface plutôt que la boîte ou les logos',()=>{
 const h='<meta property="og:image" content="/files/content/products/vla-2a/VLA-2A_Box_Medium.png"><img src="/files/content/products/vla-2a/VLA-2A_Frontplate.jpg"><img src="/files/content/products/vla-3a/VLA-3A_Frontplate.jpg"><img src="/files/theme/Format_AAX.png">';
 const p=extractPage(h,'https://blackroosteraudio.com/en/products/vla-2a','Black Rooster Audio');assert.equal(p.image,'https://blackroosteraudio.com/files/content/products/vla-2a/VLA-2A_Frontplate.jpg');
});
test('Black Rooster : une boîte seule ne devient pas une capture d’interface',()=>{
 assert.equal(extractPage('<meta property="og:image" content="/files/content/products/pack/Pack_Box.png">','https://blackroosteraudio.com/en/products/pack','Black Rooster Audio').image,null);
});
