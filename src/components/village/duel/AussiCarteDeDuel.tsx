import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { useDuelVisible } from "./acces";
import { badgeCarteDeDuel } from "./dessins-ecran";

/**
 * « Aussi une carte de duel » (chantier 1 du duel, 22 novembre 2026) : sous l'objet qui vient de sortir d'un booster, le
 * badge dessiné par Claude Fable 5.2 et ces mots, pour dire qu'il entre aussi dans la collection du duel. Seulement pour qui
 * voit « Le duel » (le pilote seul tant que le serveur le dit fermé) : les autres n'en savent rien.
 */
export function AussiCarteDeDuel() {
  if (!useDuelVisible()) return null;
  return (
    <p class="dl-aussi" data-testid="aussi-carte-de-duel">
      <i style={{ backgroundImage: urlDeLaPlanche("duel-badge", badgeCarteDeDuel) }} aria-hidden="true" />
      Aussi une carte de duel.
    </p>
  );
}
