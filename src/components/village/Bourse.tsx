import { basePath } from "../../lib/compte/api";
import { STATERES_PAR_POINT, type MesStateres } from "../../lib/stateres";
import { MESSAGES_BOURSE, SOLDE_INCONNU, etatDeLaBourse, instant, jour, motStatere, nombre, points, soldeAMontrer } from "../../lib/village/ecran-boutique";
import { Piece } from "./BoutiquePixels";

/**
 * La bourse : le solde de statères du membre, d'où ils viennent, quand le serveur a relu les parties, et les derniers
 * reçus dans un pli. Le solde est privé : il ne se lit que sur l'écran de son propriétaire. `solde` : le dernier solde
 * connu, après un achat ; sinon celui de la bourse.
 */
export function Bourse({ bourse, solde }: { bourse: MesStateres; solde: number | null }) {
  const etat = etatDeLaBourse(bourse);
  const message = MESSAGES_BOURSE[etat];
  const montre = soldeAMontrer({ ...bourse, solde: solde ?? bourse.solde });
  return (
    <section class="bourse sentier-carte" data-ton="or" aria-labelledby="bourse-titre" data-testid="bourse" data-etat={etat}>
      {/* La même carte que celles du sentier (17 novembre 2026) : son dessin, son titre, et la règle des statères en pastille. */}
      <div class="sentier-carte-tete">
        <span class="sentier-carte-dessin" aria-hidden="true">
          <Piece taille={24} echelle={2} />
        </span>
        <div>
          <h4 id="bourse-titre">Votre bourse</h4>
        </div>
        <span class="sentier-gain tnum">{STATERES_PAR_POINT} statères par point rapporté au clan</span>
      </div>
      <p class="bourse-solde" data-testid="bourse-solde">
        {montre === null ? (
          <span class="bourse-inconnu">{SOLDE_INCONNU}</span>
        ) : (
          <>
            <span class="bourse-nombre tnum">{nombre(montre)}</span>{" "}
            <span class="bourse-unite">{motStatere(montre)}</span>
          </>
        )}
      </p>
      {message && (
        <p class="bourse-etat" data-testid="bourse-etat">
          {message}
          {(etat === "pas-valide" || etat === "pas-lie") && (
            <>
              {" "}
              <a href={`${basePath()}/compte`}>Voir mon compte</a>
            </>
          )}
        </p>
      )}
      {bourse.releve && (
        <p class="info-discrete" data-testid="bourse-releve">
          Parties relues le {instant(bourse.releve)}
        </p>
      )}
      {bourse.credits.length > 0 && (
        <details class="fold bourse-credits" data-testid="bourse-credits">
          <summary>Derniers statères reçus</summary>
          <table class="bourse-table">
            <caption class="sr-only">Les derniers statères reçus, partie par partie</caption>
            <thead>
              <tr>
                <th scope="col">Partie du</th>
                <th scope="col">Points</th>
                <th scope="col">Statères</th>
              </tr>
            </thead>
            <tbody>
              {bourse.credits.map((credit, i) => (
                <tr key={`${credit.partie}-${i}`}>
                  <td>{instant(credit.debut)}</td>
                  <td class="tnum">{points(credit.points)}</td>
                  <td class="tnum">{nombre(credit.stateres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bourse.depart && <p class="info-discrete">Parties comptées depuis le {jour(bourse.depart)}</p>}
        </details>
      )}
    </section>
  );
}
