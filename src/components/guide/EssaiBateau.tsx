import { useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { DISTANCE_BATEAU_MAX, orBateau } from "../../lib/guide-clan";
import IconePartie from "../compte/IconePartie";
import Courbe from "./Courbe";
import Reglage from "./Reglage";

const PAS = 10;
/** La plus courte distance du curseur : à zéro, la formule ne paie presque rien, et deux Ports ne sont jamais au même endroit. */
const DISTANCE_MIN = PAS;
/** Le seuil de courte portée du chapitre : la distance pèse fortement autour de lui. */
const SEUIL = 300;
const SOMMET = orBateau(DISTANCE_BATEAU_MAX);
const hauteur = (distance: number) => (orBateau(distance) / SOMMET) * 100;
const COURBE = Array.from({ length: 101 }, (_, i) => hauteur((i / 100) * DISTANCE_BATEAU_MAX));
const AXE_X = [0, 250, 500, 750, 1_000].map((d) => ({ place: (d / DISTANCE_BATEAU_MAX) * 100, texte: fmtInt(d) }));
const AXE_Y = [100_000, 50_000, 0].map((or) => ({ place: (or / SOMMET) * 100, texte: fmtInt(or) }));

/**
 * Chapitre 7 : l'or d'un bateau de trade selon la distance entre les deux Ports, avant le multiplicateur d'or de la
 * partie. La courbe est celle de `orBateau` ; le bateau s'y pose à la distance choisie.
 */
export default function EssaiBateau() {
  const [distance, setDistance] = useState(SEUIL);
  const or = Math.round(orBateau(distance));

  return (
    <div data-testid="essai-bateau">
      <Courbe
        hauteurs={COURBE}
        repere={{ x: (distance / DISTANCE_BATEAU_MAX) * 100, y: hauteur(distance) }}
        seuil={{ place: (SEUIL / DISTANCE_BATEAU_MAX) * 100, nom: `seuil ${fmtInt(SEUIL)}` }}
        axeX={AXE_X}
        axeY={AXE_Y}
        legende="En bas : distance entre les deux Ports. À gauche : or payé à l'arrivée."
        onPlace={(part) => setDistance(Math.max(DISTANCE_MIN, Math.round((part * DISTANCE_BATEAU_MAX) / PAS) * PAS))}
        pion={<IconePartie nom="bateau" classe="guide-pion guide-pion-vif" />}
      />
      <Reglage
        id="essai-bateau-distance"
        nom="Distance"
        valeur={distance}
        min={DISTANCE_MIN}
        max={DISTANCE_BATEAU_MAX}
        pas={PAS}
        texte={fmtInt(distance)}
        lu={`Distance ${fmtInt(distance)} : ${fmtInt(or)} or`}
        onChange={setDistance}
        retrait={0}
      />
      <div class="kpi-row guide-mesures">
        <div class="kpi kpi-accent">
          <p class="kpi-label">Paiement à l'arrivée</p>
          <p class="kpi-value kpi-value-sm" data-testid="essai-bateau-or">
            {fmtInt(or)}
          </p>
          <p class="kpi-hint">or pour chaque Port, avant le multiplicateur d'or de la partie</p>
        </div>
      </div>
    </div>
  );
}
