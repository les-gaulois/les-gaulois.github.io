/**
 * Les pièces communes des onglets de la Direction, reprises de l'onglet Comptes (13 novembre 2026) : le 14 novembre 2026, le
 * pilote a demandé d'améliorer les douze autres onglets « comme pour la section compte ». Le dessin est dans `global.css`,
 * section « Les onglets de la Direction : pièces communes » : classes `dir-*` et attribut `data-dir-ton`.
 *
 * Une couleur par état, jamais seule : chaque pastille porte son mot. Vert `ok` en règle ou fait, jaune `warn` à regarder,
 * rouge `danger` bloqué ou en échec, bleu `ally` une information, gris `muted` rien à faire.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export type DirTon = "ok" | "warn" | "danger" | "ally" | "muted";

/** Une pastille : fond teinté, point et mot de la même couleur. `plain` : le point et le mot seuls, plus légers. */
export function Pastille({ ton, plain = false, testid, children }: { ton: DirTon; plain?: boolean; testid?: string; children: ComponentChildren }) {
  return (
    <span class={plain ? "dir-point" : "dir-pastille"} data-dir-ton={ton} data-testid={testid}>
      {children}
    </span>
  );
}

/**
 * Une barre d'outils (`.dir-outils`) qui reste sous l'en-tête du site pendant qu'on descend une longue liste. Les hauteurs de
 * l'en-tête et de la barre sont mesurées et posées sur la racine (`--dir-haut`, `--dir-outils`) : la barre passe sur deux
 * lignes selon la largeur, et les titres d'un `.dir-table` se collent sous elle. Sans mesure possible, les valeurs de la
 * feuille de style restent.
 */
export function useBarreCollante<R extends HTMLElement = HTMLElement, B extends HTMLElement = HTMLDivElement>() {
  const root = useRef<R>(null);
  const bar = useRef<B>(null);
  useEffect(() => {
    const tools = bar.current;
    if (!tools || typeof ResizeObserver !== "function") return;
    const header = document.querySelector<HTMLElement>("header.barre");
    const measure = () => {
      root.current?.style.setProperty("--dir-outils", `${tools.offsetHeight}px`);
      if (header) root.current?.style.setProperty("--dir-haut", `${header.offsetHeight}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(tools);
    if (header) observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);
  return { root, bar };
}
