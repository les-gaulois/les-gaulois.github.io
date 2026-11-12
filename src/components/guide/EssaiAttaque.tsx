import { useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { DIVISEUR_ATTAQUE, partageAttaque } from "../../lib/guide-clan";
import IconePartie from "../compte/IconePartie";
import Reglage from "./Reglage";

const CASQUES = Array.from({ length: DIVISEUR_ATTAQUE }, (_, i) => i);

/**
 * Chapitre 1 : combien de troupes partent avec une attaque, et combien restent en défense. Le curseur d'attaque d'un
 * joueur est réglé à 20 % par défaut : un casque sur cinq part. La règle du guide, calculée par `partageAttaque`.
 */
export default function EssaiAttaque() {
  const [troupes, setTroupes] = useState(50_000);
  const { attaque, defense } = partageAttaque(troupes);

  return (
    <div data-testid="essai-attaque">
      <Reglage
        id="essai-attaque-troupes"
        nom="Vos troupes"
        valeur={troupes}
        min={10_000}
        max={1_000_000}
        pas={10_000}
        texte={fmtInt(troupes)}
        lu={`${fmtInt(troupes)} troupes : ${fmtInt(attaque)} partent à l'attaque, ${fmtInt(defense)} restent en défense`}
        onChange={setTroupes}
      />
      {/* Décoratif : la même règle en image, un casque sur cinq. Les deux chiffres dessous la disent en clair. */}
      <div class="guide-pions" aria-hidden="true" data-testid="essai-attaque-pions">
        {CASQUES.map((i) => (
          <IconePartie key={i} nom="casque" classe={i === 0 ? "guide-pion guide-pion-vif" : "guide-pion"} />
        ))}
      </div>
      <div class="kpi-row guide-mesures">
        <div class="kpi kpi-accent">
          <p class="kpi-label">Partent à l'attaque</p>
          <p class="kpi-value kpi-value-sm" data-testid="essai-attaque-part">
            {fmtInt(attaque)}
          </p>
          <p class="kpi-hint">1 troupe sur {DIVISEUR_ATTAQUE}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Restent en défense</p>
          <p class="kpi-value kpi-value-sm" data-testid="essai-attaque-reste">
            {fmtInt(defense)}
          </p>
          <p class="kpi-hint">
            {DIVISEUR_ATTAQUE - 1} troupes sur {DIVISEUR_ATTAQUE}
          </p>
        </div>
      </div>
    </div>
  );
}
