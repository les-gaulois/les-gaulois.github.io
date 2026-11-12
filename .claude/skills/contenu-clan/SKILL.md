---
name: contenu-clan
description: Modifie les textes et listes du clan — annonces, événements, guide du clan (content/) et fiche du clan (config/clan.ts) — avec les bons formats JSON et Markdown, sans rien inventer. À utiliser pour « ajouter une annonce », « un événement », « un chapitre », « changer la description du clan ».
paths:
  - "content/**"
  - "config/clan.ts"
---

# Contenu du clan

Ces fichiers parlent au nom du clan. Leur contenu vient du clan : un message de la personne qui pilote, le Discord, les PDF du Guide Gaulois. Tu mets en forme, tu corriges l'orthographe, tu ne rédiges pas de texte, de conseil de jeu, de date ni de nom à sa place. S'il manque une information, laisser la section vide (elle se masque seule) et le dire dans le rapport.

## Les fichiers

| Contenu | Fichier | Format |
|---|---|---|
| Annonces | `content/announcements.json` | `[{ "date": "2026-11-05", "title": "…", "body": "…", "url": "https://… (facultatif)" }]` |
| Événements | `content/events.json` | `[{ "start": "2026-11-20T20:00:00.000Z", "title": "…", "description": "… (facultatif)", "url": "https://… (facultatif)" }]` — `start` en UTC ; un événement passé disparaît au build suivant |
| Guide du clan | `content/guide-clan/NN-nom.md` | Markdown. En-tête : `title`, `order`, `court` (nom du sommaire), `groupe` (`combat`, `economie`, `alliances`, `memo`), `icone` (un dessin de `src/lib/icones-parties.ts`), `chapeau`, `essentiel` (quatre phrases au plus, `**gras**` permis), `bloc`, `blocTitre` et `blocTexte`, `points` (avec `renvoi` vers le chapitre qui explique une ligne), `retenir`, `ouvert`. Le texte sous l'en-tête se déplie sous « Détails et formules » |
| Fiche du clan | `config/clan.ts` | `description`, `history`, `values`, `entryConditions` ; `join.inviteOnly` et `checkedOn` relevés à la main dans le jeu |
| Nouveautés du site | `content/nouveautes.json` | `[{ "date": "2026-11-08", "kind": "nouveau", "title": "…", "body": "…", "link": { "href": "/page", "label": "…" } }]` — la plus récente en tête, `link` facultatif |

`content/nouveautes.json` est la seule exception à la règle du début, « tu ne rédiges pas à sa place » : ce n'est pas la voix du clan, c'est le journal du site, que tu tiens à chaque publication (skill `publier`, étape 1). Il ne décrit que des changements réellement faits, tels qu'un visiteur les voit.

Les schémas exacts sont dans `src/lib/schemas.ts` et `src/content.config.ts`. Un JSON invalide est ignoré au build : la section s'affiche vide et le build le signale dans ses journaux, sans échouer. Après chaque modification, contrôler avec `node -e "JSON.parse(require('fs').readFileSync('content/events.json','utf8'))"` puis `npm run build`, et lire les journaux.

## Règles

- Les annonces et événements publiés depuis `/direction` vivent dans Supabase et s'ajoutent à ceux de ces fichiers. Les deux voies restent valables.
- Le guide du clan (`content/guide-clan/`) est au clan, tous droits réservés : il reprend les PDF du Guide Gaulois. Depuis le 12 novembre 2026, la page `/debuter` le donne un chapitre à la fois : l'en-tête du fichier porte ce qu'un débutant lit d'abord, le texte du fichier ce qui se déplie. Raccourcir une phrase du guide pour `essentiel`, oui ; en écrire une que le guide ne dit pas, non. Ce qui se lit d'abord s'écrit en mots, pas en signes (« 1 troupe sur 5 », jamais « ÷ 5 ») : le pilote ne comprenait pas ces signes, le 12 novembre 2026. Les chiffres d'un essai (`bloc`) viennent de `src/lib/guide-clan.ts` et `src/lib/growth.ts`, et `tests/unit/guide-clan.test.ts` les compare aux tableaux des chapitres : changer un chiffre du guide demande de changer le calcul avec lui. Quand le guide et le code public du jeu divergent, le code tranche. Les fiches par mode (`content/guide/`, adaptées du wiki) ont été retirées ce jour-là, à la demande du pilote : ne pas les remettre sans sa demande.
- Donateurs : le site n'en affiche plus depuis le 9 novembre 2026. S'ils reviennent un jour : seulement une liste fournie par le clan, qui a décidé de la publier. Capsules uniquement, jamais de montant en argent, jamais de renvoi vers le Plutonium.
- Pas de référence à Astérix, pas d'emoji dans les textes du site.

## Les tests qui comptent

`tests/e2e/site.spec.ts` vérifie le nombre de chapitres (`guide-chapter`, 11) sur `/debuter`, leurs titres, les chiffres de chaque essai et l'adresse du Discord. Ajouter un chapitre, changer un titre ou un lien demande de mettre ces valeurs à jour dans le test, puis `verifier`. `tests/unit/guide.test.ts` refuse un chapitre sans nom court, sans groupe ou avec une icône qui n'existe pas.
