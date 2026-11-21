import { useState } from "preact/hooks";
import { OBJETS, vignetteDeLObjet } from "../../lib/gaulois";
import { carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { tirageDEssai } from "../../lib/village/demo-booster";
import { Px } from "../jeu/Pixels";
import { BoutonDesBoosters, FenetreDuBooster, PaquetEnImage, RareteEnPixels, ResultatDuBooster } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";

/**
 * La démonstration de « Mon Gaulois » pour les visiteurs qui ne sont pas connectés (21 novembre 2026, choix du pilote dans
 * la fiche de projet : la vitrine en démonstration, avec un booster de démonstration). Un booster d'essai s'ouvre avec la
 * même animation que celle des membres, sur un tirage d'exemple fait dans le navigateur (`src/lib/village/demo-booster.ts`) :
 * rien n'est envoyé au serveur, ni enregistré, ni donné, et l'écran le dit. Puis « Rejoins le clan pour jouer » : la page
 * Rejoindre, et la connexion quand elle est ouverte.
 *
 * Posée par `src/pages/village.astro`, à part de « Mon Gaulois » : elle marche sans le serveur. Avec le serveur, la page la
 * cache d'abord, et « Mon Gaulois » ne la montre qu'à qui n'est pas connecté (`VillageApp.tsx`).
 */

interface Essai {
  n: number;
  nom: string;
  rarete: string;
  carte: CarteDeScene;
}

/** « Se connecter » : la porte de « Mon Gaulois » est dans la page, juste au-dessus ; sinon, la page « Mon compte ». */
function versLaPorte(e: MouseEvent): void {
  // Un clic avec Ctrl, Cmd, Maj ou Alt ouvre la page « Mon compte » comme un lien ordinaire (nouvel onglet, fenêtre).
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const porte = document.querySelector<HTMLElement>('[data-testid="vestiaire-porte"]');
  if (!porte || porte.closest("[hidden]")) return;
  e.preventDefault();
  porte.scrollIntoView({ block: "center" });
  porte.querySelector<HTMLElement>("button, a[href]")?.focus({ preventScroll: true });
}

export default function DemoDuJeu({ rejoindre, connexion }: { rejoindre: string; connexion: string | null }) {
  const [essai, setEssai] = useState<Essai | null>(null);
  const [revelee, setRevelee] = useState(false);

  const ouvrir = () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    const tire = tirageDEssai();
    if (!tire) return;
    const nom = OBJETS[tire.emplacement][tire.objet]?.nom ?? "Objet";
    setRevelee(false);
    setEssai((avant) => ({ n: (avant?.n ?? 0) + 1, nom, rarete: tire.rarete, carte: carteDeRarete(nom, tire.rarete, vignetteDeLObjet(tire.emplacement, tire.objet)) }));
  };
  const fermer = () => setEssai(null);

  return (
    <div class="demo-jeu" data-testid="demo-jeu">
      <section class="demo-jeu-essai jeu-panneau jeu-n9" aria-labelledby="demo-jeu-essai-titre" data-testid="demo-booster">
        <h2 id="demo-jeu-essai-titre" class="demo-jeu-ruban">
          <span class="jeu-ruban jeu-n9">
            <Px t="Essayez un booster" couleur="creme" relief="ombre" />
          </span>
        </h2>
        <div class="demo-jeu-corps">
          <button type="button" class="demo-jeu-paquet" onClick={ouvrir} data-testid="demo-paquet">
            <PaquetEnImage sorte="surprise" classe="demo-jeu-paquet-image" />
            <span class="sr-only">Ouvrir un booster d'essai</span>
          </button>
          <div class="demo-jeu-texte">
            <p class="demo-jeu-mot">Un tirage d'exemple, fait dans votre navigateur avec les chances de départ du booster surprise : rien n'est enregistré ni donné.</p>
            <div class="demo-jeu-actions">
              <BoutonDesBoosters t="Ouvrir" dit="Ouvrir un booster d'essai" or onClick={ouvrir} testid="demo-ouvrir" />
            </div>
          </div>
        </div>
      </section>
      <section class="demo-jeu-rejoindre jeu-panneau jeu-n9" aria-labelledby="demo-jeu-rejoindre-titre" data-testid="demo-rejoindre">
        <h2 id="demo-jeu-rejoindre-titre" class="demo-jeu-ruban">
          <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
            <Px t="Rejoins le clan pour jouer" couleur="creme" relief="ombre" />
          </span>
        </h2>
        <p class="demo-jeu-mot">Les membres du clan habillent leur Gaulois, gagnent des statères avec les points qu'ils rapportent au clan, et ouvrent de vrais boosters.</p>
        <div class="demo-jeu-actions">
          <a class="jeu-btn jeu-n9" href={rejoindre} data-testid="demo-lien-rejoindre">
            <Px t="Rejoindre le clan" couleur="encre" />
          </a>
          {connexion && (
            <a class="jeu-btn jeu-btn-bleu jeu-n9" href={connexion} onClick={versLaPorte} data-testid="demo-lien-connexion">
              <Px t="Se connecter" couleur="creme" relief="cerne" />
            </a>
          )}
        </div>
      </section>
      {essai && (
        <FenetreDuBooster key={essai.n} titre="Booster d'essai" etape={revelee ? "revele" : "ouvre"} occupe={false} scene onFermer={fermer} testid="demo-fenetre">
          <OuvertureDuBooster sorte="surprise" carte={essai.carte} revelee={revelee} onRevelee={() => setRevelee(true)}>
            <ResultatDuBooster nom={essai.nom} detail={<RareteEnPixels rarete={essai.rarete} />} testid="demo-tirage">
              <p class="bst-mot">Tirage d'exemple : cet objet n'est ni enregistré ni donné.</p>
            </ResultatDuBooster>
            <div class="bst-actions">
              <a class="jeu-btn jeu-n9" href={rejoindre} data-testid="demo-fenetre-rejoindre">
                <Px t="Rejoindre le clan" couleur="encre" />
              </a>
              <BoutonDesBoosters t="Encore un" dit="Ouvrir un autre booster d'essai" onClick={ouvrir} testid="demo-encore" />
              <BoutonDesBoosters t="Fermer" onClick={fermer} testid="demo-fermer" />
            </div>
          </OuvertureDuBooster>
        </FenetreDuBooster>
      )}
    </div>
  );
}
