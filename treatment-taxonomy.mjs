// Identifiants persistants, indépendants des libellés de navigation.
export const TREATMENTS = {
  compressor: { label: 'Compresseur', families: {
    fet: 'FET', vca: 'VCA', opto: 'Opto', 'vari-mu': 'Vari-Mu',
    'diode-bridge': 'Diode Bridge', pwm: 'PWM', digital: 'Numérique'
  } },
  limiter: { label: 'Limiteur' },
  'gate-expander': { label: 'Gate / Expandeur', families: {
    gate: 'Gate', 'downward-expander': 'Expandeur descendant', 'upward-expander': 'Expandeur montant'
  } },
  'de-esser': { label: 'De-esser' },
  'transient-shaper': { label: 'Transient Shaper' },
  clipper: { label: 'Clipper' },
  equalizer: { label: 'Égaliseur', families: {
    parametric: 'Paramétrique', graphic: 'Graphique', pultec: 'Pultec', dynamic: 'Dynamique'
  } },
  'saturation-distortion': { label: 'Saturation / Distorsion', families: {
    tape: 'Tape', tube: 'Tube', transistor: 'Transistor', transformer: 'Transformateur',
    diode: 'Diode', bitcrusher: 'Bitcrusher'
  } },
  'bass-enhancement': { label: 'Renforcement du grave' },
  reverb: { label: 'Réverbération', families: {
    plate: 'Plate', hall: 'Hall', room: 'Room', chamber: 'Chamber', spring: 'Spring', ambience: 'Ambience'
  } },
  delay: { label: 'Delay / Écho', families: {
    tape: 'Tape', analog: 'Analog', digital: 'Digital', 'multi-tap': 'Multi-tap', 'ping-pong': 'Ping-pong'
  } },
  modulation: { label: 'Modulation', families: {
    chorus: 'Chorus', flanger: 'Flanger', phaser: 'Phaser', tremolo: 'Tremolo', rotary: 'Rotary', 'auto-pan': 'Auto-pan'
  } },
  'stereo-image': { label: 'Image stéréo', families: {
    widening: 'Élargissement', stereoization: 'Stéréoïsation', positioning: 'Positionnement'
  } },
  'pitch-time': { label: 'Hauteur / Temps', families: {
    'pitch-correction': 'Correction de hauteur', 'pitch-shifting': 'Pitch Shifting', harmonization: 'Harmonisation',
    'time-stretching': 'Time Stretching', varispeed: 'Varispeed'
  } },
  'cleanup-restoration': { label: 'Nettoyage / Restauration', families: {
    denoise: 'Denoise', 'de-feedback': 'De-feedback', 'de-hum': 'De-hum', 'de-click': 'De-click',
    'de-reverb': 'De-reverb', 'spectral-repair': 'Réparation spectrale'
  } },
  'audio-utility': { label: 'Utilitaires audio', families: {
    'gain-level': 'Gain / Niveau', 'phase-alignment': 'Phase / Alignement', 'channels-routing': 'Canaux / Routage',
    'analysis-metering': 'Analyse / Mesure', 'format-delivery': 'Format / Livraison'
  } },
  'channel-strip': { label: 'Channel Strip' }
};

export const FORMATS = { 'multi-effects': 'Multieffets' };
export const ARCHITECTURES = { multiband: 'Multibande' };
export const PROCESSES = { waveshaping: 'Waveshaping' };

const measurement = (label, units) => ({ label, section: 'measurements', units });
const feature = label => ({ label, section: 'features', kind: 'flag' });
const detail = label => ({ label, section: 'features', kind: 'detail' });
const latency = sampleRateKHz => ({
  ...measurement(`Latence à ${sampleRateKHz} kHz`, ['samples', 'ms']), sampleRateKHz
});

export const CRITERIA = {
  family: { label: 'Famille', section: 'families' },
  technology: { label: 'Technologie', section: 'technologies' },
  multiband: { label: ARCHITECTURES.multiband, section: 'architectures', id: 'multiband' },
  attack: measurement('Attaque', ['ms']),
  release: measurement('Release', ['ms']),
  ratio: measurement('Ratio', [':1']),
  attenuation: measurement('Atténuation', ['dB']),
  externalSidechain: feature('Sidechain externe'),
  sidechainProcessing: detail('Traitement du sidechain'),
  midSide: feature('Mid/Side'),
  dryWet: feature('Dry/Wet'),
  dynamicProcessing: feature('Traitement dynamique'),
  phaseType: detail('Type de phase'),
  clippingCurve: detail('Courbe d’écrêtage'),
  distortionType: detail('Type de distorsion'),
  subharmonics: feature('Génération de sous-harmoniques'),
  upperHarmonics: feature('Génération d’harmoniques supérieures'),
  integratedModules: detail('Modules intégrés'),
  design: detail('Conception de la tranche'),
  latency48: latency(48),
  latency96: latency(96),
  cpu: measurement('CPU', ['%'])
};

const performance = ['latency48', 'latency96', 'cpu'];
export const COMPARISON_CRITERIA = {
  compressor: ['family', 'attack', 'release', 'ratio', 'externalSidechain', 'sidechainProcessing', ...performance],
  limiter: [...performance],
  'gate-expander': ['family', 'externalSidechain', 'sidechainProcessing', 'attenuation', ...performance],
  'de-esser': [...performance],
  'transient-shaper': [...performance],
  clipper: ['clippingCurve', ...performance],
  equalizer: ['family', 'dynamicProcessing', 'externalSidechain', 'sidechainProcessing', 'midSide', 'phaseType', ...performance],
  'saturation-distortion': ['family', 'technology', 'distortionType', 'multiband', 'midSide', 'dryWet', ...performance],
  'bass-enhancement': ['subharmonics', 'upperHarmonics', ...performance],
  reverb: ['family', 'technology', ...performance],
  delay: ['family', 'technology', ...performance],
  modulation: ['family', 'technology', ...performance],
  'stereo-image': ['family', ...performance],
  'pitch-time': ['family', ...performance],
  'cleanup-restoration': ['family', ...performance],
  'audio-utility': ['family', 'cpu'],
  'channel-strip': ['integratedModules', 'design', ...performance]
};
