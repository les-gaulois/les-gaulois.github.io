import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { FicheDesEffets, variablesDeLaCarte } from "../CarteDObjet";
import { styleDeCarte } from "../../../lib/jeu/cartes-d-objets";
import { useEffetsDeLaChose } from "../effets-des-cartes";
import { useDuelVisible } from "./acces";
import { badgeCarteDeDuel } from "./dessins-ecran";

/**
 * « Aussi une carte de duel » (chantier 1 du duel, 22 novembre 2026) : sous l'objet qui vient de sortir d'un booster, le
 * badge dessiné par Claude Fable 5.2 et ces mots, pour dire qu'il entre aussi dans la collection du duel. Seulement pour qui
 * voit « Le duel » (le pilote seul tant que le serveur le dit fermé) : les autres n'en savent rien.
 */
export function AussiCarteDeDuel({ cle = null, rarete = null }: { cle?: string | null; rarete?: string | null }) {
  // Les effets de la carte (22 novembre 2026, les cartes des cosmétiques) : toutes ses phrases, sous le badge.
  const effets = useEffetsDeLaChose(cle);
  if (!useDuelVisible()) return null;
  return (
    <>
      <p class="dl-aussi" data-testid="aussi-carte-de-duel">
        <i style={{ backgroundImage: urlDeLaPlanche("duel-badge", badgeCarteDeDuel) }} aria-hidden="true" />
        Aussi une carte de duel.
      </p>
      {effets && (
        <span class="co-carte co-effets-booster" data-carte={styleDeCarte(rarete)} data-rarete={rarete ?? "base"} style={variablesDeLaCarte(rarete)}>
          <FicheDesEffets effets={effets} />
        </span>
      )}
    </>
  );
}
