/**
 * Les cartes du podium de l'accueil (src/components/CartesPodium.astro) et la carte d'un membre sur sa fiche
 * (src/components/CarteDeMembre.astro) : leur mouvement et leurs finitions animées,
 * par `cartes-mouvement.ts`, que la carte d'essai de la boutique partage.
 */
import { monterLesCartes } from "./cartes-mouvement";

// Le podium de l'accueil, ou la carte d'un membre sur sa fiche (CarteDeMembre.astro).
for (const racine of document.querySelectorAll<HTMLElement>("[data-podium-cartes], [data-carte-membre]")) monterLesCartes(racine);
// Le reflet d'un bloc de fiche : il ne suit que la souris, pour ne rien repeindre quand personne ne bouge.
for (const racine of document.querySelectorAll<HTMLElement>("[data-carte-bloc]")) monterLesCartes(racine, { immobile: true });
