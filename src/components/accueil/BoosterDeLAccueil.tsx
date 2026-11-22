import { useState } from "preact/hooks";
import { paquetDuBooster } from "../../lib/jeu/boosters-dessins";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { Px } from "../jeu/Pixels";

/**
 * Le booster d'essai posé sur la table de l'accueil (22 novembre 2026, maquette « Le booster sur la table » retenue par le
 * pilote). La table ne pèse presque rien : le paquet, ses mots et le bouton. Le catalogue des objets et l'animation
 * d'ouverture (`EssaiDeLAccueil.tsx`) ne se chargent qu'au premier clic : un visiteur de l'accueil ne télécharge pas le
 * dessin des Gaulois sans rien ouvrir.
 */

type ModuleDEssai = typeof import("./EssaiDeLAccueil");

export default function BoosterDeLAccueil({ village }: { village: string }) {
  const [essai, setEssai] = useState<{ n: number; m: ModuleDEssai } | null>(null);
  const [charge, setCharge] = useState(false);

  const ouvrir = () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    if (charge) return;
    setCharge(true);
    void import("./EssaiDeLAccueil")
      .then((m) => setEssai((avant) => ({ n: (avant?.n ?? 0) + 1, m })))
      .catch((e: unknown) => console.error(e))
      .finally(() => setCharge(false));
  };
  const paquet = urlDeLaPlanche("booster|surprise", () => paquetDuBooster("surprise"));

  return (
    <div class="accueil-table jeu-panneau jeu-n9" data-testid="home-booster-table">
      <p class="accueil-table-ruban">
        <span class="jeu-ruban jeu-n9">
          <Px t="Booster d'essai" couleur="creme" relief="ombre" />
        </span>
      </p>
      <button type="button" class="accueil-paquet" onClick={ouvrir} data-testid="home-paquet">
        <i class="bst-paquet-img accueil-paquet-image" style={`--i:${paquet}`} aria-hidden="true" />
        <span class="sr-only">Ouvrir un booster d'essai</span>
      </button>
      <div class="accueil-table-actions">
        <button type="button" class="jeu-btn jeu-n9 accueil-grand" onClick={ouvrir} aria-busy={charge ? "true" : undefined} data-testid="home-ouvrir">
          <Px t="Ouvrir" couleur="encre" dit="Ouvrir un booster d'essai" />
        </button>
      </div>
      <p class="accueil-table-mot">Un tirage d'exemple : rien n'est enregistré ni donné.</p>
      {essai && <essai.m.FenetreDEssai key={essai.n} village={village} onEncore={ouvrir} onFermer={() => setEssai(null)} />}
    </div>
  );
}
