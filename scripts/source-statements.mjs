// Une définition dont le sujet est exactement le produit, dans son propre texte.
// Les comparaisons, listes de capacités et produits recommandés ne sont pas utilisés.
import {visibleProductHtml,stripHtml} from './parse.mjs';
import {inferFamily} from './category-evidence.mjs';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function productStatement(html,plugin){
 const text=visibleProductHtml(html);
 const names=[plugin.name,plugin.name.replace(new RegExp(`^${escape(plugin.vendor||'')}\\s+`,'i'),'')].filter(x=>x.length>=4);
 for(const p of text.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)){
  const line=stripHtml(p[1]).replace(/\s+/g,' ').trim();
  if(line.length>1800)continue;
  if(!names.some(name=>new RegExp(`^(?:The )?${name.split(/\s+/).map(escape).join('\\s*')}(?:®|™)?(?: plug-?in)? (?:is|was) (?:a|an|the|our) `,'i').test(line)))continue;
  const proof=inferFamily({...plugin,description:line});
  // Le titre n'est pas une nouvelle preuve sur la fonction principale.
  if(proof.method==='product-description'&&proof.category!=='other')return {description:line.slice(0,600),descriptionEvidence:{method:'product-definition',url:plugin.url,excerpt:line.slice(0,600)}};
 }
 return null;
}
