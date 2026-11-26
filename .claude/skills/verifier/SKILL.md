---
name: verifier
description: Lance tous les contrôles du site GAL dans l'ordre (lint, typecheck, tests unitaires, build, tests e2e Playwright, coup d'œil visuel) et rapporte le résultat tel quel. À utiliser avant tout commit, avant /publier, et dès qu'un changement touche src/, scripts/, config/, content/ ou supabase/.
---

# Vérifier le site

Tout doit passer avant qu'un changement parte. Ne jamais faire passer un contrôle en l'affaiblissant : pas de `skip`, pas de seuil abaissé, pas de test modifié pour accepter une valeur qui n'existe pas.

La série complète tourne **une fois, juste avant de publier**, pas après chaque retouche : mesure du 26 novembre 2026, 1 217 builds de 78 s et 2 018 lancements des e2e, soit près de 50 heures d'attente sur trois semaines. Pendant le travail, lancer seulement les contrôles du changement (section suivante).

Si un contrôle de la série échoue : corriger, relancer ce contrôle seul jusqu'à ce qu'il passe (pour l'e2e, le fichier ou le test en cause), puis reprendre la série à ce contrôle. Si la correction a touché du code, relancer aussi lint, typecheck et `npm test`, qui prennent une minute. Le build et l'e2e complets ne tournent qu'une fois de plus, à la fin, sur le code final.

## Pendant le travail : les contrôles du changement

- Tests unitaires : `npx vitest run tests/unit/le-calcul.test.ts`, ou `npx vitest related --run src/lib/le-calcul.ts` (les tests qui importent ce fichier).
- Lint : `npx eslint les/fichiers/touchés.ts`.
- Typecheck : `npm run typecheck` quand des types ou des signatures ont changé, sinon à la fin.
- E2E : un build seulement si la page doit être vue, puis `npx playwright test tests/e2e/le-fichier.spec.ts --project=desktop` ou `-g "nom du test"`.
- Garder les sorties courtes : `--reporter=dot` pour Vitest, `--reporter=line` pour Playwright, `| tail -40` pour un build. Lire en entier seulement ce qui échoue.
- Un changement qui ne touche que `docs/`, `CLAUDE.md`, `.claude/` ou `README.md` ne demande ni build ni e2e : lint et `npm test` suffisent, pour le cas où un test lirait ces fichiers.

## La série, dans cet ordre

1. `npm run lint`
2. `npm run typecheck` — `astro check` puis `tsc --noEmit`.
3. `npm test` — Vitest. Les calculs de `src/lib/` ont chacun leur test dans `tests/unit/` : un calcul ajouté ou modifié sans test n'est pas fini.
4. `GAL_ESSAI=1 npm run build` — régénère `public/generated/` et `dist/`, avec la page d'essai des cartes (`/essai/cartes`, jamais publiée : la GitHub Action construit sans cette variable). Sans `GAL_ESSAI=1`, les tests des cartes (`tests/e2e/cartes.spec.ts`) sont sautés : le dire dans le rapport. Le build signale dans ses journaux un fichier JSON de `content/` invalide : le lire, pas seulement le code de sortie.
5. `npm run test:e2e` — Playwright sur `dist/` (détails et pannes : skill `tests-e2e`). Les tests lisent `data/leaderboard.json` et `data/members.json` : s'ils manquent, `npm run data:fetch` d'abord.
6. Coup d'œil visuel sur ce qui a changé : avec `dist/` servi sur <http://127.0.0.1:4321> (`npm run preview -- --host 127.0.0.1 --port 4321`, ou le serveur que Playwright a laissé), capturer la page en mobile et en desktop, puis regarder les images :

   ```bash
   npx playwright screenshot --wait-for-timeout=4000 --viewport-size=375,812 --full-page http://127.0.0.1:4321/la-page test-results/la-page-mobile.png
   npx playwright screenshot --wait-for-timeout=4000 --viewport-size=1280,800 --full-page http://127.0.0.1:4321/la-page test-results/la-page-desktop.png
   ```

   Sans `--wait-for-timeout`, la capture part avant la fin des fondus d'entrée : titres et blocs y paraissent pâles. Chercher : texte coupé, bloc vide, contraste faible, chevauchement, valeur « 0 » là où il faudrait « Pas de données », mention de licence disparue. `test-results/` est ignoré par Git.

## Ce que les tests ne voient pas

- Un contraste sur un dégradé : juger sur la capture.
- Une vraie barre de défilement retire 15 px de largeur : une page qui tient juste à 1 024 px peut déborder chez un visiteur.
- Les lecteurs d'écran : vérifier à la main qu'un chiffre animé a sa valeur finale dans le HTML et que les images décoratives ont `alt=""`.

## Rapport

Une ligne par contrôle : passe ou échoue, et pour un échec la cause probable en une phrase. Ne pas écrire « tout est bon » si un contrôle n'a pas tourné : dire lequel et pourquoi.
