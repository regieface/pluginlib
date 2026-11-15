// Classement automatique d'un plugin à partir du texte publié par le constructeur
// (nom, titre, description, catégories de la boutique).
// Rien n'est inventé : chaque critère n'est posé que si un mot-clé explicite
// apparaît dans ce texte. Le résultat est marqué "auto" dans les données et
// peut être corrigé à la main dans data/overrides.json.
import { COLORATION_LABELS } from '../coloration.mjs';
import { FAMILY_RULES, inferFamily } from './category-evidence.mjs';

// Produits hors périmètre, détectés sur le NOM du produit : instruments, synthés,
// banques de sons, matériel, bundles, versions d'essai ou éducatives, formations…
const EXCLUDE_NAME = [
  /\bsynth(esi[sz]er)?s?\b/i, /\binstruments?\b/i, /\bsampler\b/i, /\bpiano(centric)?\b/i, /\borgan\b/i, /\bclavinet\b/i,
  /\bbass (fingers|slapper)\b/i, /\bdrum (machine|kit|sampler)\b/i, /\b(sample|sound|preset) (pack|library|bank)s?\b/i,
  /\bexpansion\b/i, /\bbundle\b/i, /\bcollection\b/i, /\bpick any\b/i, /\b(free )?trial\b/i, /\beducational\b/i,
  /verified purchase/i, /\bpromo\b/i, /\bupgrade\b/i, /\bcrossgrade\b/i, /\bgift card\b/i, /\bsubscription\b/i,
  /\b(accelerator|satellite|option card|pcie|thunderbolt|firewire|interface)\b/i, /\bua connect\b/i, /\bsoundgrid\b/i,
  /\b(course|tutorial|masterclass)\b/i, /\bplugins\b/i, /\bpedal\b/i, /\bapollo\b/i, /\bmic pre(amp(lifier)?)?\b/i, /\bacademic\b/i, /\bupgrades?\b/i, /[{}$]/, /\bnks\b/i, /^tutorials?\b/i, /^comments?\b/i, /^sampling software$/i, /\bmerch|t-shirt|hoodie|mug\b/i, /\bplugins?$/i, /^plugins? for\b/i, /\bseries$/i
];
// Signal fort dans la description courte (et non dans tout le texte de la page)
const EXCLUDE_DESC = [/\b(virtual|software) instrument\b/i, /\bsynthesi[sz]er\b/i, /\bsample library\b/i, /\bkontakt\b/i];

// Familles : une fonction principale explicite, sinon « à vérifier ».
export const CATEGORIES = FAMILY_RULES;

