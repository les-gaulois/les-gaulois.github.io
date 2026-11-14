import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { CLE_DU_CARNET, type Carnet, type Palier, carnetVide, dureeDeLaBulle, ecrireCarnet, lireCarnet, ponctuer, sursaute, toucherLeGaulois } from "../../lib/village/toucher";
import type { Habitant } from "../../lib/village/vie";

/**
 * Toucher un Gaulois de la place (demande du pilote, le 14 novembre 2026) : un clic, un toucher ou le bouton « Parler à … »
 * de la liste « Qui est où » le fait répondre. La règle et les phrases sont dans `src/lib/village/toucher.ts` et
 * `repliques-toucher.ts` ; ici, le carnet gardé dans le navigateur, la bulle posée au-dessus du Gaulois, le bouton de la
 * liste et l'annonce aux lecteurs d'écran. Rien ne part au serveur.
 *
 * La bulle est une réponse à un geste : elle paraît aussi en pause et en « réduire les animations », posée sans mouvement.
 */

/** Ce que vient de dire un Gaulois. `tour` change à chaque toucher : deux phrases de suite se distinguent. */
export interface Parole {
  rang: number;
  nom: string;
  phrase: string;
  palier: Palier;
  tour: number;
  /** Il sursaute d'une case (le dessin seul, et seulement quand les animations tournent). */
  saut: boolean;
}

/** Le carnet du navigateur ; `null` quand il ne se lit pas (stockage interdit) ou qu'il n'y a encore rien. */
function lireDuNavigateur(): Carnet | null {
  try {
    const texte = window.localStorage.getItem(CLE_DU_CARNET);
    return texte === null ? null : lireCarnet(texte, Date.now());
  } catch {
    return null;
  }
}

