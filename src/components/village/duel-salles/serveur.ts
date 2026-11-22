/**
 * Le lien de l'écran des salles avec le serveur : l'état relu environ chaque seconde (sans abonnement en temps réel), les
 * gestes envoyés, l'écart entre l'horloge de l'appareil et celle du serveur. Le serveur décide de tout ; ici, seulement
 * le rythme des appels et la mise en forme de ce qu'il rend (`src/lib/village/ecran-salles.ts`).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, salles } from "../../../lib/compte/api";
import type { EtatDesSalles } from "../../../lib/village/contrat-salles";
import { ecartDHorloge, lireLesSalles } from "../../../lib/village/ecran-salles";
import type { MainDuDuel } from "../../../lib/village/contrat-duel";
import { messageOf } from "../../compte/common";

/** Les secondes entre deux lectures : chaque seconde dans une salle ou un match, moins souvent dans le hall. */
const RYTHME_DU_MATCH = 1000;
const RYTHME_DU_HALL = 4000;

export interface LienDesSalles {
  etat: EtatDesSalles | null;
  /** Le serveur ne répond pas, ou a refusé le dernier geste : son message ; `null` sinon. */
  erreur: string | null;
  /** La dernière lecture n'a pas abouti (réseau, ou serveur qui n'a pas encore les salles) : l'écran le dit et réessaie. */
  panne: boolean;
  /** L'écart d'horloge, en millisecondes, à ajouter à `Date.now()`. */
  ecart: number;
  /** Un geste part : les boutons attendent. */
  envoi: boolean;
  entrer: (mise: number, main: MainDuDuel) => Promise<boolean>;
  poser: (match: number, manche: number, carte: number) => Promise<EtatDesSalles>;
  /** Quitte la salle ; avec `match`, quitte aussi ce match (il est perdu). */
  quitter: (match?: number | null) => Promise<boolean>;
  effacerErreur: () => void;
}

/**
 * L'état des salles, tenu à jour. Une seule relecture à la fois. Chaque appel a son numéro : l'écran ne montre jamais un
 * état plus vieux que le dernier montré ; la réponse d'un geste est toujours rendue au geste (la scène en a besoin), même
 * quand une relecture plus récente l'a déjà dépassée. Rien ne continue une fois l'écran fermé.
 */
export function useLienDesSalles(): LienDesSalles {
  const [etat, setEtat] = useState<EtatDesSalles | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [panne, setPanne] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const ecart = useRef(0);
  const numero = useRef(0);
  // Le numéro du dernier état montré.
  const montre = useRef(0);
  const enVol = useRef(false);
  const vivant = useRef(true);
  const dernier = useRef<EtatDesSalles | null>(null);

  /** Lit une réponse ; la montre si elle est plus récente que la dernière montrée. Rend l'état lu, ou `null` s'il est illisible. */
  const appliquer = (brut: unknown, n: number, recuLe: number): EtatDesSalles | null => {
    const e = lireLesSalles(brut);
    if (!e) return null;
    if (vivant.current && n > montre.current) {
      montre.current = n;
      ecart.current = ecartDHorloge(e.maintenant, recuLe);
      dernier.current = e;
      setEtat(e);
    }
    return e;
  };

  const lire = async (): Promise<void> => {
    if (enVol.current) return;
    enVol.current = true;
    const n = ++numero.current;
    try {
      const brut = await salles.etat();
      // Une réponse « ok » qui ne se lit pas est une panne : l'écran le dit au lieu d'attendre.
      setPanne(appliquer(brut, n, Date.now()) === null);
    } catch (e) {
      // trop d'appels : la lecture suivante passera ; un refus du serveur (compte suspendu, duel fermé) se dit
      if (e instanceof ServerError && e.code === "rate_limited") return;
      if (e instanceof ServerError && e.code !== "network") setErreur(messageOf(e));
      setPanne(true);
    } finally {
      enVol.current = false;
    }
  };

  useEffect(() => {
    vivant.current = true;
    let minuterie = 0;
    const suivant = (): void => {
      if (!vivant.current) return;
      const e = dernier.current;
      const rythme = e && (e.match || e.attente) ? RYTHME_DU_MATCH : RYTHME_DU_HALL;
      minuterie = window.setTimeout(() => {
        if (vivant.current) void lire().finally(suivant);
      }, rythme);
    };
    // La première relecture d'abord : son état dit le rythme des suivantes (chaque seconde dans un match).
    void lire().finally(suivant);
    return () => {
      vivant.current = false;
      window.clearTimeout(minuterie);
    };
  }, []);

  const geste = async (f: () => Promise<unknown>): Promise<{ ok: true; e: EtatDesSalles } | { ok: false; erreur: unknown }> => {
    setEnvoi(true);
    const n = ++numero.current;
    try {
      const e = appliquer(await f(), n, Date.now());
      setErreur(null);
      return e ? { ok: true, e } : { ok: false, erreur: new Error("Réponse illisible") };
    } catch (err) {
      setErreur(messageOf(err));
      return { ok: false, erreur: err };
    } finally {
      setEnvoi(false);
    }
  };

  return {
    etat,
    erreur,
    panne,
    ecart: ecart.current,
    envoi,
    entrer: async (mise, main) => (await geste(() => salles.entrer(mise, main))).ok,
    poser: async (match, manche, carte) => {
      const r = await geste(() => salles.poser(match, manche, carte));
      if (!r.ok) throw r.erreur;
      return r.e;
    },
    quitter: async (match = null) => (await geste(() => salles.quitter(match))).ok,
    effacerErreur: () => setErreur(null),
  };
}
