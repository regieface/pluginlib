// Palette musicale commune à la préparation de session et au constructeur.
// Les noms sont des indices : une couleur explicitement choisie n'est jamais réécrite ici.
export const COLOR_GROUPS = Object.freeze([
  { family: 'RYTHMIQUE', entries: [
    { key: 'drum', label: 'DRUM', color: '#a42f3d' },
    { key: 'percus', label: 'PERCUS', color: '#d6515f' },
    { key: 'spd', label: 'SPD', color: '#f18c94' }
  ] },
  { family: 'BASSE', entries: [
    { key: 'bass', label: 'BASS', color: '#b96120' },
    { key: 'synth-bass', label: 'SYNTH BASS', color: '#e68a33' },
    { key: 'sub', label: 'SUB', color: '#f4b16a' }
  ] },
  { family: 'KEYS / SYNTH', entries: [
    { key: 'keys', label: 'KEYS', color: '#378cb9' },
    { key: 'synth', label: 'SYNTH', color: '#79badd' },
    { key: 'samples', label: 'SAMPLES', color: '#b5daec' }
  ] },
  { family: 'GUITARES', entries: [
    { key: 'gtr-electric', label: 'GTR ÉLECTRIQUE', color: '#d4af00' },
    { key: 'gtr-acoustic', label: 'GTR ACOUSTIQUE', color: '#f5de32' },
    { key: 'gtr-other', label: 'AUTRES GTR', color: '#ffeb83' }
  ] },
  { family: 'INSTRU', entries: [
    { key: 'instru', label: 'INSTRU', color: '#407c4d' },
    { key: 'strings', label: 'CORDES', color: '#669c65' },
    { key: 'instru-other', label: 'AUTRES INSTRU', color: '#a3d0a0' }
  ] },
  { family: 'CUIVRES / VENTS', entries: [
    { key: 'brass', label: 'CUIVRES', color: '#762f42' },
    { key: 'sax-wood', label: 'SAX / BOIS', color: '#a65a6c' },
    { key: 'winds-other', label: 'AUTRES VENTS', color: '#d597a5' }
  ] },
  { family: 'VOIX', entries: [
    { key: 'lead', label: 'LEAD', color: '#ffffff' },
    { key: 'bv', label: 'BV / CHŒURS', color: '#3657bc' },
    { key: 'voice-fx', label: 'VOIX FX', color: '#8a9ce2' }
  ] },
  { family: 'FX', entries: [
    { key: 'reverb', label: 'REVERB', color: '#bf3197' },
    { key: 'delay', label: 'DELAY', color: '#e64fc0' },
    { key: 'fx', label: 'AUTRES FX', color: '#f95ad8' }
  ] },
  { family: 'MONITORING', entries: [
    { key: 'monitoring', label: 'MONITORING', color: '#00c4a1' }
  ] }
]);

export const COLOR_CATEGORIES = Object.freeze(COLOR_GROUPS.flatMap(group =>
  group.entries.map(entry => Object.freeze({ ...entry, family: group.family }))));
export const CHAIN_COLOR_PRESETS = Object.freeze(COLOR_CATEGORIES.map(({ label, color }) => [label, color]));
const categoryByKey = new Map(COLOR_CATEGORIES.map(entry => [entry.key, entry]));
export const ROLE_DEFAULT_COLORS = Object.freeze({ insert: '#6574d8', fx: '#f95ad8', monitoring: '#00c4a1' });

