import { useEffect, useState } from "preact/hooks";
import { nombreEcrit } from "../../../lib/jeu/ecriture";
import { avantMinuitAParis, dureeEnMots, etatDuPlafond } from "../../../lib/village/ecran-casino";
import { useCasino } from "./contexte";
import { Mots, Pic } from "./Pieces";

/**
 * Le plafond du jour, lisible d'un coup d'œil (demande du pilote, 24 novembre 2026 : « que ce soit mieux lisible quand on
 * dépasse ce montant ») : le bandeau du hall, avec le compte à rebours jusqu'à minuit (heure de Paris), et la ligne de chaque
 * pupitre, éteint tant que le plafond est atteint. Les nombres sont ceux de `get_casino` (`plafond`, `reste_du_jour`) : rien
 * n'est écrit dans l'écran. À minuit, le casino relit son état : le pupitre se rallume de lui-même.
 */

const JOUR_A_PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** L'heure, relue chaque demi-minute tant que le plafond est atteint ; au changement de jour à Paris, le casino relit le serveur. */
function useAvantMinuit(actif: boolean): { heures: number; minutes: number } {
  const { relire } = useCasino();
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    if (!actif) return;
    const jour = JOUR_A_PARIS.format(new Date());
    setMaintenant(new Date());
    const minuterie = setInterval(() => {
      const n = new Date();
      setMaintenant(n);
      if (JOUR_A_PARIS.format(n) !== jour) relire();
    }, 30_000);
    return () => clearInterval(minuterie);
  }, [actif]);
  return avantMinuitAParis(maintenant);
}

/** Le plafond dans un pupitre : atteint, une phrase visible à côté des jetons éteints ; bas, ce qu'il reste, discrètement. */
export function LigneDuPlafond() {
  const { etat } = useCasino();
  const p = etatDuPlafond(etat);
  const avant = useAvantMinuit(p?.niveau === "atteint");
  if (!p) return null;
  if (p.niveau === "bas")
    return (
      <div class="cas-plafond cas-plafond-bas" data-testid="casino-plafond">
        <Mots t={`Encore ${nombreEcrit(p.reste)} statères aujourd'hui`} couleur="doux" plie dit={`Il reste ${p.reste} statères à miser aujourd'hui`} />
      </div>
    );
  return (
    <div class="cas-plafond cas-plafond-atteint" role="status" data-testid="casino-plafond">
      <Pic nom="sablier" />
      <span class="cas-plafond-mots">
        <Mots t="Plafond du jour atteint" couleur="or" plie />
        <Mots t={`Le casino rouvre à minuit, dans ${dureeEnMots(avant)}`} couleur="doux" plie />
      </span>
    </div>
  );
}

/** Le bandeau du hall quand le plafond du jour est atteint : ce qui a été misé, et le compte à rebours jusqu'à minuit. */
export function BandeauDuPlafond() {
  const { etat } = useCasino();
  const p = etatDuPlafond(etat);
  const avant = useAvantMinuit(p?.niveau === "atteint");
  if (p?.niveau !== "atteint") return null;
  const cases: [number, string][] = [
    [avant.heures, avant.heures > 1 ? "Heures" : "Heure"],
    [avant.minutes, avant.minutes > 1 ? "Minutes" : "Minute"],
  ];
  return (
    <section class="jeu-n9 cas-panneau cas-plafond-bandeau" aria-labelledby="cas-plafond-titre" data-testid="casino-plafond-bandeau">
      <div class="cas-plafond-tete">
        <Pic nom="sablier" />
        <span class="cas-plafond-mots">
          <h4 id="cas-plafond-titre" class="cas-plafond-titre">
            <Mots t="Plafond du jour atteint" couleur="or" p={3} plie />
          </h4>
          <Mots t={`${nombreEcrit(p.misee)} statères misés aujourd'hui, tous jeux ensemble`} plie />
        </span>
      </div>
      <div class="cas-plafond-compte">
        <p class="cas-plafond-chiffres" role="timer" aria-live="off" aria-label={`Le casino rouvre à minuit, heure de Paris, dans ${dureeEnMots(avant)}`}>
          {cases.map(([n, mot]) => (
            <span key={mot.charAt(0)} class="cas-plafond-case">
              <Mots t={String(n).padStart(2, "0")} couleur="or" p={4} muet />
              <Mots t={mot} couleur="doux" muet />
            </span>
          ))}
        </p>
        <Mots t="Le casino rouvre à minuit, heure de Paris" couleur="doux" plie muet />
      </div>
    </section>
  );
}
