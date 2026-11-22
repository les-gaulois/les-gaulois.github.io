import type { JSX } from "preact";
import { Etiquette, Px } from "../../jeu/Pixels";
import { PrixDuJeu } from "../BoutiqueDuJeu";
import { SON } from "../duel/sons-du-duel";
import type { MoteurDuDuel } from "../duel/moteur";
import type { EtatDesSalles, MiseDeSalle } from "../../../lib/village/contrat-salles";
import { stateresEnMots } from "../../../lib/village/ecran-salles";
import { emblemeDeSalle, iconeCagnotte, iconeMachine, iconeVerrou } from "./dessins-salles";
import { EMPLACEMENTS_DE_LA_MAIN, nomDeLObjet } from "../../../lib/village/ecran-duel";
import { ImageDesSalles, PetiteCarte, ROUGE, Mot, TeteDesSalles } from "./pieces";

/** La cagnotte de la saison, dans la tête des écrans des salles. */
export function CagnotteDeLaTete({ e }: { e: EtatDesSalles }) {
  const mot = e.cagnotte.saison === "a-venir" ? "Cagnotte" : "Cagnotte de la saison";
  return (
    <span class="ds-cagnotte" data-testid="salles-cagnotte">
      <ImageDesSalles cle="cagnotte" planche={iconeCagnotte} />
      <Px t={mot} couleur="doux" classe="ds-cagnotte-mot" muet />
      <span class="sr-only">{`${mot} : ${stateresEnMots(e.cagnotte.montant)}`}</span>
      <span aria-hidden="true">
        <PrixDuJeu valeur={e.cagnotte.montant} />
      </span>
    </span>
  );
}

/** Le bandeau de l'essai, tant que le duel est fermé : la machine joue en face, rien n'est misé. */
export function BandeauDEssai() {
  return (
    <p class="ds-essai" data-testid="salles-essai">
      <ImageDesSalles cle="machine" planche={iconeMachine} />
      <Etiquette t="Essai" ton="bleu" />
      <span class="ds-essai-long">La machine joue en face. Rien n'est misé.</span>
      <span class="ds-essai-court" aria-hidden="true">
        Essai : rien n'est misé.
      </span>
    </p>
  );
}

/** Une ligne de refus, toujours à la même place. */
export function Refus({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p class="ds-refus" role="alert" data-testid="salles-refus">
      <ImageDesSalles cle="verrou" planche={iconeVerrou} />
      <span>{message}</span>
    </p>
  );
}

/**
 * Le hall des salles : ta main (à changer dans le tiroir du recueil), les six salles, les matchs du jour, la cagnotte, les
 * règles. Une salle ne montre que son prix et si un Gaulois y attend ; une salle fermée pour toi, un cadenas.
 */
