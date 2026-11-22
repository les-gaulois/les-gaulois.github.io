/**
 * Le contenu du duel « Coup pour coup », en données : les boss du jour (`boss.ts`, et la règle du jour dans `rotation.ts`),
 * les défis d'entraînement (`defis.ts`, joués par `partie.ts`) et les réglages des trois niveaux de l'ordinateur
 * (`niveaux.ts`). Le moteur
 * (`../regles.ts`, `../machine.ts`) les joue sans rien y ajouter : aucun pouvoir ne demande de règle nouvelle.
 */
export * from "./boss.ts";
export * from "./defis.ts";
export * from "./niveaux.ts";
export * from "./partie.ts";
export * from "./rotation.ts";
