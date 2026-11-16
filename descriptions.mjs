// Présentations propres aux produits. Aucune définition n’est déduite de leur famille.
export function cleanPublisherDescription(value='') {
  return String(value).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/[\t\r\n ]+/g,' ').trim();
}
export function productDescription(plugin,summaries={}) {
  const reviewed=summaries[plugin.id];
  if(reviewed?.text&&reviewed.sourceUrl&&(reviewed.sourceHash||reviewed.sourceText)){
    return {text:reviewed.text,url:reviewed.sourceUrl,language:'fr',kind:'summary',label:'D’après la présentation de l’éditeur'};
  }
  return {text:'La présentation détaillée de ce produit reste à compléter.',url:plugin.url,language:'fr',kind:'missing',label:'Fiche de l’éditeur'};
}
export function shortDescription(plugin,summaries={}) {return productDescription(plugin,summaries).text;}
