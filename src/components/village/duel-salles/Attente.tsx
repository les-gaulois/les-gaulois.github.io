import { useEffect, useState } from "preact/hooks";
import type { Tenue } from "../../../lib/gaulois";
import type { EtatDesSalles } from "../../../lib/village/contrat-salles";
import type { Familier } from "../../../lib/village/familiers";
import { stateresEnMots } from "../../../lib/village/ecran-salles";
import { Px } from "../../jeu/Pixels";
import { PrixDuJeu } from "../BoutiqueDuJeu";
import { ApercuGaulois } from "../Cases";
import { SON } from "../duel/sons-du-duel";
import { emblemeDeSalle, placeVide } from "./dessins-salles";
import { CagnotteDeLaTete, Refus } from "./Hall";
import { ImageDesSalles, TeteDesSalles } from "./pieces";

/** Le temps écoulé depuis l'entrée, en minutes et secondes : « 0:42 ». C'est une heure : le seul signe de l'écran. */
export function tempsEcoule(depuis: string, maintenant: number): string {
  const s = Math.max(0, Math.floor((maintenant - Date.parse(depuis)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * L'attente dans une salle (dessin de Claude Fable 5.2) : ton Gaulois d'un côté, la place vide en face, le temps qui passe,
 * « Quitter la salle ». Tient dans un écran de téléphone. Le retour de la tête quitte aussi la salle, sans rien coûter.
 */
export function Attente({
  e,
  ecart,
  gaulois,
  nom,
  envoi,
  refus,
  onQuitter,
}: {
  e: EtatDesSalles;
  ecart: number;
  gaulois: { tenue: Tenue; familier: Familier | null };
  nom: string | null;
  envoi: boolean;
  refus: string | null;
  onQuitter: () => void;
}) {
  const a = e.attente!;
  const [maintenant, setMaintenant] = useState(() => Date.now() + ecart);
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now() + ecart), 1000);
    return () => window.clearInterval(id);
  }, [ecart]);
  const quitter = (): void => {
    SON.clic();
    onQuitter();
  };
  return (
    <section class="dl-ecran ds-attente" aria-label="Tu attends un adversaire" data-testid="salles-attente">
      <TeteDesSalles titre="Les salles" retour={quitter} dit="Quitter la salle" mot="Quitter" droite={<CagnotteDeLaTete e={e} />} />
      <p class="sr-only" role="status">
        {e.ouvert ? `Tu attends un adversaire dans la salle à ${stateresEnMots(a.mise)}.` : "Essai : la machine arrive dans quelques secondes."}
      </p>
      <div class="jeu-panneau jeu-n9 dl-p ds-attente-p">
        <h4 class={`jeu-ruban jeu-n9 ds-attente-ruban ${e.ouvert ? "" : "jeu-ruban-bleu"}`}>
          <Px t={e.ouvert ? "Salle" : "Essai"} couleur="creme" relief="ombre" muet />
          <PrixDuJeu valeur={a.mise} couleur="creme" />
        </h4>
        <div class="ds-place ds-place-moi">
          <ApercuGaulois tenue={gaulois.tenue} familier={gaulois.familier} class="dl-apercu-gaulois" />
          {nom && <Px t={nom} couleur="texte" classe="ds-nom" />}
        </div>
        <div class="ds-attente-milieu">
          <ImageDesSalles cle={`embleme-${a.mise}`} planche={() => emblemeDeSalle(a.mise)} classe="ds-embleme" />
          <span class="ds-temps" aria-hidden="true">
            <Px t={tempsEcoule(a.depuis, maintenant)} couleur="texte" muet />
          </span>
          <Px t={e.ouvert ? "On cherche un Gaulois" : "La machine arrive"} couleur="doux" plie />
          <span class="ds-points" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div class="ds-place ds-place-vide">
          <ImageDesSalles cle="place-vide" planche={placeVide} classe="ds-place-dessin" />
        </div>
      </div>
      <div class="ds-attente-bas">
        <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9 ds-quitter" disabled={envoi} data-testid="salles-quitter" onClick={quitter}>
          <Px t="Quitter la salle" couleur="creme" relief="cerne" />
        </button>
        {e.ouvert && <p class="dl-p-mot">Quitter maintenant ne coûte rien.</p>}
        <Refus message={refus} />
      </div>
    </section>
  );
}
