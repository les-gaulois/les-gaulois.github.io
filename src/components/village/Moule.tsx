import { useEffect, useRef } from "preact/hooks";
import { RARETES_DES_OBJETS as RARETES, type RareteDObjet as Rarete } from "../../lib/gaulois";
import { motionAllowed } from "../../lib/fx/motion";
import { DUREE_DE_LA_LUEUR, DUREE_DU_MOULE, caseDuMoule, couleEncore, doux, ouverture, rangeePleine, refroidi, remplissage } from "../../lib/village/moule";
import { carillon, couleursDuSite, melange } from "./Carillon";

/**
 * Le moule de la forge (choix du pilote, 16 novembre 2026 ; calculs dans `src/lib/village/moule.ts`) : une toile où un
 * moule de pierre montre en creux la forme exacte de l'objet reçu. Le métal coule, monte dans le creux, passe de la couleur
 * de la rareté donnée à celle de la rareté reçue, refroidit du haut vers le bas, puis le moule s'ouvre et une lueur de la
 * rareté reste un instant. Rien ne clignote. Animations coupées (bouton pause de l'en-tête ou réglage du système) : l'objet
 * est posé tout de suite, démoulé. La toile est décorative : le résultat est écrit à côté, en texte.
 */

/** Ce que le moule montre : le dessin de l'objet reçu, en cases. */
export interface DessinDuMoule {
  largeur: number;
  hauteur: number;
  cases: readonly (string | null)[];
}

const PIERRE = "#3b3548";
const PIERRE_SOMBRE = "#2f2a3c";
const PIERRE_CLAIRE = "#5a5270";
const CREUX = "#15111f";
const FONTE = "#ff8a1f";
const BLANC_CHAUD = "#fff4d6";
const NUIT = "#17132a";

