import { useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { GROWTH_REFERENCE_CAPACITY, gainVersusPeak, peakPercent } from "../../lib/growth";
import Courbe from "./Courbe";
import Reglage from "./Reglage";

// La zone annoncée par le guide du clan, indépendante de la capacité.
const ZONE = { de: 35, a: 42 };
const pct = (n: number) => `${fmtInt(n)} %`;
const COURBE = Array.from({ length: 101 }, (_, reserve) => gainVersusPeak(reserve, GROWTH_REFERENCE_CAPACITY));
const PIC = Math.round(peakPercent(GROWTH_REFERENCE_CAPACITY));
const AXE_X = [0, 25, 50, 75, 100].map((place) => ({ place, texte: pct(place) }));
const AXE_Y = [100, 50, 0].map((place) => ({ place, texte: pct(place) }));

/**
 * Chapitre 2 : la croissance des troupes selon le remplissage de la capacité. La courbe du jeu, calculée par
 * `src/lib/growth.ts` ; le curseur la parcourt. Elle s'ouvre sur son sommet. Les mêmes chiffres sont en tableau dans
 * « Détails et formules ».
 */
export default function EssaiCroissance() {
  const [reserve, setReserve] = useState(PIC);
  const gain = COURBE[reserve] ?? 0;

  return (
    <div data-testid="growth-chart">
      <Courbe
        testId="essai-croissance-courbe"
        hauteurs={COURBE}
        repere={{ x: reserve, y: gain }}
        zone={{ ...ZONE, nom: `${ZONE.de} à ${pct(ZONE.a)}` }}
        axeX={AXE_X}
        axeY={AXE_Y}
        legende="En bas : remplissage de la capacité. À gauche : gain, en part du maximum."
        onPlace={(part) => setReserve(Math.round(part * 100))}
      />
      <Reglage
        id="essai-croissance-reserve"
        nom="Votre réserve"
        valeur={reserve}
        min={0}
        max={100}
        pas={1}
        texte={pct(reserve)}
        lu={`${pct(reserve)} de la capacité, ${pct(gain)} du gain maximal`}
        onChange={setReserve}
        retrait={0}
      />
      <div class="kpi-row guide-mesures">
        <div class="kpi kpi-accent">
          <p class="kpi-label">Croissance</p>
          <p class="kpi-value kpi-value-sm" data-testid="essai-croissance-gain">
            {pct(gain)}
          </p>
          <p class="kpi-hint">du gain maximal</p>
        </div>
      </div>
    </div>
  );
}
