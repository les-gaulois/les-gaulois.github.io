import { useMemo, useState } from "preact/hooks";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, memeTenue, type Tenue } from "../../lib/gaulois";
import { tenueDeLaPlace, type MesTenues, type TenueGardee } from "../../lib/village/tenues-gardees";
import { Pixels } from "./BoutiquePixels";

/** Le Gaulois d'une tenue gardée, en petit : décoratif, le bouton qui le porte dit ce qu'il fait. */
function Miniature({ gardee }: { gardee: TenueGardee }) {
  const cases = useMemo(() => casesDuGaulois(gardee.tenue), [gardee.tenue]);
  return <Pixels largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={cases} echelle={1} />;
}

/**
 * Les tenues gardées du vestiaire (17 novembre 2026, choix du pilote) : trois places où ranger une tenue complète. Un clic
 * sur une tenue gardée la remet à l'écran du vestiaire ; elle ne se porte qu'une fois enregistrée, comme tout changement
 * de tenue. « Garder ici » range la tenue qu'on voit à l'écran ; sur une place prise, le bouton dit « Remplacer », et
 * demande un second clic, « Confirmer » : la tenue qui y était ne se retrouve pas.
 * Le serveur seul range et rend (`get_mes_tenues`, `garder_tenue`) : ce bloc ne paraît que s'il a répondu.
 */
export function TenuesGardees({ mes, tenue, occupe, onRemettre, onGarder }: { mes: MesTenues; tenue: Tenue; occupe: boolean; onRemettre: (tenue: Tenue) => void; onGarder: (place: number) => void }) {
  // « Remplacer » efface la tenue qui était gardée : le premier clic l'arme, le second la remplace.
  const [armee, setArmee] = useState<number | null>(null);
  return (
    <div class="tenues-gardees" data-testid="tenues-gardees">
      <p id="tenues-gardees-titre" class="nom-champ vestiaire-titre">
        Mes tenues gardées
      </p>
      <ul class="tenues-gardees-places" aria-labelledby="tenues-gardees-titre">
        {Array.from({ length: mes.places }, (_, i) => i + 1).map((place) => {
          const gardee = tenueDeLaPlace(mes, place);
          const laMeme = gardee !== null && memeTenue(gardee.tenue, tenue);
          return (
            <li key={place} class="tenue-gardee" data-vide={gardee ? undefined : ""} data-testid={`tenue-gardee-${place}`}>
              {gardee ? (
                <button type="button" class="tenue-gardee-remettre" disabled={laMeme} onClick={() => onRemettre(gardee.tenue)} aria-label={laMeme ? `Tenue ${place}, celle qui est à l'écran` : `Remettre la tenue ${place}`} data-testid={`tenue-remettre-${place}`}>
                  <Miniature gardee={gardee} />
                </button>
              ) : (
                <span class="tenue-gardee-remettre tenue-gardee-libre" aria-hidden="true" />
              )}
              <span class="tenue-gardee-nom">
                Tenue {place}
                {!gardee && <span class="sr-only">, place libre</span>}
              </span>
              <button
                type="button"
                class="chip"
                disabled={occupe || laMeme}
                onClick={() => {
                  if (gardee && armee !== place) {
                    setArmee(place);
                    return;
                  }
                  setArmee(null);
                  onGarder(place);
                }}
                onBlur={() => setArmee((a) => (a === place ? null : a))}
                aria-label={!gardee ? `Garder à la place ${place} la tenue qui est à l'écran` : armee === place ? `Confirmer : remplacer la tenue ${place} par celle qui est à l'écran` : `Remplacer la tenue ${place} par celle qui est à l'écran`}
                data-testid={`tenue-garder-${place}`}
              >
                {!gardee ? "Garder ici" : armee === place ? "Confirmer" : "Remplacer"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