/** Le carnet rangé dans le navigateur. Plein ou interdit : tant pis, le compte tient le temps de la page. */
function garderAuNavigateur(carnet: Carnet): boolean {
  try {
    window.localStorage.setItem(CLE_DU_CARNET, ecrireCarnet(carnet, Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** L'air gardé entre le haut de la scène et la bulle, en pixels. */
const MARGE_DU_HAUT = 4;

const estDe =(parole: Parole | null, habitant: Habitant): parole is Parole => parole !== null && parole.rang === habitant.rang && parole.nom === habitant.gaulois.nom;

/**
 * Le toucher, pour toute la place : `parole` est la bulle à montrer dans la scène (elle s'efface seule, le temps de la
 * lire), `dit` la dernière phrase dite, gardée pour la liste et l'annonce, `mot` le mot d'emploi tant que le visiteur n'a
 * encore touché personne.
 */
export function useToucher(): { parole: Parole | null; dit: Parole | null; mot: boolean; toucher: (habitant: Habitant) => void } {
  const memoire = useRef<Carnet>(carnetVide());
  const enPanne = useRef(false);
  const minuterie = useRef(0);
  const tour = useRef(0);
  const [parole, setParole] = useState<Parole | null>(null);
  const [dit, setDit] = useState<Parole | null>(null);
  const [mot, setMot] = useState(false);

  useEffect(() => {
    memoire.current = lireDuNavigateur() ?? memoire.current;
    setMot(!memoire.current.vu);
    return () => window.clearTimeout(minuterie.current);
  }, []);

  const toucher = (habitant: Habitant) => {
    // Relu à chaque toucher : un autre onglet a pu compter entre-temps. Sauf après une écriture refusée (stockage plein) :
    // ce qui est rangé est alors en retard, et le relire ferait piétiner le compte ; la mémoire de la page fait foi.
    const avant = enPanne.current ? memoire.current : (lireDuNavigateur() ?? memoire.current);
    const reponse = toucherLeGaulois(avant, habitant.gaulois, habitant.presence.lieu, Date.now());
    memoire.current = reponse.carnet;
    enPanne.current = !garderAuNavigateur(reponse.carnet);
    tour.current++;
    const nouvelle: Parole = { rang: habitant.rang, nom: habitant.gaulois.nom, phrase: reponse.phrase, palier: reponse.palier, tour: tour.current, saut: sursaute(reponse.palier, habitant.presence.lieu) };
    setParole(nouvelle);
    setDit(nouvelle);
    setMot(false);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setParole(null), dureeDeLaBulle(reponse.phrase));
  };

  return { parole, dit, mot, toucher };
}

/**
 * Dans la scène, au-dessus du Gaulois touché : son nom et ce qui le place là (ce que montrait déjà le survol), puis sa
 * phrase dans une bulle. Un seul toucher sur un téléphone donne donc les deux. Rien, si ce n'est pas lui qui parle.
 */
export function BulleDuToucher({ parole, habitant }: { parole: Parole | null | undefined; habitant: Habitant }) {
  const boite = useRef<HTMLSpanElement>(null);
  const lui = estDe(parole ?? null, habitant) && parole ? parole : null;
  // Tout en haut d'un lieu, une longue phrase dépasserait de la scène, qui la couperait : elle descend d'autant, quitte à
  // passer devant le casque. Recalculé quatre fois par seconde tant qu'elle est là : un promeneur peut se remettre à
  // marcher vers le haut pendant qu'il parle.
  useLayoutEffect(() => {
    const el = boite.current;
    const scene = el?.closest(".place-scene");
    if (!el || !scene) return;
    let descente = 0;
    el.style.transform = "";
    const placer = () => {
      const manque = Math.max(0, Math.ceil(scene.getBoundingClientRect().top + MARGE_DU_HAUT - (el.getBoundingClientRect().top - descente)));
      if (manque === descente) return;
      descente = manque;
      el.style.transform = manque > 0 ? `translateY(${manque}px)` : "";
    };
    placer();
    const veille = window.setInterval(placer, 250);
    return () => window.clearInterval(veille);
  }, [lui?.tour]);
  if (!lui) return null;
  return (
    <span ref={boite} class="toucher" data-palier={lui.palier} data-saut={lui.saut ? String(lui.tour % 2) : undefined} data-testid="toucher">
      <span class="toucher-qui">
        <span class="vie-info-nom">{habitant.gaulois.nom}</span>
        {habitant.presence.raison}
      </span>
      <span key={lui.tour} class="toucher-bulle" data-testid="toucher-bulle">
        {ponctuer(lui.phrase)}
      </span>
    </span>
  );
}

/** Dans « Qui est où » : le nom du Gaulois est un bouton, qui fait ce que fait un clic sur lui dans la scène. */
export function BoutonDuToucher({ habitant, onToucher }: { habitant: Habitant; onToucher: (habitant: Habitant) => void }) {
  return (
    <button type="button" class="toucher-bouton" aria-label={`Parler à ${habitant.gaulois.nom}`} data-testid="toucher-bouton" onClick={() => onToucher(habitant)}>
      {habitant.gaulois.nom}
      <svg class="toucher-bouton-icone" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
        <path d="M1 1h10v7H5l-3 3V8H1z" fill="currentColor" />
      </svg>
    </button>
  );
}

/**
 * Le mot d'emploi, près du compte du lieu, tant que le visiteur n'a touché personne. Les lecteurs d'écran, à qui la scène
 * est cachée, entendent en plus où sont leurs boutons : la liste « Qui est où » est repliée.
 */
export function MotDuToucher() {
  return (
    <span class="info-discrete" data-testid="toucher-mot">
      {" "}
      Touchez un Gaulois, il répond.
      <span class="sr-only"> Au clavier : ouvrez « Qui est où », chaque nom y est un bouton « Parler à ».</span>
    </span>
  );
}

/** La dernière phrase de ce Gaulois, pour sa ligne de la liste ; `null` s'il n'est pas le dernier à avoir parlé. */
export const phraseDite = (dit: Parole | null, habitant: Habitant): string | null => (estDe(dit, habitant) ? ponctuer(dit.phrase) : null);

/** L'annonce aux lecteurs d'écran, hors de la scène (qui leur est cachée) : « Brennos : Arrête de me tripoter ! ». */
export function AnnonceDuToucher({ dit }: { dit: Parole | null }) {
  return (
    <p class="sr-only" aria-live="polite" data-testid="toucher-annonce">
      {dit ? `${dit.nom} : ${dit.phrase}` : ""}
    </p>
  );
}
