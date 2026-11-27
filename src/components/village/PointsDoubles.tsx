import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import type { MesPointsDoubles } from "../../lib/village/contrat";
import { lirePointsDoubles, motsDesPointsDoubles, type PointsDoubles as LesPointsDoubles } from "../../lib/village/points-doubles";
import { Dialogue } from "./BoutiqueDialogue";

/**
 * Le message de novembre doublé (le pilote, 27 novembre 2026), une seule fois, en entrant dans « Mon Gaulois » : la même
 * fenêtre que celles de la boutique, le montant en titre comme à l'ouverture d'un booster de statères, puis pourquoi
 * (`points-doubles.ts`). Le serveur dit s'il a déjà été vu ; fermer la fenêtre, par le bouton, Échap ou un clic à côté, le
 * lui dit. Si la lecture échoue, rien ne s'ouvre : le message attendra la prochaine visite.
 */
export default function PointsDoubles({ actif }: { actif: boolean }) {
  const [doubles, setDoubles] = useState<LesPointsDoubles | null>(null);
  useEffect(() => {
    if (!actif) return;
    let fini = false;
    void call<MesPointsDoubles>("get_mes_points_doubles")
      .then((r) => {
        if (!fini) setDoubles(lirePointsDoubles(r.doubles));
      })
      .catch(() => undefined);
    return () => {
      fini = true;
    };
  }, [actif]);
  if (doubles === null || doubles.vu) return null;
  const mots = motsDesPointsDoubles(doubles);
  const fermer = () => {
    setDoubles(null);
    void call("voir_points_doubles").catch(() => undefined);
  };
  return (
    <Dialogue titre={mots.titre} etape="message" occupe={false} onFermer={fermer} testid="points-doubles">
      {mots.lignes.map((ligne) => (
        <p key={ligne} class="boutique-dialogue-texte">
          {ligne}
        </p>
      ))}
      <div class="boutique-dialogue-actions">
        <button type="button" class="btn btn-primary" onClick={fermer} data-testid="points-doubles-merci">
          Merci !
        </button>
      </div>
    </Dialogue>
  );
}
