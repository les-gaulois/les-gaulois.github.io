import { useEffect, useState } from "preact/hooks";
import { salles } from "../../../lib/compte/api";
import { SALLES_DU_DUEL } from "../../../lib/village/contrat-salles";
import { lireLesSalles, stateresEnMots } from "../../../lib/village/ecran-salles";
import { Etiquette, Px } from "../../jeu/Pixels";
import { PrixDuJeu } from "../BoutiqueDuJeu";
import { SON } from "../duel/sons-du-duel";
import { emblemeDeSalle, iconeCagnotte, iconeDesSalles } from "./dessins-salles";
import { ImageDesSalles } from "./pieces";

/**
 * L'entrée « Les salles » dans l'accueil du duel (dessin de Claude Fable 5.2) : un panneau sur toute la largeur, l'icône
 * des salles, la frise des six emblèmes et la cagnotte de la saison. Posée par l'accueil du duel (`LeDuel.tsx`, à la
 * session de l'écran du duel) ; elle lit elle-même l'état des salles et ne paraît que si le serveur les connaît : tant que
 * la migration des salles n'est pas collée, ou si le serveur refuse, rien ne s'affiche. Un match en cours (une page
 * rechargée, un retour par le menu) ouvre les salles tout de suite : le temps de la manche court.
 */
export function EntreeDesSalles({ onOuvrir }: { onOuvrir: () => void }) {
  const [etat, setEtat] = useState<{ montant: number; saison: string; attente: boolean } | null>(null);
  useEffect(() => {
    let fini = false;
    salles.etat().then(
      (brut) => {
        const e = lireLesSalles(brut);
        if (fini || !e) return;
        if (e.match) onOuvrir();
        else setEtat({ ...e.cagnotte, attente: e.attente !== null });
      },
      () => undefined,
    );
    return () => {
      fini = true;
    };
  }, []);
  if (!etat) return null;
  const cagnotte = etat;
  const mot = cagnotte.saison === "a-venir" ? "Cagnotte" : "Cagnotte de la saison";
  return (
    <button
      type="button"
      class="jeu-panneau jeu-n9 dl-p dl-p-lien ds-entree"
      data-testid="salles-entree"
      onClick={() => {
        SON.clic();
        onOuvrir();
      }}
    >
      <span class="dl-p-tete">
        <ImageDesSalles cle="icone" planche={iconeDesSalles} />
        <Px t="Les salles" couleur="texte" />
        {etat.attente && <Etiquette t="Tu attends" ton="or" dit="Tu attends dans une salle." />}
        <span class="dl-p-droite ds-entree-droite">
          <span class="ds-frise" aria-hidden="true">
            {SALLES_DU_DUEL.map((mise) => (
              <ImageDesSalles key={mise} cle={`embleme-${mise}`} planche={() => emblemeDeSalle(mise)} />
            ))}
          </span>
          <span class="ds-cagnotte">
            <ImageDesSalles cle="cagnotte" planche={iconeCagnotte} />
            <span class="sr-only">{`${mot} : ${stateresEnMots(cagnotte.montant)}.`}</span>
            <span aria-hidden="true">
              <PrixDuJeu valeur={cagnotte.montant} />
            </span>
          </span>
        </span>
      </span>
      <span class="dl-p-mot ds-entree-mot">Un vrai Gaulois en face, une mise chacun.</span>
    </button>
  );
}
