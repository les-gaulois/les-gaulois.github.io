import { useState } from "preact/hooks";
import { OBJETS, vignetteDeLObjet, type Emplacement, type RareteDObjet } from "../../lib/gaulois";
import { carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { tirageDEssai } from "../../lib/village/demo-booster";
import { cleDeLObjet } from "../../lib/village/fonds-objets";
import { Px } from "../jeu/Pixels";
import { CarteDeCosmetique } from "../village/CarteDeCosmetique";
import { BoutonDesBoosters, FenetreDuBooster } from "../village/KitDesBoosters";
import { OuvertureDuBooster } from "../village/OuvertureDuBooster";

/**
 * L'ouverture du booster d'essai de l'accueil (22 novembre 2026), chargée au premier clic sur « Ouvrir » seulement : le
 * catalogue des objets et l'animation pèsent lourd, et la plupart des visiteurs de l'accueil n'ouvrent rien. La même
 * fenêtre, la même animation et le même tirage d'exemple que la démonstration de « Mon Gaulois » (`DemoDuJeu.tsx`) : rien
 * n'est envoyé au serveur, ni enregistré, ni donné, et l'écran le dit. Un nouveau tirage à chaque fenêtre ouverte.
 */

interface Essai {
  nom: string;
  emplacement: Emplacement;
  objet: string;
  rarete: RareteDObjet;
  carte: CarteDeScene;
}

function tirer(): Essai | null {
  const tire = tirageDEssai();
  if (!tire) return null;
  const nom = OBJETS[tire.emplacement][tire.objet]?.nom ?? "Objet";
  return { nom, emplacement: tire.emplacement, objet: tire.objet, rarete: tire.rarete, carte: carteDeRarete(nom, tire.rarete, vignetteDeLObjet(tire.emplacement, tire.objet), { cle: cleDeLObjet(tire.emplacement, tire.objet) }) };
}

export function FenetreDEssai({ village, onEncore, onFermer }: { village: string; onEncore: () => void; onFermer: () => void }) {
  const [essai] = useState(tirer);
  const [revelee, setRevelee] = useState(false);
  if (!essai) return null;
  return (
    <FenetreDuBooster titre="Booster d'essai" etape={revelee ? "revele" : "ouvre"} occupe={false} scene onFermer={onFermer} testid="home-fenetre">
      <OuvertureDuBooster
        sorte="surprise"
        carte={essai.carte}
        revelee={revelee}
        onRevelee={() => setRevelee(true)}
        carteFinale={
          <CarteDeCosmetique
            nom={OBJETS[essai.emplacement][essai.objet]?.nom ?? essai.nom}
            rarete={essai.rarete}
            dessin={vignetteDeLObjet(essai.emplacement, essai.objet)}
            cle={cleDeLObjet(essai.emplacement, essai.objet)}
            grande
            testid="home-tirage"
          />
        }
      >
        <p class="bst-mot">Tirage d'exemple : cet objet n'est ni enregistré ni donné. Les vrais boosters se gagnent en jouant avec [GAL].</p>
        <div class="bst-actions">
          <a class="jeu-btn jeu-n9" href={village} data-testid="home-fenetre-creer">
            <Px t="Créer mon Gaulois" couleur="encre" />
          </a>
          <BoutonDesBoosters t="Encore un" dit="Ouvrir un autre booster d'essai" onClick={onEncore} testid="home-encore" />
          <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="home-fermer" />
        </div>
      </OuvertureDuBooster>
    </FenetreDuBooster>
  );
}
