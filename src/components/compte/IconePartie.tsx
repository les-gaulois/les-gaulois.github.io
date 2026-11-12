import { ICONE_COTE, traceIcone, type IconePartieNom } from "../../lib/icones-parties";

/**
 * La petite icône d'une partie, dans le menu des parties du QG et de la Direction : un objet gaulois dessiné en pixels
 * (`src/lib/icones-parties.ts`). Elle prend la couleur du texte qui la porte ; le style Terminal la met en vert, comme
 * une commande (« Les icônes des parties », docs/DESIGN.md). Les cases en demi-teinte sont à moitié transparentes.
 * Décorative : le nom de la partie est écrit à côté, et les lecteurs d'écran ne la lisent pas.
 */
export default function IconePartie({ nom }: { nom: IconePartieNom }) {
  const { plein, demi } = traceIcone(nom);
  return (
    <svg class="icone-partie" viewBox={`0 0 ${ICONE_COTE} ${ICONE_COTE}`} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={plein} />
      {demi && <path d={demi} opacity="0.5" />}
    </svg>
  );
}