// Critères de filtrage. La coloration documentée est traitée après collecte.
export const FACETS = {
  techno: {
    label: 'Technologie', for: ['comp', 'limiter', 'channel', 'multiband'],
    values: {
      fet: ['FET', [/\bfet\b/i, /\b1176\b/i, /\bcla-?76\b/i]],
      vca: ['VCA', [/\bvca\b/i, /\bdbx ?160\b/i, /\bapi 2500\b/i, /\bbus(s)? compressor\b/i, /\bssl g\b/i]],
      opto: ['Optique', [/\bopto/i, /\bla-?2a\b/i, /\bt4\b/i]],
      varimu: ['Vari-Mu', [/vari[- ]?mu/i, /variable[- ](?:mu|bias)/i]],
      diode: ['Diode bridge', [/diode/i, /\b33609\b/i, /\b2254\b/i]],
      pwm: ['PWM', [/\bpwm\b/i]]
    }
  },
  coloration: {
    label: 'Coloration', for: CATEGORIES.map(([id]) => id),
    values: Object.fromEntries(Object.entries(COLORATION_LABELS).map(([key, label]) => [key, [label, []]]))
  },
  vitesse: {
    label: 'Attaque', for: ['comp', 'limiter', 'transient'],
    values: {
      rapide: ['Rapide', [/fast attack/i, /ultra-?fast/i, /lightning-?fast/i, /\bfet\b/i, /\b1176\b/i]],
      lente: ['Lente / douce', [/slow attack/i, /\bopto/i, /\bsmooth\b/i, /\bgentle\b/i]],
      reglable: ['Réglable', [/(adjustable|variable) attack/i, /attack (and|&) release/i]]
    }
  },
  eqtype: {
    label: "Type d'EQ", for: ['eq', 'channel', 'resonance'],
    values: {
      dynamique: ['Dynamique', [/dynamic eq/i, /dynamic equali/i, /\bdynamic\b/i]],
      fixe: ['Paramétrique fixe', [/parametric/i, /\bsurgical\b/i]],
      passif: ['Passif', [/\bpassive\b/i, /\bpultec\b/i, /\beqp\b/i]],
      graphique: ['Graphique', [/graphic eq/i]],
      linphase: ['Phase linéaire', [/linear[- ]phase/i]],
      console: ['Couleur console', [/\bconsole\b/i, /\bneve\b/i, /\bssl\b/i, /\bapi\b/i, /\b1073\b/i]],
      resonance: ['Suppression de résonances', [/resonan/i]],
      ms: ['Mid/Side', [/mid\/?side/i, /\bm\/s\b/i]]
    }
  },
  saturation: {
    label: 'Caractère', for: ['saturation', 'tape', 'channel'],
    values: {
      lampe: ['Lampe', [/\btube\b/i, /\bvalve\b/i]],
      bande: ['Bande', [/\btape\b/i]],
      transfo: ['Transformateur', [/transformer/i]],
      console: ['Console', [/\bconsole\b/i]],
      exciter: ['Exciter / aigus', [/exciter|aural/i]]
    }
  },
  espace: {
    label: 'Type', for: ['reverb', 'delay'],
    values: {
      plate: ['Plate', [/\bplate\b/i]],
      hall: ['Hall', [/\bhall\b/i]],
      room: ['Room', [/\broom\b/i]],
      chambre: ['Chambre', [/chamber/i]],
      spring: ['Ressort', [/\bspring\b/i]],
      convolution: ['Convolution', [/convolution|impulse response/i]],
      bande: ['Écho à bande', [/tape (delay|echo)/i]],
      algorithmique: ['Algorithmique', [/algorithmic/i]]
    }
  }
};

// Options transversales (affichées pour toutes les catégories)
export const COMMON = {
  sidechain: ['Side-chain externe', [/external (?:side[- ]?chain|key)(?: input)?/i, /side[- ]?chain input/i, /\bkey input\b/i]],
  ms: ['Mid/Side', [/mid\/?side/i, /\bm\/s\b/i]],
  live: ['Mode / version Live', [/\blive\b/i]],
  zl: ['« Zero latency » annoncé', [/zero[- ]latency/i, /no latency/i, /latency-?free/i, /0 latency/i]]
};

function matches(text, patterns) { return patterns.some((re) => re.test(text)); }

export function isOutOfScope(name = '', desc = '') {
  return EXCLUDE_NAME.some((re) => re.test(name)) || !/\b(vocoder|morphoder)\b/i.test(`${name} ${desc}`) && EXCLUDE_DESC.some((re) => re.test(desc));
}

export function classify({ name = '', text = '', vendor = '' }) {
  const productName = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const full = `${productName}\n${text}`;
  const category = inferFamily({ name, description: text, vendor }).category;
  const tags = [];
  for (const [fid, f] of Object.entries(FACETS)) {
    if (!category || !f.for.includes(category)) continue;
    for (const [vid, [, pats]] of Object.entries(f.values)) if (matches(full, pats)) tags.push(`${fid}:${vid}`);
  }
  for (const [cid, [, pats]] of Object.entries(COMMON)) if (matches(full, pats)) tags.push(`opt:${cid}`);
  return { category: category || 'other', tags };
}

export function labels() {
  const cat = Object.fromEntries(CATEGORIES.map(([id, l]) => [id, l]));
  cat.other = 'Famille à vérifier';
  const facets = {};
  for (const [fid, f] of Object.entries(FACETS)) {
    facets[fid] = { label: f.label, for: f.for, values: Object.fromEntries(Object.entries(f.values).map(([v, [l]]) => [v, l])) };
  }
  const common = Object.fromEntries(Object.entries(COMMON).map(([k, [l]]) => [k, l]));
  return { categories: cat, facets, common };
}
