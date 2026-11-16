// Extraits propres au produit, séparés des champs utilisés pour le classement.
import {stripHtml,visibleProductHtml,extractPage} from './parse.mjs';
const compact=s=>String(s||'').normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();
const boilerplate=/^(?:our range|browse|discover our|pro-grade audio software|vst3, audio unit, aax|module de traitement pour virtual mix rack|instrument virtuel pour jouer|pack réunissant)/i;
export function publisherPresentation(plugin,html=''){
 const blocks=[];
 if(html){
  // Certains éditeurs placent le texte produit dans des blocs de mise en page,
  // ou dans un panneau chargé à la demande qui est masqué hors de son contexte.
  if(/(^|\.)mcdsp\.com$/.test(new URL(plugin.url).hostname)){
   for(const m of html.matchAll(/<div\b[^>]*class=["'][^"']*\bmc_text_med\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)){
    const text=stripHtml(m[1]);if(text.length>80)blocks.push(text);if(blocks.length>=2)break;
   }
  }
  if(/(^|\.)lsp-plug\.in$/.test(new URL(plugin.url).hostname)){
   const description=html.match(/<b>Description:<\/b>[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1];
   if(description)blocks.push(stripHtml(description));
  }
  const visible=visibleProductHtml(html).replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,''),page=extractPage(html,plugin.url,plugin.vendor);
 const names=[plugin.name,...(plugin.aliases||[]),plugin.name.replace(/^GVST\s+/i,'')].map(compact).filter(n=>n.length>=4);
  const paragraphs=[...visible.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>stripHtml(m[1]).replace(/\s+/g,' ').trim());
  for(const text of paragraphs){
   if(text.length<55||text.length>1800||boilerplate.test(text))continue;
   if(!names.some(n=>compact(text.slice(0,150)).includes(n)))continue;
   if(/\b(?:I|my|we use|customer|reviewer|verdict)\b|\[\.\.\.\]/i.test(text))continue;
   if(/\b(?:cookie|privacy policy|newsletter|subscribe to|customer review|payment|VAT|free trial for|system requirements)\b/i.test(text))continue;
   blocks.push(text);
   if(blocks.join(' ').length>2200)break;
  }
  if(!blocks.length&&page.description&&!boilerplate.test(page.description))blocks.push(page.description);
 }
 if(!blocks.length&&plugin.description&&!boilerplate.test(plugin.description))blocks.push(plugin.description);
 let text=[...new Set(blocks)].join(' ').replace(/\s+/g,' ').trim();
 text=text.replace(/\b(?:Available in VST|Available in AAX|A free \d+-day trial|FREE Full-feature|Try it free|Download it now|Subscribe and Save)[\s\S]*$/i,'').trim();
 // Les données anciennes peuvent être coupées au milieu d’un mot : préférer
 // la dernière phrase complète lorsqu’il en existe une assez informative.
 if(text.length>100&&!/[.!?…]$/.test(text)){const end=Math.max(text.lastIndexOf('. '),text.lastIndexOf('! '),text.lastIndexOf('? '));if(end>90)text=text.slice(0,end+1);}
 if(text.length>2500){const end=text.lastIndexOf('. ',2500);text=text.slice(0,end>180?end+1:text.lastIndexOf(' ',2500))+(end>180?'':'…');}
 return text?{text,url:plugin.descriptionEvidence?.url||plugin.url,method:html?'product-page-excerpt':'stored-product-description',checkedAt:plugin.checkedAt}:null;
}
// Synthèse extractive : privilégier les caractéristiques et retirer les phrases
// promotionnelles, plutôt que remplacer le produit par une définition de sa famille.
export function synthesisSource(value=''){
 const text=value.replace(/\s+/g,' ').trim();
 const sentences=text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ö0-9])/);
 const slogans=/someone somewhere|once said|now there.?s|best of the best|highest possible|gorgeous|unrivalled|most demanding|blow your|secret weapon|perfect tool|we are excited|look out honey|come with uncle|ride eternal|grade A class|unstuck in time/i;
 const boilerplate=/available in VST|free trial|star rating|cookie|subscribe|payment method|VAT|sale ends|buy now|try it free|download now/i;
 const specifics=/\b(?:modelled|modeled|emulat\w*|inspired|analog\w*|algorithm\w*|optical|FET|VCA|tube|multiband|dynamic|side.?chain|oversampling|latency|phase|mid.?side|M\/S|spectral|transient\w*|envelope|IR|impulse|convolution|tape|pitch|grain\w*|bands?|modulat\w*|feedback|control\w*|attack|release|character|RMS|peak|frequen\w*|stereo|routing|match\w*|distortion)\b/gi;
 const ranked=sentences.map((sentence,index)=>({sentence:sentence.trim(),index,score:(sentence.match(specifics)||[]).length+(sentence.match(/\d+/g)||[]).length})).filter(x=>x.sentence.length>12&&!slogans.test(x.sentence)&&!boilerplate.test(x.sentence));
 const factual=ranked.filter(x=>x.score>0);const choices=(factual.length?factual:ranked).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected=[];let length=0;for(const item of choices){if(selected.length>=3)break;if(length+item.sentence.length>850&&selected.length)continue;selected.push(item);length+=item.sentence.length;}
 return selected.sort((a,b)=>a.index-b.index).map(x=>x.sentence).join(' ').slice(0,1400).trim();
}
