// Famille principale : fonction déclarée du produit, jamais vote de mots-clés dans une page entière.
export const FAMILY_RULES = [
 ['tuner','Accordeur',[/\btuner\b/i,/\baccordeur\b/i]],
 ['feedback','Simulation de larsen',[/\b(?:acoustic )?feedback simulator\b/i]],
 ['channel','Tranche console / Channel strip',[/\bchannel\s*strip\b/i,/\bconsole emulat(?:ion|or)\b/i]],
 ['deesser','De-esser',[/\bde[- ]?ess(?:er|ing)\b/i]],
 ['multiband','Dynamique multibande',[/\bmulti[- ]?band (?:compressor|compression|dynamics|limiter|expander)\b/i,/\b(?:two|three|four|five|six|\d+) bands? of compression\b/i]],
 ['comp','Compresseur',[/\bcompress(?:or|ion|eur)\b/i,/\bcomp\b/i,/\bleveling amplifier\b/i]],
 ['limiter','Limiteur / Maximiseur',[/\blimiter\b/i,/\bmaximi[sz]er\b/i,/\bclip(?:per|ping)?\b/i]],
 ['gate','Gate / Expandeur',[/\bgate\b/i,/(?<!dimensional )(?<!stereo )\bexpander\b/i]],
 ['transient','Transitoires',[/\btransient (?:shaper|designer|processor)\b/i,/\battack (?:shaper|designer)\b/i]],
 ['resonance','Suppresseur de résonances',[/\bresonance (?:suppress(?:or|ion)|tamer|control)\b/i,/\bresonan(?:ces|t) tam(?:ing|er)\b/i]],
 ['eq','Égaliseur',[/\beq\b/i,/\bequali[sz](?:er|ation)\b/i]],
 ['filter','Filtre',[/\bfilter(?:s)?\b/i]],
 ['saturation','Saturation / Distorsion',[/\bsaturat(?:or|ion)\b/i,/\bdistortion\b/i,/\bwaveshap(?:er|ing)\b/i,/\boverdrive\b/i,/\bexciter\b/i]],
 ['tape','Bande / Émulation magnétique',[/\btape (?:machine|emulat(?:or|ion)|saturat(?:or|ion))\b/i]],
 ['reverb','Réverbération',[/\breverb(?:s|eration|erating)?\b/i,/\becho chamber\b/i]],
 ['delay','Délai / Écho',[/\bdelays?\b/i,/\becho(?:es)?\b(?!\s+chambers?\b)/i]],
 ['modulation','Modulation',[/\bchorus\b/i,/\bflang(?:er|ing)\b/i,/\bphaser\b/i,/\btremolo\b/i,/\bvibrato\b/i,/\bring[- ]modulat(?:ion|ors?)\b/i,/\brotary (?:speaker|effect)\b/i,/\bmodulation (?:effect|plugin|processor)\b/i]],
 ['pitch','Pitch / Correction vocale',[/\bpitch[- ](?:shift(?:er|ing)?|correct(?:or|ion))\b/i,/\bformant[- ]shift(?:er|ing)?\b/i,/\bharmoni[sz]er\b/i,/\bvocoder\b/i]],
 ['stereo','Image stéréo',[/\bstereo (?:imag(?:er|ing)|widen(?:er|ing)?|width|manipulation|expander)\b/i,/\bdimensional expander\b/i,/\bpann(?:er|ing)\b/i,/\bpan (?:knob|man|shaper)\b/i]],
 ['analysis','Mesure / Analyse',[/\bmeter(?:ing)?\b/i,/\banaly[sz]er\b/i,/\bstereo scope\b/i,/\boscilloscope\b/i]],
 ['restoration','Restauration / Débruitage',[/\bdenois(?:er|ing)\b/i,/\bnoise (?:reduction|removal)\b/i,/\bde[- ]?(?:click|crackle|hum|reverb|clip|breath|plosive)(?:er|ing)?\b/i,/\brestoration\b/i]],
 ['mastering','Suite de mastering',[/\bmastering (?:suite|chain|assistant|console)\b/i]],
 ['amp','Ampli / Guitare & basse',[/\b(?:guitar|bass) amp(?:lifier)?\b/i,/\bamp(?:lifier)? (?:simulat(?:or|ion)|model(?:ing|ling))\b/i,/\bcabinet (?:simulat(?:or|ion)|emulat(?:or|ion))\b/i]],
 ['preamp','Préampli',[/\bpreamp(?:lifier)?\b/i]],
 ['multi','Multi-effets / Hôte',[/\bmulti[- ]?(?:effects?|fx)\b/i,/\beffects? rack\b/i,/\bplug[- ]?in(?:s)? (?:host|patchbay)\b/i,/\bsuite of [^.!?]{0,25}mixing tools\b/i]],
 ['utility','Utilitaire',[/\butility\b/i,/\b(?:audio|signal) splitter\b/i,/\b(?:phase|time|sample) align(?:er|ment)?\b/i,/\b(?:audio|midi) (?:streaming|routing)\b/i,/\b(?:gain|trim) (?:utility|control|plugin)\b/i,/\broom correction\b/i]]
];
const normal = (s='') => s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').replace(/_/g,' ').replace(/\s+/g,' ').trim();
const negated = (text,index) => /\b(?:no|not|without|unlike|rather than|instead of)\b[^.!?]{0,40}$/i.test(text.slice(Math.max(0,index-60),index));
function candidates(text) {
 return FAMILY_RULES.filter(([, , patterns])=>patterns.some(pattern=>{const m=pattern.exec(text);return m&&!negated(text,m.index);})).map(([id])=>id);
}
function resolve(found) {
 const set=new Set(found);
 if(set.has('channel'))return 'channel';
 if(set.has('multi'))return 'multi';
 if(set.has('tuner'))return 'tuner';
 if(set.has('analysis')&&!set.has('eq'))return 'analysis';
 if(set.has('multiband')){set.delete('comp');set.delete('limiter');set.delete('gate');}
 if(set.has('deesser'))set.delete('comp');
 if(set.has('resonance')){set.delete('eq');set.delete('filter');}
 if(set.has('eq'))set.delete('filter');
 if(set.has('comp')&&set.has('limiter'))set.delete('limiter');
 if(set.has('delay'))set.delete('tape');
 if(set.has('tape'))set.delete('saturation');
 return set.size===1?[...set][0]:null;
}
function technicalDelay(name,description) {
 return /\b(?:latency|compensation) delay\b|\b(?:precision )?(?:time|phase|sample) align(?:ment)?\b/i.test(name)
  || /\b(?:auxiliary|signal)\b[^.!?]{0,90}\b(?:sample|millisecond|compensat)\w*\b/i.test(description)
   && /\bdelay(?:ing)?\b/i.test(description);
}
export function inferFamily({name='',description='',vendor=''}) {
 const brand = vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 const stripBrand = (value) => brand ? value.replace(new RegExp(`^${brand}(?:\\s|:|[._-])+`, 'i'), '') : value;
 const title=normal(stripBrand(name)),desc=normal(stripBrand(description));
 if(/\b(?:plug[- ]?ins? included|deconvolution software|same thing as)\b/i.test(desc))return {category:'other',reason:'not-a-primary-effect-definition',candidates:[]};
 if(technicalDelay(title,desc))return {category:'utility',method:'product-description',excerpt:`${name} ${description}`.slice(0,350)};
 const nameMatches=candidates(title),nameCategory=resolve(nameMatches);
 if(nameCategory)return {category:nameCategory,method:'product-title',excerpt:name};
 if(nameMatches.length)return {category:'other',reason:'ambiguous-title',candidates:nameMatches};
 if(/\b(?:our range|range of|browse|we (?:sell|offer)|sample (?:packs|kits)|music loops|sound packs)\b/i.test(desc))return {category:'other',reason:'generic-description',candidates:[]};
 // Une mention de fonction dans la liste des capacités ne définit pas la famille.
 // Une accroche peut précéder la définition. Seule une phrase qui nomme
 // exactement ce produit peut remplacer la première phrase ; pas une liste
 // de fonctions ni la description d’un produit recommandé.
 const sentences=desc.split(/[.!?](?:\s|$)/);
 const escaped=title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const definition=sentences.slice(0,3).find(s=>new RegExp(`^(?:The )?${escaped}(?:®|™)? (?:is|was|has been designed)\\b`,'i').test(s.trim()));
 const lead=(definition||sentences[0]).split(/\b(?:with|featuring|includes?|including|equipped|plus|from)\b/i)[0];
 const found=candidates(lead),category=resolve(found);
 if(category)return {category,method:'product-description',excerpt:lead.slice(0,350)};
 return {category:'other',reason:found.length?'ambiguous-description':'no-primary-function',candidates:found};
}
export function auditCategoryEvidence(plugin,override) {
 const allowed=new Set(FAMILY_RULES.map(([id])=>id));
 const reviewed=override?.categoryEvidence || plugin.categoryEvidence;
 let result;
 if(reviewed?.method==='reviewed-source'&&allowed.has(reviewed.category)&&reviewed.url&&reviewed.excerpt){
  result={...reviewed,status:'documented'};
 } else if(override?.category&&allowed.has(override.category)&&plugin.url){
  result={category:override.category,method:'manual-override',status:'documented',url:plugin.url,excerpt:'Correction manuelle de la famille.',checkedAt:plugin.checkedAt};
 } else {
  const inferred=inferFamily(plugin);
  result={...inferred,status:inferred.category==='other'||!plugin.url?'unconfirmed':'documented',url:plugin.url,checkedAt:plugin.checkedAt};
  if(!plugin.url)result.category='other';
 }
 const original=plugin.categoryReview?.originalCategory || plugin.category;
 plugin.category=result.category;
 plugin.categoryEvidence=result;
 plugin.categoryReview={version:1,status:result.status,originalCategory:original};
 return plugin;
}
