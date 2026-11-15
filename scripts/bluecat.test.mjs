import test from 'node:test';import assert from 'node:assert/strict';
import {extractPage} from './parse.mjs';import {inferCatalogMetadata} from '../catalog.mjs';
const url='https://www.bluecataudio.com/Products/Product_PatchWork/';
const fixture=(price)=>`<title>Blue Cat's PatchWork</title><div class="menu"><a href="/Products/Category_0_Freeware/">Freeware</a></div><div class="content_title">Blue Cat's PatchWork</div><div class="content"><div class="price"><strong>Price:</strong> ${price}</div><div>Windows and macOS</div><a name="History"></a><p>Our free plugin was updated.</p></div>`;
test('Blue Cat : le menu Freeware ne rend pas PatchWork gratuit, son prix officiel est lu',()=>{
 const page=extractPage(fixture('99&euro; or $99 (tax incl.)'),url,'Blue Cat Audio');
 assert.equal(page.price,99);assert.equal(page.pricing.currency,'EUR');
 assert.equal(page.isProduct,true);
 const facts=inferCatalogMetadata({text:page.metadataText,price:page.price,listed:page.isProduct});
 assert.equal(facts.catalogStatus,'commercial');assert(!page.metadataText.includes('Our free plugin'));
});
test('Blue Cat : conserver la gratuité quand le prix du produit indique Freeware',()=>{
 const page=extractPage(fixture('Freeware'),url,'Blue Cat Audio');
 assert.equal(inferCatalogMetadata({text:page.metadataText,price:page.price,listed:true}).catalogStatus,'free');
});
test('un lien vers une rubrique Freeware ne prouve pas la gratuité',()=>{
 assert.equal(inferCatalogMetadata({text:'Home Products Freeware Tools Buy now',listed:true}).catalogStatus,'commercial');
});
