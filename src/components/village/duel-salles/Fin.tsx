import { useEffect, useRef } from "preact/hooks";
import type { MatchDeSalle } from "../../../lib/village/contrat-salles";
import { issueEnMots, stateresEnMots } from "../../../lib/village/ecran-salles";
import { jouer as jouerUnSon } from "../../../lib/jeu/sons";
import { Px } from "../../jeu/Pixels";
import { PieceDuJeu, PrixDuJeu } from "../BoutiqueDuJeu";
import { SON } from "../duel/sons-du-duel";
import { iconeCagnotte, iconeMachine, iconeRendue, iconeVerrou, sablier } from "./dessins-salles";
import { ImageDesSalles, Mot, ROUGE, VERT, enChiffres } from "./pieces";

/**
 * Le panneau de fin d'un match (dessin de Claude Fable 5.2) : l'issue, ce que tu reçois ou perds, la raison quand ce n'est
 * pas un combat, la part de la cagnotte ; « Rejouer » dans la même salle, ou « Les salles ». Les nombres viennent du
 * serveur (`gain`, `cagnotte`, `mise`), jamais recalculés. Posé sur un voile au-dessus de l'arène, ou seul dans le hall.
 */
export function FinDuMatch({ match, permise, envoi, onRejouer, onRetour }: { match: MatchDeSalle; permise: boolean; envoi: boolean; onRejouer: () => void; onRetour: () => void }) {
  const issue = issueEnMots(match);
  const v = match.verdict ?? 0;
  const rejouer = useRef<HTMLButtonElement>(null);
  const retour = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (permise ? rejouer : retour).current?.focus({ preventScroll: true });
    if (v > 0 && !match.essai) {
      jouerUnSon("carillon", 0, 3);
      jouerUnSon("piece", 0.25);
    }
  }, [match.match]);
  const titre = match.essai ? (v > 0 ? "Essai gagné" : v < 0 ? "Essai perdu" : "Essai : égalité") : v > 0 ? "Victoire" : v < 0 ? "Défaite" : "Égalité";
  const dit = [titre + ".", issue.argent, issue.raison, issue.cagnotte].filter(Boolean).join(" ");
  return (
    <div class="jeu-panneau jeu-n9 dl-p ds-fin" data-verdict={v} role="dialog" aria-labelledby="ds-fin-titre" data-testid="salles-fin">
      <h4 id="ds-fin-titre" class={`jeu-ruban jeu-n9 ds-fin-ruban ${v > 0 && !match.essai ? "" : "jeu-ruban-bleu"}`}>
        <Px t={titre} couleur="creme" relief="ombre" />
      </h4>
      <p class="sr-only" role="status">
        {dit}
      </p>
      {!match.essai && (
        <p class="ds-fin-gain" aria-hidden="true">
          {v > 0 ? (
            <>
              <PieceDuJeu />
              <Mot t={`Gagné ${enChiffres(match.gain ?? 0)}`} {...VERT} />
            </>
          ) : v < 0 ? (
            <Mot t={`Perdu ${enChiffres(match.mise)}`} {...ROUGE} />
          ) : (
            <>
              <ImageDesSalles cle="rendue" planche={iconeRendue} />
              <Px t="Mise rendue" couleur="texte" muet />
            </>
          )}
        </p>
      )}
      <div class="ds-fin-lignes" aria-hidden="true">
        {match.essai && (
          <p class="dl-p-mot ds-fin-ligne">
            <ImageDesSalles cle="machine" planche={iconeMachine} />
            Rien n'était misé.
          </p>
        )}
        {issue.raison && (
          <p class="dl-p-mot ds-fin-ligne">
            {match.fin === "temps" && <ImageDesSalles cle="sablier-0" planche={() => sablier(0)} />}
            {issue.raison}
          </p>
        )}
        {!match.essai && v === 0 && <p class="dl-p-mot ds-fin-ligne">{`Chacun reprend ses ${stateresEnMots(match.mise)}.`}</p>}
        {!match.essai && match.cagnotte !== null && match.cagnotte > 0 && (
          <p class="dl-p-mot ds-fin-ligne">
            <ImageDesSalles cle="cagnotte" planche={iconeCagnotte} />
            {`Cagnotte de la saison : ${enChiffres(match.cagnotte)}`}
          </p>
        )}
      </div>
      <div class="ds-fin-boutons">
        <button
          ref={rejouer}
          type="button"
          class="jeu-btn jeu-n9 ds-rejouer"
          disabled={!permise || envoi}
          aria-label={`Rejouer dans la salle à ${stateresEnMots(match.mise)}`}
          data-testid="salles-rejouer"
          onClick={() => {
            SON.clic();
            onRejouer();
          }}
        >
          {!permise && <ImageDesSalles cle="verrou" planche={iconeVerrou} />}
          <Px t="Rejouer" couleur="encre" muet />
          <PrixDuJeu valeur={match.mise} couleur="encre" />
        </button>
        <button
          ref={retour}
          type="button"
          class="jeu-btn jeu-btn-bleu jeu-n9 ds-retour"
          data-testid="salles-retour-hall"
          onClick={() => {
            SON.clic();
            onRetour();
          }}
        >
          <Px t="Les salles" couleur="creme" relief="cerne" />
        </button>
      </div>
    </div>
  );
}
