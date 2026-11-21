import { COTE_DE_L_INSIGNE, casesDeLInsigne, insigneDeLaSaison } from "../../lib/village/insignes-de-saison";
import { Pixels } from "./BoutiquePixels";

/**
 * L'insigne d'une saison du pass, en pixels (dessin : `src/lib/village/insignes-de-saison.ts`), avec son nom pour les
 * lecteurs d'écran. Rien pour une saison sans insigne dessiné. `echelle` : la taille d'une case, en pixels de la page.
 * À poser sur la carte du joueur ; l'écran « Ma carte » du nouveau jeu le reprend.
 */
export default function InsigneDeSaison({ saison, echelle = 2, class: classe = "" }: { saison: string; echelle?: number; class?: string }) {
  const insigne = insigneDeLaSaison(saison);
  if (!insigne) return null;
  return (
    <span class={`insigne-de-saison inline-flex ${classe}`} role="img" aria-label={insigne.nom} title={insigne.nom} data-testid={`insigne-${saison}`}>
      <Pixels largeur={COTE_DE_L_INSIGNE} hauteur={COTE_DE_L_INSIGNE} cases={casesDeLInsigne(insigne)} echelle={echelle} />
    </span>
  );
}
