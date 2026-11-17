/**
 * Les cartes du podium de l'accueil (src/components/CartesPodium.astro) : leur mouvement et leurs finitions animées,
 * par `cartes-mouvement.ts`, que la carte d'essai de la boutique partage.
 */
import { monterLesCartes } from "./cartes-mouvement";

const racine = document.querySelector<HTMLElement>("[data-podium-cartes]");
if (racine) monterLesCartes(racine);
