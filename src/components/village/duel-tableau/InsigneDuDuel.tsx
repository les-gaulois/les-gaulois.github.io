import { useEffect, useState } from "preact/hooks";
import { tableauDuel } from "../../../lib/compte/api";
import { lireMesInsignes } from "../../../lib/village/contrat-tableau";
import { debutDeLaSemaine } from "../../../lib/village/ecran-tableau";
import { COTE_DE_L_INSIGNE_DU_DUEL, INSIGNE_DU_DUEL, casesDeLInsigneDuDuel } from "../../../lib/village/insigne-du-duel";
import { Pixels } from "../BoutiquePixels";

/**
 * L'insigne du duelliste de la semaine, en pixels (dessin de Claude Fable 5.2, `src/lib/village/insigne-du-duel.ts`), avec son
 * nom et le nombre de semaines gagnées pour les lecteurs d'écran. Le frère d'`InsigneDeSaison` : à poser sur la carte du
 * joueur, à la même échelle.
 */
export function InsigneDuDuel({ semaines, echelle = 2, class: classe = "" }: { semaines: readonly string[]; echelle?: number; class?: string }) {
  if (!semaines.length) return null;
  const n = semaines.length;
  const nom = `${INSIGNE_DU_DUEL.nom}, ${n > 1 ? `${n} semaines gagnées` : "1 semaine gagnée"}`;
  return (
    <span class={`insigne-du-duel inline-flex items-end gap-1 ${classe}`} role="img" aria-label={nom} title={`${nom} : ${semaines.map(debutDeLaSemaine).join(", ")}`} data-testid="insigne-du-duel">
      <Pixels largeur={COTE_DE_L_INSIGNE_DU_DUEL} hauteur={COTE_DE_L_INSIGNE_DU_DUEL} cases={casesDeLInsigneDuDuel()} echelle={echelle} />
      {n > 1 && (
        <span class="text-xs font-semibold" aria-hidden="true">
          {n}
        </span>
      )}
    </span>
  );
}

/**
 * Les insignes du duel du membre, lus au serveur (`get_mes_insignes_duel`) : pour « Ma carte ». Rien tant qu'il n'en a
 * pas, ni si le serveur ne connaît pas encore le tableau.
 */
export function InsignesDuDuelDuMembre({ echelle = 2, class: classe = "" }: { echelle?: number; class?: string }) {
  const [semaines, setSemaines] = useState<string[]>([]);
  useEffect(() => {
    let fini = false;
    tableauDuel.mesInsignes().then(
      (brut) => {
        const l = lireMesInsignes(brut);
        if (!fini && l) setSemaines(l.map((x) => x.semaine));
      },
      () => undefined,
    );
    return () => {
      fini = true;
    };
  }, []);
  return <InsigneDuDuel semaines={semaines} echelle={echelle} class={classe} />;
}
