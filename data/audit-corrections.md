# Révision globale du catalogue — 15 novembre 2026

Cette révision porte sur toutes les fiches, au-delà des exemples signalés. Elle ne certifie pas une validation humaine exhaustive de chaque paramètre, version, visuel ou tarif. Les incertitudes restent explicites.

- 2616 identifiants conservés ; 2613 références distinctes à l’affichage, après regroupement de trois doublons Waves.
- 84 fiches dont les montants, la distinction normal/promo ou la présence d’un tarif ont été corrigés lors de la révision des sources. Les dates seules ne sont pas comptées.
- 22 noms débarrassés de leur texte commercial, avec anciens noms conservés en alias.
- 15 instruments, applications ou modules distingués des effets ; fiches et collections conservées.
- 387 familles précises réattribuées depuis le classement initial ; 1294 familles non confirmées restent à vérifier.
- 3262 anciens critères non confirmés écartés des filtres ; 737 critères actifs possèdent une preuve propre au produit.
- 234 extraits contaminés de latence mis à l’écart. Les tableaux officiels indépendants restent utilisés.

## Erreurs trouvées indépendamment des signalements

| Produits | Correction et source |
|---|---|
| TDR Molotok, Prism et Collector | Les tarifs venaient de produits recommandés. Gratuité rétablie ; Collector est un installateur. [Molotok](https://www.tokyodawn.net/tdr-molotok/), [Prism](https://www.tokyodawn.net/tdr-prism/), [Collector](https://www.tokyodawn.net/tdr-collector/) |
| MSoundFactoryPlayer ; éditions Melda LE | Le Player gratuit reprenait le prix de l’édition complète ; les éditions et promotions sont maintenant séparées. [Player](https://www.meldaproduction.com/MSoundFactoryPlayer), [MTurboReverbLE](https://www.meldaproduction.com/MTurboReverbLE) |
| HyperspaceCore, Urban Puncher | Anciens tarifs fixes retirés. HyperspaceCore est gratuit ; Urban Puncher est gratuit avec publicité, avec contribution pour la retirer. [Core](https://unitedplugins.com/HyperspaceCore/), [Urban Puncher](https://unitedplugins.com/UrbanPuncher/) |
| D16 et United Plugins | Prix normal et promotion extraits de la zone d’achat du produit. Exemple : Antresol 59 € / 30 €, Autoformer 79 € / 8 € au relevé. [Antresol](https://d16.pl/antresol), [Autoformer](https://unitedplugins.com/Autoformer) |
| Nectar, Neutron, RX | Tarif de la licence complète distingué des autres variantes de boutique. [RX Advanced](https://www.izotope.com/products/rx-advanced) |
| Sonsig ACE | Expansion stéréo, pas expansion de dynamique. [Définition officielle](https://relabdevelopment.com/ace/) |
| StandardCompressor | Image d’un autre produit retirée ; préversion « Customer Beta » distinguée d’une version finale. [SIR Audio Tools](https://www.siraudiotools.com/) |
| Precision Time Align, Latency Delay, Compensation Delay | Alignement/compensation technique distingués des effets d’écho. |
| LION, Generate, AD-202, Multisampler, LUNA, extensions Softube Modular | Instruments, applications et modules distingués des effets autonomes. Identifiants conservés et filtre dédié. |
| DTS Neural Mono2Stereo, Surround DownMix et UpMix | Le symbole ™ provoquait trois doublons lors du rapprochement du tableau Waves. Une carte par produit ; les anciens identifiants de licence restent reconnus. |

## Prévenir les régressions

Les menus, recommandations, catalogues masqués et autres éditions ne servent plus de preuve au produit consulté. Les prix visuellement présents mais masqués aux lecteurs d’écran restent accessibles à l’extraction. Une classe « has-navbar » sur le body ne masque plus toute la page. Les résumés techniques de compression, EQ et réverbération suivent les critères documentés. Une valeur de latence à 44,1 kHz ne peut plus être présentée comme une valeur à 48 kHz par le collecteur.

La collecte de quinzaine relance les audits de familles, critères et cohérence. Des identifiants dupliqués ou des prix structurellement incohérents font échouer le contrôle avant publication. Les pannes de sites et soupçons ne sont pas traités comme des preuves d’abandon.

Validation : 104 tests réussis ; parcours navigateur isolé pour les filtres contextuels, Pro-Q 4, ZL Audio, gratuités, archives et import d’anciens identifiants. Affichage ordinateur/mobile et captures McDSP contrôlés ; les six captures ZL Audio ont été inspectées.

## Vérifications restantes

Le classement reste incomplet : 1294 familles à vérifier. Certaines pages ont une description générique, certains critères ne figurent pas dans les descriptions courtes, et 77 sources restent absentes ou inaccessibles au contrôle. Les extraits mis à l’écart ne sont pas des informations actives. Aucune garantie d’absence totale d’erreurs n’est donnée.

Voir [le rapport de familles et critères](quality-report.md) et [le contrôle de toutes les fiches](integrity-report.md). Les fichiers JSON associés contiennent les identifiants, sources et files de vérification complètes.

## Reprise du 16 novembre 2026

- 72 fiches ajoutées, dont les effets gratuits absents et des modules explicitement distingués des plugins autonomes.
- Listes officielles : 35 Kilohearts et 38 Melda gratuits ; les mises à niveau payantes Melda ne sont pas assimilées aux éditions gratuites.
- Six réverbes Valhalla classées avec une preuve explicite ; Space Modulator et UberMod distingués.
- 27 images Black Rooster Audio remplacées par les captures Frontplate officielles. Les deux packs sont distingués des effets.
- 2 542 présentations françaises sourcées, dont 80 rédigées individuellement ; 148 présentations restent à compléter. Les définitions génériques par famille ont été supprimées.
- Les cartes affichent quatre lignes et un bouton accessible pour développer le texte.
- 21 tarifs actualisés ; les boutons d’achat Slate propres au produit sont distingués des offres d’abonnement et des produits voisins.
- Six pages administratives/de navigation masquées.
- Les 57 éditeurs des captures sont comparés dans vendor-coverage.md : 37 ont une référence, 20 sont encore absents. Cette présence ne prouve pas une couverture exhaustive.

Validation : 128 tests JavaScript et un test Python réussis ; import/export, cadres verts, gratuités, descriptions extensibles et affichage mobile contrôlés dans un navigateur isolé. Les captures Black Rooster ont aussi été inspectées visuellement. Les familles et critères encore incertains restent dans la file de vérification.
