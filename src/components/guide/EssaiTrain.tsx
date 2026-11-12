import { useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { RELATIONS_TRAIN, TRAIN, orTrain, type RelationTrain } from "../../lib/guide-clan";
import IconePartie from "../compte/IconePartie";
import Reglage from "./Reglage";

const ARRETS = 20;
/** L'échelle des barres : le plus fort paiement de base, celui d'un allié. Elle ne change pas avec le choix. */
const SOMMET = Math.max(...RELATIONS_TRAIN.map((r) => r.or));
const RANGS = Array.from({ length: ARRETS }, (_, i) => i + 1);
const GRADUATIONS = [1, 5, 10, 15, 20];

/**
 * Chapitre 8 : l'or d'un arrêt commercial selon le propriétaire de la station et le rang de l'arrêt. Une barre par
 * arrêt : plein tarif jusqu'au 10e, puis l'escalier de la pénalité jusqu'au plancher. Chaque hauteur vient de `orTrain`.
 */
export default function EssaiTrain() {
  const [relation, setRelation] = useState<RelationTrain>("allie");
  const [arret, setArret] = useState(TRAIN.arretsPleins + 1);
  // Ce qui vient de changer après un choix, pour les lecteurs d'écran : le curseur, lui, dit sa valeur tout seul.
  const [annonce, setAnnonce] = useState("");
  const base = RELATIONS_TRAIN.find((r) => r.id === relation)?.or ?? 0;
  const or = orTrain(base, arret);
  const choisir = (r: (typeof RELATIONS_TRAIN)[number]) => {
    setRelation(r.id);
    setAnnonce(`${r.nom}, arrêt ${arret} : ${fmtInt(orTrain(r.or, arret))} or.`);
  };

  return (
    <div data-testid="essai-train">
      <div class="guide-choix" role="group" aria-label="À qui est la station">
        <span class="guide-etiquette" aria-hidden="true">
          La station est à
        </span>
        {RELATIONS_TRAIN.map((r) => (
          <button key={r.id} type="button" class="chip" aria-pressed={relation === r.id} onClick={() => choisir(r)}>
            {r.nom}
          </button>
        ))}
      </div>
      {/* Décoratif : le curseur du dessous donne chaque valeur en clair, au clavier comme au doigt. Un clic sur une barre
          le place aussi. */}
      <div class="guide-barres" aria-hidden="true" data-testid="essai-train-barres">
        <div class="guide-barres-zone">
          {RANGS.map((rang) => (
            <div
              key={rang}
              class={rang === arret ? "guide-barre-arret guide-barre-arret-vif" : "guide-barre-arret"}
              style={{ "--h": `${(orTrain(base, rang) / SOMMET) * 100}%` }}
              onClick={() => setArret(rang)}
            >
              {rang === arret && <IconePartie nom="train" classe="guide-pion guide-pion-vif guide-barre-pion" />}
            </div>
          ))}
        </div>
        <div class="relative mt-2 h-4 text-xs text-muted">
          {GRADUATIONS.map((rang) => (
            <span key={rang} class="tnum absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((rang - 0.5) / ARRETS) * 100}%` }}>
              {rang}
            </span>
          ))}
        </div>
      </div>
      <Reglage
        id="essai-train-arret"
        nom="Arrêt n°"
        valeur={arret}
        min={1}
        max={ARRETS}
        pas={1}
        texte={String(arret)}
        lu={`Arrêt ${arret} : ${fmtInt(or)} or`}
        onChange={setArret}
        retrait={0.5 / ARRETS}
      />
      <div class="kpi-row guide-mesures">
        <div class="kpi kpi-accent">
          <p class="kpi-label">Paiement de cet arrêt</p>
          <p class="kpi-value kpi-value-sm" data-testid="essai-train-or">
            {fmtInt(or)}
          </p>
          <p class="kpi-hint">or, avant le multiplicateur d'or de la partie</p>
        </div>
      </div>
      <p class="sr-only" role="status">
        {annonce}
      </p>
    </div>
  );
}
