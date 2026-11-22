import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { statere } from "../../../lib/jeu/casino-dessins";
import { grain, jetonDeMise, poseToile, type Toile } from "../../../lib/jeu/casino-toile";
import { texteEnPixels, type CouleurDEcriture, type ReliefDEcriture } from "../../../lib/jeu/dans-la-page";
import { sansMouvement } from "./commun";

/**
 * Les pièces du casino de « Mon Gaulois » : celles du kit du jeu (écriture en pixels, petites icônes, boutons qui
 * s'enfoncent), avec ce que le casino y ajoute (un grand chiffre, les icônes du palais, le bouton bordeaux), une toile peinte
 * en points, le jeton d'une mise posée et la pluie lente des grands gains. Mode d'emploi : « Le casino du jeu » de
 * docs/DESIGN.md.
 */

const enPhrase = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();

/**
 * Un texte en pixels du kit, comme `Px` (`src/components/jeu/Pixels.tsx`), avec deux choses de plus : `p`, les pixels par
 * case (3 ou 4 pour un grand chiffre), et la classe du cerne. `couleur` : `texte`, `doux`, `or` suivent le thème.
 */
export function Mots({ t, couleur = "texte", relief = "plat", plie = false, p = 0, dit, muet = false, classe = "" }: { t: string; couleur?: CouleurDEcriture; relief?: ReliefDEcriture; plie?: boolean; p?: number; dit?: string; muet?: boolean; classe?: string }) {
  const mots = texteEnPixels(t, couleur, relief, plie);
  return (
    <span class={`jeu-px ${plie ? "jeu-px-plie" : ""} ${relief === "cerne" ? "jeu-px-cerne" : ""} ${classe}`} aria-hidden={muet ? "true" : undefined} style={p ? `--jeu-p:${p}px` : undefined}>
      {mots.map((m, i) => (
        <i key={i} aria-hidden="true" style={`--i:${m.clair};--i-sombre:${m.sombre};--w:${m.largeur};--h:${m.hauteur}`} />
      ))}
      {!muet && <span class="sr-only">{dit ?? enPhrase(t)}</span>}
    </span>
  );
}

/** Une petite icône blanche du casino (`--cas-pic-<nom>`, `casino-pieces.ts`), ou de la barre du jeu avec `kit`. Décorative. */
export function Pic({ nom, kit = false, classe = "" }: { nom: string; kit?: boolean; classe?: string }) {
  return <i class={`jeu-pic ${classe}`} aria-hidden="true" style={`--i:var(--${kit ? "jeu" : "cas"}-pic-${nom})`} />;
}

/**
 * Un bouton du kit : `ton` or (l'action), bleu, ou bordeaux (les outils du palais) ; `icone` (petite icône du casino) ou `mot`
 * (écrit en pixels). `nom` : son nom pour les lecteurs d'écran et la bulle du survol, obligatoire pour un bouton à icône seule.
 * Le petit bruit et le rebond viennent du jeu (`src/scripts/jeu.ts`).
 */
export function Bouton({ ton = "bordeaux", icone, mot, nom, classe = "", ...attrs }: { ton?: "or" | "bleu" | "bordeaux"; icone?: string; mot?: string; nom?: string; classe?: string } & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "icon">) {
  const cl = ton === "or" ? "" : ton === "bleu" ? "jeu-btn-bleu" : "cas-btn-bordeaux";
  return (
    <button type="button" class={`jeu-btn jeu-n9 ${cl} ${icone && !mot ? "jeu-btn-ic" : ""} ${classe}`} aria-label={nom} title={nom} {...attrs}>
      {icone && <Pic nom={icone} />}
      {mot && <Mots t={mot} couleur={ton === "or" ? "encre" : "creme"} relief={ton === "or" ? "plat" : "cerne"} muet={!!nom} />}
    </button>
  );
}

/** Une toile peinte en points, posée à 2 pixels par point. `toile` est refaite par le parent quand sa taille ou le thème change. */
export function Peinture({ toile, classe = "", titre, style, ...attrs }: { toile: Toile | null; classe?: string; titre?: string; style?: string } & Omit<JSX.HTMLAttributes<HTMLCanvasElement>, "style">) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current && toile) poseToile(ref.current, toile);
  }, [toile]);
  return <canvas ref={ref} class={classe} title={titre} style={style} aria-hidden={titre ? undefined : "true"} {...attrs} />;
}

/**
 * Le jeton d'une mise posée sur un pari (une case du tapis, un couloir, une main) : à la couleur du plus gros jeton qu'elle
 * contient, le montant écrit dessus. Son parent est en `position: relative`. `nouveau` : il vient de tomber (il retombe) ;
 * `part` : le tour est fini et ce pari n'a rien rendu, il s'efface lentement. `coin` : bd (bas droite), hd, bg, hg ; `petit`
 * pour une case étroite (moins de 56 pixels).
 */
export function JetonPose({ montant, nouveau = 0, part = false, coin = "bd", petit = false }: { montant: number; nouveau?: number; part?: boolean; coin?: "bd" | "hd" | "bg" | "hg"; petit?: boolean }) {
  const toile = useMemo(() => jetonDeMise(montant, petit ? 6 : 8), [montant, petit]);
  // `nouveau` change à chaque jeton posé sur ce pari : la clé refait l'élément, et sa chute recommence.
  return <Peinture key={nouveau} toile={toile} classe={`cas-mise cas-coin-${coin} ${petit ? "cas-petit" : ""} ${part ? "cas-part" : ""}`} />;
}

/** Un panneau du palais : laque et or la nuit, ivoire et or le jour (le panneau du kit aux matières du casino). */
export function Panneau({ children, classe = "", ...attrs }: { children?: ComponentChildren; classe?: string } & JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div class={`jeu-n9 cas-panneau ${classe}`} {...attrs}>
      {children}
    </div>
  );
}

/** La fête d'un grand gain : seize statères qui tombent lentement devant `el` (rien si les mouvements sont arrêtés). */
export function pluie(el: HTMLElement | null, n = 16): void {
  if (!el || sansMouvement()) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  for (let i = 0; i < n; i++) {
    const c = poseToile(document.createElement("canvas"), statere(16));
    c.className = "cas-pluie";
    c.setAttribute("aria-hidden", "true");
    c.style.left = Math.round(grain(i, 7) * (w - 32)) + "px";
    c.style.setProperty("--d", (i * 0.16).toFixed(2) + "s");
    c.style.setProperty("--t", (2.6 + grain(i, 3) * 1.2).toFixed(2) + "s");
    c.style.setProperty("--h", h + 30 + "px");
    el.append(c);
    setTimeout(() => c.remove(), 7000);
  }
}
