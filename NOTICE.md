# Licence et mentions

Site du clan [GAL] Les Gaulois.
Copyright (C) 2026 les contributeurs de ce site.

Le code de ce site est un logiciel libre : vous pouvez le redistribuer et le modifier selon les termes de la GNU Affero General Public License, version 3 uniquement (AGPL-3.0-only), publiée par la Free Software Foundation. Le texte complet est dans [LICENSE](LICENSE). Ce code est distribué sans aucune garantie, comme le précise cette licence.

Code source de la version en ligne : <https://github.com/les-gaulois/les-gaulois.github.io>

## Ce que la licence ne couvre pas

| Quoi | Où | Statut |
|---|---|---|
| Nom, tag, logos et images du clan | `public/brand/`, `brand-sources/` | Réservés au clan |
| Textes et listes du clan, dont le guide du clan | `content/` | Réservés au clan |
| Données collectées auprès d'OpenFront, dont le film de la carte des clans | `data/`, et leur copie publiée dans `public/generated/carte/` | © OpenFront et ses contributeurs |
| Fond de la carte des clans : Giant World Map d'OpenFront, réduite et assombrie | `data/clanmap/terrain.webp`, et sa copie publiée | CC BY-SA 4.0, attribution « OpenFront » : voir « Licences » dans `docs/API_AUDIT.md` |
| Terrain de la carte « World » d'OpenFront, copié tel quel (`manifest.json`, `map4x.bin`, commit `a0abccc` du 6 novembre 2026) | `public/carte-monde/` | CC BY-SA 4.0, attribution « OpenFront » : la page affiche sa source et sa licence |
| Code des couleurs du terrain et du dessin des territoires, repris du client d'OpenFront (commit `a0abccc`) et modifié les 6 et 7 novembre 2026 : fichiers d'origine listés en tête de la page | `public/carte-monde/index.html` | AGPL-3.0, avec les conditions de la section « OpenFront » ci-dessous |
| Noms français des cartes du jeu, repris de `resources/lang/fr.json` d'OpenFront (commit `31a2119`) et modifiés le 7 novembre 2026 : seules les entrées qui nomment une carte sont gardées | `src/lib/map-names.ts` | CC BY-SA 4.0, attribution « OpenFront » : le bloc qui les affiche cite leur source et leur licence |
| Vignettes des cartes du jeu, `resources/maps/<carte>/thumbnail.webp` d'OpenFront (branche `main`), lues par le robot au moment de chaque envoi, jamais copiées dans ce dépôt : redimensionnées, aux coins arrondis, posées sur la couleur de la mer du jeu, depuis le 11 novembre 2026 | Image de chaque message du salon Discord des victoires (`src/lib/victoires-image.ts`) | CC BY-SA 4.0, attribution « OpenFront » : le message n'ayant plus de texte depuis le 12 novembre 2026, l'image porte elle-même la mention « © OpenFront and Contributors », la licence et le redimensionnement, et écrit en entier l'adresse de la source et celle de la licence ; le texte de secours les donne en liens ; la vignette ainsi modifiée reste sous la même licence |
| Placement des clans dans les équipes, adapté de `assignTeams` d'OpenFront (commit `31a2119`), réécrit et réduit le 7 novembre 2026 | `placeClans` dans `src/lib/games.ts` | AGPL-3.0, avec les conditions de la section « OpenFront » ci-dessous |
| Police « GAL Onciale » (titres des pages ouvertes à tous, depuis le 12 novembre 2026) : les formes de la police Uncial Antiqua, Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI), with Reserved Font Names "Uncial Antiqua", passées sur une grille de cases puis redessinées à la main par le clan, avec des chiffres, des accents et des signes ajoutés. Son nom réservé n'est pas employé pour cette version | `src/lib/police/onciale.ts` (les dessins, avec la notice en tête), et les polices qu'en tire `scripts/generate-police.ts` dans `public/generated/polices/` | SIL Open Font License 1.1, pas l'AGPL : texte complet et notice dans `src/lib/police/OFL.txt`, notice et adresse de la licence écrites aussi dans les polices elles-mêmes. Les outils qui les fabriquent ou les mesurent (`src/lib/police/cases.ts`, `src/lib/police/largeur.ts`, `scripts/generate-police.ts`) restent sous l'AGPL |
| Dépendances et polices | `package-lock.json` | Leur propre licence (polices Inter, Outfit et JetBrains Mono : OFL-1.1 ; opentype.js et wawoff2, qui fabriquent la police des titres : MIT) |

## OpenFront

Ce site est communautaire et non officiel : il n'a aucun lien avec les éditeurs d'OpenFront et n'a pas reçu leur approbation.

En dehors de ce que liste le tableau ci-dessus, aucun fichier de code ni aucune image d'OpenFront n'est copié ici à ce jour, ni utilisé par le robot. Le graphique de croissance de `/debuter` est adapté de son code, lui-même sous AGPL-3.0, puis réécrit : voir l'en-tête de `src/lib/growth.ts`. Les autres essais du guide du clan, sur la même page, calculent des règles du jeu telles que le guide les écrit, vérifiées par le clan sur ce même code (v0.35.12, le 6 novembre 2026), puis réécrites : voir l'en-tête de `src/lib/guide-clan.ts`. Les fiches par mode adaptées du wiki OpenFront (CC BY-SA 4.0) ont été retirées du site le 12 novembre 2026. Le bas de page affiche la mention « © OpenFront and Contributors ». La page Carte, une console sans bas de page depuis le 12 novembre 2026, pose la mention sur la carte elle-même, avec la licence du fond de carte : elle mène à la fenêtre « Légende », qui donne la source, la modification et le lien de la licence, et le bas de page du site se lit dans la fenêtre « À propos ».

Si un morceau de code d'OpenFront est repris :

- son fichier indique qu'il vient d'OpenFront, qu'il a été modifié, et à quelle date (section 5 de l'AGPL) ;
- les conditions supplémentaires de sa licence s'appliquent (section 7) : la mention « © OpenFront and Contributors » reste visible, l'origine du code n'est pas travestie, et le site ne prend pas OpenFront comme titre principal ni ne laisse croire à une approbation officielle. Texte d'origine : <https://github.com/openfrontio/OpenFrontIO/blob/main/LICENSE>.
