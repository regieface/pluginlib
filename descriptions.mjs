// Résumés français pour les cartes. Les textes constructeur restent dans les données.
// Les précisions viennent uniquement du nom et du descriptif du produit.
export function shortDescription(plugin) {
  if(plugin.recordType==='instrument')return 'Instrument virtuel pour jouer et créer des sons.';
  if(plugin.recordType==='module')return 'Module ou extension nécessitant un environnement hôte.';
  if(plugin.recordType==='application')return 'Application audio ou outil de gestion des installations.';
  if(plugin.recordType==='bundle')return 'Pack réunissant plusieurs plugins.';
  if (plugin.category === 'other' || !plugin.category) return 'Fonction principale à vérifier sur la fiche constructeur.';
  if (plugin.category === 'tuner') return 'Accordeur pour vérifier la justesse des instruments.';
  if (plugin.category === 'feedback') return 'Simulation de larsen acoustique pour enrichir le jeu de guitare.';
  if (plugin.category === 'filter') return 'Filtre pour façonner le spectre et le mouvement du son.';
  if (plugin.category === 'preamp') return 'Préampli pour régler le gain et la couleur du signal.';
  if (plugin.category === 'multi') return 'Plusieurs traitements ou effets réunis dans un seul outil.';
  const text = `${plugin.name || ''} ${plugin.description || ''}`;
  const has = (pattern) => pattern.test(text);
  const documented = tag => plugin.tags?.includes(tag);

  // Fonctions explicites prioritaires : certaines familles automatiques sont imprécises.
  if (plugin.category === 'delay' && documented('espace:bande')) return 'Écho à bande pour des répétitions au caractère vintage.';
  if (plugin.category === 'deesser') return 'Atténue les sifflantes pour adoucir les voix.';
  if (plugin.category === 'eq' && plugin.tags?.includes('eqtype:dynamique')) return 'Égaliseur dynamique pour corriger le son selon son niveau.';
  if (plugin.category === 'channel') return 'Tranche de console pour traiter une piste dans un seul outil.';

  switch (plugin.category) {
    case 'comp':
      if (documented('techno:fet')) return 'Compresseur FET pour maîtriser les crêtes et ajouter du punch.';
      if (documented('techno:opto')) return 'Compresseur optique pour lisser la dynamique en douceur.';
      if (documented('techno:diode')) return 'Compresseur à pont de diodes pour contrôler la dynamique.';
      if (documented('techno:varimu')) return 'Compresseur Vari-Mu pour contrôler la dynamique.';
      if (documented('techno:vca')) return 'Compresseur VCA pour maîtriser la dynamique des pistes et bus.';
      return 'Compresseur pour maîtriser les écarts de niveau du signal.';
    case 'eq':
      if (documented('eqtype:passif')) return 'Égaliseur passif pour sculpter la couleur du son.';
      if (documented('eqtype:linphase')) return 'Égaliseur à phase linéaire pour ajuster le spectre sonore.';
      if (documented('eqtype:graphique')) return 'Égaliseur graphique pour ajuster les bandes de fréquences.';
      if (documented('eqtype:fixe')) return 'Égaliseur paramétrique pour cibler les fréquences à corriger.';
      return 'Égaliseur pour ajuster les graves, les médiums et les aigus.';
    case 'reverb':
      if (documented('espace:convolution')) return 'Réverbération à convolution pour recréer des espaces sonores.';
      if (documented('espace:spring')) return 'Réverbération à ressort pour donner un caractère vintage.';
      if (documented('espace:plate')) return 'Réverbération à plaque pour ajouter de la profondeur au son.';
      if (documented('espace:chambre')) return 'Réverbération de chambre pour placer le son dans un espace.';
      return 'Réverbération pour ajouter de l’espace et de la profondeur.';
    case 'delay': return 'Délai pour créer des échos et des répétitions rythmiques.';
    case 'modulation':
      if (has(/chorus/i)) return 'Chorus pour épaissir le son et enrichir son mouvement.';
      if (has(/flang/i)) return 'Flanger pour créer un balayage sonore en mouvement.';
      if (has(/phas(er|ing)/i)) return 'Phaser pour ajouter un balayage de phase au son.';
      if (has(/tremolo/i)) return 'Trémolo pour faire varier le volume de façon rythmique.';
      if (has(/rotary|leslie/i)) return 'Simulation de haut-parleur rotatif pour animer le son.';
      return 'Effet de modulation pour donner du mouvement au son.';
    case 'saturation':
      if (has(/exciter|aural/i)) return 'Exciteur harmonique pour enrichir la présence du son.';
      if (has(/distort/i)) return 'Distorsion pour transformer le grain et la texture du son.';
      return 'Saturation pour enrichir le son en harmoniques.';
    case 'tape': return 'Émulation de bande pour apporter une coloration magnétique.';
    case 'limiter':
      if (has(/clipper|clipping/i)) return 'Écrêtage des crêtes pour contrôler le niveau du signal.';
      return 'Limiteur pour contenir les crêtes et augmenter le niveau perçu.';
    case 'gate': return 'Gate ou expandeur pour atténuer le signal sous un seuil.';
    case 'transient': return 'Façonne l’attaque et le sustain pour ajuster le punch du son.';
    case 'multiband': return 'Traitement de la dynamique par bandes de fréquences.';
    case 'channel': return 'Tranche de console regroupant plusieurs traitements de piste.';
    case 'deesser': return 'Atténue les sifflantes pour adoucir les voix.';
    case 'pitch': return 'Traitement de la hauteur pour corriger ou transformer le son.';
    case 'stereo': return 'Traitement de l’image stéréo pour ajuster la largeur du son.';
    case 'analysis': return 'Outil de mesure pour analyser le signal audio.';
    case 'restoration': return 'Restauration audio pour atténuer les bruits et les défauts.';
    case 'mastering': return 'Traitement de mastering pour finaliser le mixage.';
    case 'amp': return 'Simulation d’amplification pour façonner le son instrumental.';
    case 'resonance': return 'Atténue les résonances pour équilibrer le spectre sonore.';
    case 'utility':
      if (has(/(?:latency|compensation) delay|(?:time|phase|sample) align|sub-sample delay/i)) return 'Décalage précis du signal pour l’alignement ou la compensation.';
      return 'Utilitaire audio pour les réglages techniques du signal.';
    default: return 'Fonction à préciser : consulter la fiche constructeur.';
  }
}
