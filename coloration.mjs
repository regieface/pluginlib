// La coloration sonore est distincte de l'architecture du processeur.
// Aucune déduction de transparence à partir de « digital », « clean » ou look-ahead.
export const COLORATION_LABELS = {
  transparent: 'Transparent (documenté)',
  colored: 'Coloration / harmoniques',
  mixed: 'Modes neutres et colorés'
};

export function inferColorationFromDescription(plugin) {
  const name = (plugin.name || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const description = plugin.description || '';
  const pattern = /\b(?:saturat(?:ion|or|ed|ing)|waveshap(?:ing|ers?)|overdrive|harmonic(?:ally)?[- ](?:rich|enhanc\w*|distortion)|harmonic distortion|add(?:s|ing)?(?:\s+\w+){0,4}\s+harmonics|tube[- ](?:tone|warmth|sound)|analog(?:ue)?[- ](?:coloration|saturation)|colou?r adder|(?:soft|hard)[- ]clipp?\w*)\b/gi;
  let excerpt;
  for (const match of description.matchAll(pattern)) {
    const before = description.slice(Math.max(0, match.index - 65), match.index);
    if (/\b(?:no|without|eliminat\w*|free from|avoid\w*)\b[^.!?]{0,55}$/i.test(before)) continue;
    excerpt = description; break;
  }
  if (!excerpt && /\b(?:saturator|distortion|waveshaper|clipper|overdrive|exciter)\b/i.test(name)) excerpt = name;
  if (!excerpt || !plugin.url) return null;
  return { kind: 'colored', method: 'description', url: plugin.url, checkedAt: plugin.checkedAt,
    excerpt: excerpt.slice(0, 400), noteFr: 'Un traitement de saturation, de clipping ou de coloration harmonique est décrit. Cela peut concerner un mode ou un étage activable.' };
}

export function applyColorationMetadata(plugin) {
  plugin.tags = (plugin.tags || []).filter((tag) => tag !== 'techno:digital' && !tag.startsWith('coloration:'));
  const reviewed = plugin.colorationInfo;
  const info = reviewed?.method === 'reviewed-source' && COLORATION_LABELS[reviewed.kind] && reviewed.url && reviewed.noteFr
    ? reviewed : inferColorationFromDescription(plugin);
  if (info) { plugin.colorationInfo = info; plugin.tags.push(`coloration:${info.kind}`); }
  else delete plugin.colorationInfo;
  return plugin;
}
