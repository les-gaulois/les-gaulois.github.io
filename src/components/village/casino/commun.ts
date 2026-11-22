import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import { SOLDE_ANNONCE } from "../../../lib/compte/api";
import { eveil } from "../../../lib/jeu/casino-sons";
import { preparerLeSon, sonVoulu } from "../../../lib/jeu/sons";

/**
 * Les réglages du casino de « Mon Gaulois » dans la page : le thème, la pause et « réduire les animations », la seule boucle
 * d'animation, la bourse de la barre. Ce sont ceux de tout le jeu (boutons de la barre, `src/scripts/jeu.ts`) : le casino
 * n'en a pas d'autres. Voir le mode d'emploi du socle dans « Le casino du jeu » de docs/DESIGN.md.
 */

/** Le thème clair (le jour) ou sombre (la nuit) du site. */
export const jour = (): boolean => typeof document === "undefined" || document.documentElement.dataset["mode"] !== "sombre";

/** La pause de la barre ou « réduire les animations » : le résultat est alors posé sans mouvement. */
export function sansMouvement(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("fx-off") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Suit le thème : `true` de jour. Les toiles se repeignent quand il change. */
export function useJour(): boolean {
  const [j, setJ] = useState(jour);
  useEffect(() => {
    const obs = new MutationObserver(() => setJ(jour()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    setJ(jour());
    return () => obs.disconnect();
  }, []);
  return j;
}

/* ---------- Une seule boucle d'animation, arrêtée dès que plus rien ne bouge ---------- */

const taches = new Set<(t: number) => boolean | void>();
let boucle = 0;
function tourne(t: number): void {
  boucle = 0;
  for (const f of [...taches]) if (f(t) === false) taches.delete(f);
  if (taches.size) boucle = requestAnimationFrame(tourne);
}
/**
 * Lance une tâche animée : `f(t)` est appelée à chaque image tant qu'elle ne rend pas `false`. Rien ne tourne au repos. Rend
 * de quoi l'arrêter (un jeu qu'on quitte en plein tour).
 */
export function anime(f: (t: number) => boolean | void): () => void {
  taches.add(f);
  if (!boucle) boucle = requestAnimationFrame(tourne);
  return () => void taches.delete(f);
}

/** Attend `ms` millisecondes (un résultat posé sans mouvement attend un souffle, comme dans la maquette). */
export const attendre = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/* ---------- La bourse : celle de la barre du jeu ---------- */

let dernierSolde: number | null = null;
if (typeof window !== "undefined")
  window.addEventListener(SOLDE_ANNONCE, (e) => {
    const s = (e as CustomEvent<{ solde?: number }>).detail?.solde;
    if (typeof s === "number") dernierSolde = s;
  });

/**
 * Annonce la bourse à la barre du jeu (`gal:solde`), comme le fait `call` pour toute réponse qui porte `solde`. Le casino
 * l'annonce lui-même, en deux temps, avec les nombres du serveur : la mise prise dès la réponse, le gain une fois le
 * résultat montré (`solde_apres`). La barre ne montre jamais un résultat avant la roue.
 */
export function annoncerLeSolde(solde: number): void {
  if (typeof window === "undefined" || !Number.isSafeInteger(solde) || solde < 0) return;
  window.dispatchEvent(new CustomEvent(SOLDE_ANNONCE, { detail: { solde } }));
}

/** Suit la bourse de la barre (le dernier solde du serveur), `null` tant qu'on ne la connaît pas. */
export function useBourse(depart: number | null): number | null {
  const [b, setB] = useState<number | null>(dernierSolde ?? depart);
  useEffect(() => {
    if (depart !== null && dernierSolde === null) setB(depart);
  }, [depart]);
  useEffect(() => {
    const suivre = (e: Event): void => {
      const s = (e as CustomEvent<{ solde?: number }>).detail?.solde;
      if (typeof s === "number") setB(s);
    };
    window.addEventListener(SOLDE_ANNONCE, suivre);
    return () => window.removeEventListener(SOLDE_ANNONCE, suivre);
  }, []);
  return b;
}

/* ---------- Le son ---------- */

/** Chaque geste dans le casino réveille son son (s'il est voulu) : un navigateur n'ouvre le son qu'après un geste. */
export function useEveilDuSon(): void {
  useEffect(() => {
    const reveiller = (): void => {
      if (!sonVoulu()) return;
      preparerLeSon();
      eveil();
    };
    document.addEventListener("pointerdown", reveiller, { capture: true });
    document.addEventListener("keydown", reveiller, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", reveiller, { capture: true });
      document.removeEventListener("keydown", reveiller, { capture: true });
    };
  }, []);
}

/* ---------- La place d'un jeu ---------- */

/**
 * La largeur de la table où un jeu est posé (`.cas-table`, sans ses marges), suivie : c'est elle, et non la fenêtre, qui
 * règle la mise en page d'un jeu (la feuille fait de même par ses requêtes de conteneur, `@container casino`). 0 avant la
 * première mesure : un jeu ne peint rien tant qu'il n'a pas une vraie largeur.
 */
export function useLargeurDuJeu(ref: RefObject<HTMLElement>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const table = ref.current?.closest<HTMLElement>(".cas-table") ?? ref.current;
    if (!table) return;
    const lire = (): void => {
      const cs = getComputedStyle(table);
      setW(Math.round(table.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    };
    const obs = new ResizeObserver(lire);
    obs.observe(table);
    lire();
    return () => obs.disconnect();
  }, [ref]);
  return w;
}

/** Amène un élément en haut de l'écran, sous la barre du jeu (au lancer, quand la table est plus étroite que la scène). */
export function montrer(el: HTMLElement | null): void {
  if (!el) return;
  const barre = document.querySelector<HTMLElement>(".jeu-barre");
  const y = el.getBoundingClientRect().top + window.scrollY - (barre?.offsetHeight ?? 0) - 8;
  window.scrollTo({ top: Math.max(0, y), behavior: sansMouvement() ? "auto" : "smooth" });
}