/** Un nombre entre 0 et 1, toujours le même pour un même `i` : la place des braises. */
const hasard = (i: number): number => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function peindre(ctx: CanvasRenderingContext2D, W: number, H: number, dessin: DessinDuMoule, u: number, lueur: number, depuis: string, vers: string): void {
  // L'atelier : un mur de pierre dans la nuit, un sol, la lueur du métal.
  ctx.fillStyle = NUIT;
  ctx.fillRect(0, 0, W, H);
  const brique = Math.max(14, Math.round(W / 9));
  for (let j = 0; j * brique * 0.62 < H; j++) {
    for (let i = -1; i * brique < W; i++) {
      ctx.fillStyle = hasard(i * 9 + j) > 0.6 ? "#1f1a36" : "#1b1730";
      ctx.fillRect(Math.round(i * brique + (j % 2) * brique * 0.5), Math.round(j * brique * 0.62), brique - 1, Math.round(brique * 0.62) - 1);
    }
  }
  const sol = Math.round(H * 0.86);
  ctx.fillStyle = "#231b33";
  ctx.fillRect(0, sol, W, H - sol);
  ctx.fillStyle = "#3a2d52";
  ctx.fillRect(0, sol, W, 1);

  const k = caseDuMoule(W, H, dessin);
  const w = dessin.largeur * k;
  const h = dessin.hauteur * k;
  const x0 = Math.round((W - w) / 2);
  const y0 = Math.round(sol - h - k * 3);
  const plein = remplissage(u);
  const ouvre = ouverture(u);
  // La chaleur du métal éclaire le mur, tant qu'il n'a pas refroidi.
  const chaleur = plein * (1 - doux(0.6, 0.86, u));
  if (chaleur > 0.01) {
    const halo = ctx.createRadialGradient(W / 2, y0 + h / 2, 0, W / 2, y0 + h / 2, Math.max(W, H) * 0.6);
    halo.addColorStop(0, `rgba(255, 138, 31, ${0.22 * chaleur})`);
    halo.addColorStop(1, "rgba(255, 138, 31, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
  }
  // La lueur de la rareté, une fois le moule ouvert : elle monte puis se pose, sans clignoter.
  if (lueur > 0) {
    const force = Math.sin(Math.PI * Math.min(1, lueur)) * 0.5 + (lueur >= 1 ? 0.12 : 0.12 * lueur);
    const halo = ctx.createRadialGradient(W / 2, y0 + h / 2, 0, W / 2, y0 + h / 2, Math.max(w, h) * 1.3);
    halo.addColorStop(0, melange(vers, "#ffffff", 0.3));
    halo.addColorStop(1, NUIT);
    ctx.globalAlpha = force;
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Les deux moitiés du moule, qui s'écartent et s'effacent à la fin.
  const marge = k * 3;
  const ecart = Math.round(ouvre * (w / 2 + marge + k * 4));
  const gauche = x0 - marge;
  const milieu = x0 + Math.floor(dessin.largeur / 2) * k;
  const droite = x0 + w + marge;
  const haut = y0 - marge;
  const bas = sol;
  ctx.globalAlpha = 1 - ouvre;
  ctx.fillStyle = PIERRE;
  ctx.fillRect(gauche - ecart, haut, milieu - gauche, bas - haut);
  ctx.fillStyle = PIERRE_SOMBRE;
  ctx.fillRect(milieu + ecart, haut, droite - milieu, bas - haut);
  ctx.fillStyle = PIERRE_CLAIRE;
  ctx.fillRect(gauche - ecart, haut, milieu - gauche, Math.max(1, Math.round(k / 2)));
  ctx.fillRect(milieu + ecart, haut, droite - milieu, Math.max(1, Math.round(k / 2)));
  // L'entonnoir, en haut du moule, par où le métal entre.
  ctx.fillStyle = CREUX;
  ctx.fillRect(Math.round(W / 2 - k) - (ouvre > 0 ? ecart : 0), haut, k * 2, y0 - haut);
  ctx.globalAlpha = 1;

  // Le creux : la forme exacte de l'objet reçu, puis le métal qui la remplit et refroidit.
  const metal = melange(depuis, vers, doux(0.2, 0.56, u));
  const fonte = melange(melange(FONTE, metal, 0.45), BLANC_CHAUD, 0.22);
  for (let j = 0; j < dessin.hauteur; j++) {
    const pleine = rangeePleine(u, j, dessin.hauteur);
    const froid = refroidi(u, j, dessin.hauteur);
    for (let i = 0; i < dessin.largeur; i++) {
      const couleur = dessin.cases[j * dessin.largeur + i];
      if (!couleur) continue;
      if (!pleine) {
        if (ouvre >= 1) continue;
        ctx.globalAlpha = 1 - ouvre;
        ctx.fillStyle = CREUX;
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = froid >= 1 ? couleur : melange(fonte, couleur, froid);
      }
      ctx.fillRect(x0 + i * k, y0 + j * k, k, k);
    }
  }
  ctx.globalAlpha = 1;

  // Le filet de métal, du haut de la toile jusqu'à sa surface dans le creux.
  if (couleEncore(u)) {
    const surface = y0 + Math.round(dessin.hauteur * (1 - plein)) * k;
    const large = Math.max(2, Math.round(k * 0.9));
    ctx.fillStyle = fonte;
    ctx.fillRect(Math.round(W / 2 - large / 2), 0, large, surface);
    ctx.fillStyle = BLANC_CHAUD;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(Math.round(W / 2 - large / 2), 0, Math.max(1, Math.round(large / 3)), surface);
    ctx.globalAlpha = 1;
  }
  // Quelques braises lentes au-dessus du moule, tant que le métal est chaud.
  if (chaleur > 0.05) {
    for (let n = 0; n < 9; n++) {
      const vie = (u * 3.2 + hasard(n)) % 1;
      ctx.globalAlpha = (1 - vie) * chaleur * 0.8;
      ctx.fillStyle = n % 3 ? "#ffc23d" : BLANC_CHAUD;
      ctx.fillRect(Math.round(W / 2 + (hasard(n + 11) - 0.5) * (w + marge * 2)), Math.round(haut - vie * H * 0.3), Math.max(1, Math.round(k / 2)), Math.max(1, Math.round(k / 2)));
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Le moule : il se remplit de `depuis` (la rareté donnée) à `vers` (la rareté reçue), sur le dessin de l'objet reçu.
 * `passer` le montre tout de suite démoulé ; `onArrive` est appelé une fois, au moule ouvert.
 */
export function Moule({ dessin, depuis, vers, passer, son, onArrive }: { dessin: DessinDuMoule; depuis: Rarete; vers: Rarete; passer: boolean; son: boolean; onArrive: () => void }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const reglages = useRef({ passer, son, onArrive });
  reglages.current = { passer, son, onArrive };
  useEffect(() => {
    const cv = toile.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) {
      // Sans toile, pas de moule : la fenêtre passe tout de suite au résultat, jamais bloquée.
      reglages.current.onArrive();
      return;
    }
    const couleurs = couleursDuSite(cv);
    const anime = motionAllowed();
    const debut = performance.now();
    let arrivee: number | null = null;
    let image = 0;
    let fini = false;
    const dessiner = (now: number): void => {
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.round(W * dpr);
      const h = Math.round(H * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const u = arrivee === null ? Math.min(1, (now - debut) / DUREE_DU_MOULE) : 1;
      peindre(ctx, w, h, dessin, u, arrivee === null ? 0 : (now - arrivee) / DUREE_DE_LA_LUEUR, couleurs[depuis], couleurs[vers]);
    };
    const boucle = (now: number) => {
      try {
        tour(now);
      } catch {
        // Un dessin qui échoue arrête le moule, mais jamais la fenêtre : elle passe au résultat.
        if (arrivee === null) reglages.current.onArrive();
      }
    };
    const tour = (now: number) => {
      if (arrivee === null && (!anime || reglages.current.passer || now - debut >= DUREE_DU_MOULE)) {
        arrivee = anime ? now : now - DUREE_DE_LA_LUEUR;
        if (reglages.current.son) carillon(RARETES[vers].rang);
        reglages.current.onArrive();
      }
      dessiner(now);
      if (arrivee !== null && now - arrivee >= DUREE_DE_LA_LUEUR) {
        fini = true;
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    const observateur = new ResizeObserver(() => {
      if (fini) dessiner(performance.now());
    });
    observateur.observe(cv);
    return () => {
      cancelAnimationFrame(image);
      observateur.disconnect();
    };
  }, [dessin, depuis, vers]);
  return <canvas ref={toile} class="tambour moule" aria-hidden="true" data-testid="moule" />;
}