export function normalizeChainLabel(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
    .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// L'abréviation doit être un mot complet. OH1 / FX3 sont admis ; "CHOEUR" ne contient pas "OH".
function containsAlias(label, value) {
  const alias = normalizeChainLabel(value);
  if (!label || !alias) return false;
  const parts = alias.split(' ').map(part => `${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[0-9]+)?`);
  return new RegExp(`(?:^| )${parts.join(' ')}(?=$| )`).test(label);
}

const builtins = [
  ['spd', ['SPD', 'SPD SX', 'SPDSX', 'SAMPLE PAD', 'SAMPLEPAD', 'OCTAPAD']],
  ['percus', ['PERC', 'PERCU', 'PERCUS', 'PERCUSSION', 'CONGA', 'CONGAS', 'BONGO', 'BONGOS', 'SHAKER', 'SHAKERS', 'TAMBOURIN', 'TAMBOURINE', 'CLAVE', 'CABASA', 'GUIRO', 'CAJON', 'DJEMBE', 'TIMBALE']],
  ['drum', ['DRUM', 'DRUMS', 'BATTERIE', 'DR', 'KICK', 'KIK', 'BD', 'B D', 'SNARE', 'SN', 'SD', 'SN TOP', 'SN BOTTOM', 'SN BOT', 'OH', 'OVH', 'OVERHEAD', 'OVERHEADS', 'HH', 'HI HAT', 'HIHAT', 'HAT', 'TOM', 'TOMS', 'FLOOR TOM', 'FT', 'RIDE', 'CRASH', 'CYMBAL', 'CYMBALS', 'ROOM DRUM']],
  ['sub', ['SUB BASS', 'SUBBASS', 'SUB']],
  ['synth-bass', ['SYNTH BASS', 'SYNTHBASS', 'BASS SYNTH', 'BSYNTH', 'BASS MOOG']],
  ['bass', ['BASS', 'BASSE', 'BASSES', 'BASS DI', 'BASS AMP', 'BS', 'E BASS', 'EBASS', 'BAS']],
  ['samples', ['SAMPLES', 'SAMPLER', 'SAMPLING', 'PLAYBACK', 'TRACKS']],
  ['synth', ['SYNTH', 'SYNTHS', 'SYNTHETISEUR', 'SYNTHESIZER', 'ANALOG SYNTH', 'MOOG', 'PAD SYNTH']],
  ['keys', ['KEY', 'KEYS', 'KEYBOARD', 'KEYBOARDS', 'CLAVIER', 'CLAVIERS', 'PIANO', 'PNO', 'RHODES', 'WURLITZER', 'WURLI', 'ORGAN', 'ORGUE', 'HAMMOND']],
  ['gtr-acoustic', ['AC GTR', 'ACOUSTIC GTR', 'GTR AC', 'ACOUSTIC GUITAR', 'GUITARE ACOUSTIQUE', 'GUITARE FOLK', 'GTR FOLK', 'NYLON', 'CLASSICAL GUITAR']],
  ['gtr-electric', ['GTR', 'GTRS', 'GUIT', 'GUITAR', 'GUITARS', 'GUITARE', 'GUITARES', 'EGTR', 'E GTR', 'GTR ELEC', 'GUITARE ELECTRIQUE']],
  ['gtr-other', ['UKULELE', 'MANDOLINE', 'BANJO', 'DOBRO']],
  ['strings', ['CORDES', 'STRINGS', 'STRING', 'VIOLIN', 'VIOLON', 'VIOLA', 'ALTO', 'CELLO', 'VIOLONCELLE', 'CONTREBASSE', 'HARP', 'HARPE']],
  ['instru', ['INSTRU', 'INSTRUS', 'INSTRUMENT', 'INSTRUMENTS']],
  ['instru-other', ['ACCORDEON', 'VIBRAPHONE', 'MARIMBA', 'KALIMBA']],
  ['sax-wood', ['SAX', 'SAXO', 'SAXOPHONE', 'CLARINET', 'CLARINETTE', 'FLUTE', 'HAUTBOIS', 'OBOE', 'BASSON', 'FAGOTT', 'WOODWIND']],
  ['brass', ['BRASS', 'CUIVRE', 'CUIVRES', 'HORN', 'HORNS', 'TRUMPET', 'TRUMPETS', 'TROMPETTE', 'TROMPETTES', 'TROMBONE', 'TROMBONES', 'TUBA', 'FRENCH HORN']],
  ['winds-other', ['VENT', 'VENTS', 'WIND', 'WINDS', 'DIDGERIDOO', 'HARMONICA']],
  ['voice-fx', ['VOIX FX', 'VOCAL FX', 'VOC FX', 'VOX FX', 'FX VOX', 'FX VOIX']],
  ['bv', ['BV', 'BVS', 'BGV', 'BGVS', 'BACK', 'BACKS', 'BACKING', 'BACKING VOCALS', 'CHOEUR', 'CHOEURS', 'CHORUS', 'CHORALE', 'HARMONIES', 'HARMONY']],
  ['lead', ['LEAD', 'LEAD VX', 'LEAD VOX', 'LEAD VOCAL', 'VOIX', 'VOCAL', 'VOCALS', 'VOX', 'CHANT', 'SINGER']],
  ['reverb', ['REVERB', 'REVERBE', 'REV', 'VERB', 'ROOM FX', 'PLATE FX', 'HALL FX']],
  ['delay', ['DELAY', 'DLY', 'ECHO', 'TAPE ECHO']],
  ['fx', ['FX', 'EFFECT', 'EFFECTS', 'EFFET', 'EFFETS']],
  ['monitoring', ['MON', 'MONITOR', 'MONITORING', 'CUE', 'TALKBACK', 'TB', 'ECOUTE', 'ECOUTES']]
];

export function validateColorAliases(input) {
  if (!Array.isArray(input) || input.length > 200) throw new TypeError('Le dictionnaire doit contenir au maximum 200 règles.');
  const rules = new Map();
  for (const item of input) {
    if (!item || typeof item.alias !== 'string' || typeof item.category !== 'string' ||
        !categoryByKey.has(item.category)) throw new TypeError('Règle de couleur invalide.');
    const alias = normalizeChainLabel(item.alias);
    if (alias.length < 2 || alias.length > 64) throw new TypeError('Nom de règle : entre 2 et 64 caractères.');
    rules.set(alias, { alias, category: item.category });
  }
  return [...rules.values()];
}

export function colorForCategory(category) {
  return categoryByKey.get(category)?.color ?? null;
}

export function categoryForColor(color) {
  return COLOR_CATEGORIES.find(entry => entry.color.toLowerCase() === String(color ?? '').toLowerCase())?.key ?? null;
}

export function suggestChainColor(name, role = 'insert', customAliases = []) {
  if (role === 'monitoring') return ROLE_DEFAULT_COLORS.monitoring;
  const label = normalizeChainLabel(name);
  // Le rôle FX est prioritaire : toutes les variantes de reverb et delay restent roses.
  if (role === 'fx') {
    if (builtins.find(([key, names]) => key === 'reverb' && names.some(alias => containsAlias(label, alias)))) return colorForCategory('reverb');
    if (builtins.find(([key, names]) => key === 'delay' && names.some(alias => containsAlias(label, alias)))) return colorForCategory('delay');
    return ROLE_DEFAULT_COLORS.fx;
  }
  const personalized = [...customAliases].filter(item => typeof item?.alias === 'string' && categoryByKey.has(item.category))
    .sort((a, b) => normalizeChainLabel(b.alias).length - normalizeChainLabel(a.alias).length);
  const override = personalized.find(item => containsAlias(label, item.alias));
  if (override) return colorForCategory(override.category);
  for (const [category, names] of builtins) {
    if (names.some(alias => containsAlias(label, alias))) return colorForCategory(category);
  }
  return ROLE_DEFAULT_COLORS[role] ?? ROLE_DEFAULT_COLORS.insert;
}