export function Hall({
  e,
  m,
  main,
  mainValide,
  envoi,
  refus,
  retour,
  onChanger,
  onEntrer,
}: {
  e: EtatDesSalles;
  m: MoteurDuDuel;
  main: readonly string[];
  mainValide: boolean;
  envoi: number | null;
  refus: string | null;
  retour: () => void;
  onChanger: (i: number) => void;
  onEntrer: (mise: MiseDeSalle) => void;
}) {
  const plein = e.ouvert && e.jour.joues >= e.jour.au_plus;
  return (
    <section class="dl-ecran ds-hall" aria-label="Les salles" data-testid="salles-hall">
      <TeteDesSalles titre="Les salles" retour={retour} droite={<CagnotteDeLaTete e={e} />} />
      {!e.ouvert && <BandeauDEssai />}
      <div class="ds-haut">
        <div class="jeu-panneau jeu-n9 dl-p ds-main">
          <div class="dl-p-tete">
            <Px t="Ta main" couleur="texte" />
          </div>
          <div class="ds-main-corps">
            <div class="ds-main-cartes dl-mini-main" role="group" aria-label="Les cinq cartes de ta main">
              {main.map((id, i) => (
                <button
                  key={`${i}-${id}`}
                  type="button"
                  class="ds-main-carte"
                  aria-label={`Changer : ${nomDeLObjet(EMPLACEMENTS_DE_LA_MAIN[i]!, id)}`}
                  onClick={() => {
                    SON.clic();
                    onChanger(i);
                  }}
                >
                  <PetiteCarte m={m} id={id} />
                </button>
              ))}
            </div>
            <button
              type="button"
              class="jeu-btn jeu-btn-bleu jeu-n9 ds-changer"
              data-testid="salles-changer"
              onClick={() => {
                SON.clic();
                onChanger(0);
              }}
            >
              <Px t="Changer" couleur="creme" relief="cerne" dit="Changer l'arme ; chaque carte se change aussi d'un clic" />
            </button>
          </div>
          {!mainValide && <p class="dl-p-mot ds-main-refus">Cette main ne se joue plus : change-la.</p>}
        </div>
        {e.ouvert && (
          <div class="jeu-panneau jeu-n9 dl-p ds-jour" data-testid="salles-jour">
            <div class="ds-jour-ligne">
              <Px t={`${e.jour.joues} sur ${e.jour.au_plus}`} couleur="texte" dit={`${e.jour.joues} matchs avec mise joués sur ${e.jour.au_plus} aujourd'hui`} />
              <Px t="aujourd'hui" couleur="doux" muet />
            </div>
            <span class="jeu-tube jeu-n9 jeu-crans ds-jour-tube" aria-hidden="true">
              <span class={`jeu-plein jeu-n9 ${plein ? "jeu-plein-or" : "jeu-plein-bleu"}`} style={{ "--part": Math.min(1, e.jour.joues / Math.max(1, e.jour.au_plus)) } as JSX.CSSProperties} />
            </span>
            {plein && <Mot t="Reviens demain" {...ROUGE} classe="ds-jour-demain" />}
          </div>
        )}
      </div>
      <div class="ds-salles" role="group" aria-label="Choisir une salle" data-testid="salles-liste">
        {e.salles.map((s, i) => {
          const ferme = !s.permise || !mainValide;
          const etat = ferme ? "ferme" : s.attente ? "attend" : "libre";
          const dit = `Salle à ${stateresEnMots(s.mise)}${!e.ouvert ? ", essai" : ferme ? ", fermée pour toi" : s.attente ? ", un Gaulois y attend" : ""}`;
          return (
            <button
              key={s.mise}
              type="button"
              class="jeu-panneau jeu-n9 ds-salle"
              data-etat={etat}
              data-envoi={envoi === null ? undefined : envoi === s.mise ? "moi" : "autre"}
              data-testid={`salle-${s.mise}`}
              disabled={ferme || envoi !== null}
              style={{ "--ds-retard": `${i}s` } as JSX.CSSProperties}
              onClick={() => {
                SON.clic();
                onEntrer(s.mise);
              }}
            >
              <span class="sr-only">{dit}</span>
              {etat === "attend" && <Etiquette t="Attend" ton="or" classe="ds-salle-attend" />}
              {etat === "ferme" && <ImageDesSalles cle="verrou" planche={iconeVerrou} classe="ds-verrou" />}
              <ImageDesSalles cle={`embleme-${s.mise}`} planche={() => emblemeDeSalle(s.mise)} classe="ds-embleme" />
              <span class="ds-prix" aria-hidden="true">
                <PrixDuJeu valeur={s.mise} />
              </span>
            </button>
          );
        })}
      </div>
      <Refus message={refus} />
      <details class="fold ds-regles">
        <summary>Les règles</summary>
        <ul>
          <li>Tu entres avec ta main de cinq cartes. Le premier Gaulois qui attend est ton adversaire.</li>
          <li>{e.regles.secondes} secondes par manche. Qui ne pose pas à temps, ou qui quitte, perd le match.</li>
          <li>Le gagnant reçoit les deux mises, moins {e.regles.part_cagnotte} pour cent pour la cagnotte de la saison.</li>
          <li>Égalité : chacun reprend sa mise.</li>
          <li>
            {e.regles.par_jour} matchs avec mise par jour, {e.regles.meme_adversaire} au plus contre le même Gaulois.
          </li>
          <li>L'écran relit le serveur chaque seconde : ce n'est pas du temps réel à la seconde près.</li>
          {!e.ouvert && <li>Tant que le duel est fermé, la machine joue en face, au niveau du guerrier, et rien n'est misé.</li>}
        </ul>
      </details>
    </section>
  );
}
