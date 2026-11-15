import { useEffect, useRef, useState } from "preact/hooks";
import { ORDRE_RARETES, RARETES, type Rarete } from "../../lib/gaulois";
import { motionAllowed } from "../../lib/fx/motion";
import { DUREE_DE_LA_FETE, DUREE_DU_TAMBOUR, positionDuTambour } from "../../lib/village/tambour";

/**
 * Le tambour des pochettes (choix du pilote, 15 novembre 2026 ; calculs dans `src/lib/village/tambour.ts`) : un cylindre de
 * rangées, dessiné dans une toile, qui tourne une fois, ralentit et s'arrête sur ce que le serveur a tiré, puis fête la
 * rareté (lueur, anneau à partir d'épique, rayons à partir de mystique, pluie d'or pour un légendaire), lentement et sans
 * clignoter. Animations coupées (bouton pause de l'en-tête ou réglage du système) : il est posé tout de suite sur le
 * résultat, sans fête qui bouge. Un tic à chaque rangée et un carillon à l'arrêt, faits dans la page ; le son se coupe et
 * reste coupé sur cet appareil (`gal-pochette-son`). La toile est décorative : le résultat est écrit à côté, en texte.
 */

/** Ce que montre une rangée : un nom, une rareté et un dessin en cases. */
export interface RangeeVue {
  nom: string;
  rarete: Rarete;
  dessin: {
    largeur: number;
    hauteur: number;
    cases: readonly (string | null)[];
  } | null;
}

// ---------- Le son ----------

const CLE_SON = "gal-pochette-son";
let contexte: AudioContext | null = null;
let maitre: GainNode | null = null;
let dernierTic = 0;

function sonVoulu(): boolean {
  try {
    return localStorage.getItem(CLE_SON) !== "non";
  } catch {
    return true;
  }
}

/** Ouvre le son de la page : à appeler dans le clic qui ouvre la pochette, sinon certains navigateurs le gardent muet. */
export function preparerLeSon(): void {
  if (typeof window === "undefined") return;
  try {
    const Contexte = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;
    if (!contexte) {
      contexte = new Contexte();
      maitre = contexte.createGain();
      maitre.gain.value = 0.6;
      maitre.connect(contexte.destination);
    }
    if (contexte.state === "suspended") contexte.resume().catch(() => undefined);
  } catch {
    contexte = null;
    maitre = null;
  }
}

/** Le son voulu sur cet appareil, et de quoi le couper ou le remettre. */
export function useSonDuTambour(): [boolean, () => void] {
  const [son, setSon] = useState(sonVoulu);
  const basculer = () => {
    const voulu = !son;
    try {
      if (voulu) localStorage.removeItem(CLE_SON);
      else localStorage.setItem(CLE_SON, "non");
    } catch {
      // Sans stockage, le choix vaut pour cette fenêtre seulement.
    }
    if (voulu) preparerLeSon();
    setSon(voulu);
  };
  return [son, basculer];
}

function tic(): void {
  if (!contexte || !maitre || contexte.state !== "running") return;
  const t = contexte.currentTime;
  if (t - dernierTic < 0.03) return;
  dernierTic = t;
  const o = contexte.createOscillator();
  const g = contexte.createGain();
  const f = contexte.createBiquadFilter();
  o.type = "square";
  o.frequency.value = 820 * (0.98 + Math.random() * 0.04);
  f.type = "bandpass";
  f.frequency.value = 820;
  f.Q.value = 1.4;
  g.gain.setValueAtTime(0.04, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  o.connect(f);
  f.connect(g);
  g.connect(maitre);
  o.start(t);
  o.stop(t + 0.05);
}

function note(frequence: number, dans: number, duree: number, volume: number, forme: OscillatorType): void {
  if (!contexte || !maitre) return;
  const t = contexte.currentTime + dans;
  const o = contexte.createOscillator();
  const g = contexte.createGain();
  o.type = forme;
  o.frequency.value = frequence;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g);
  g.connect(maitre);
  o.start(t);
  o.stop(t + duree + 0.05);
}

/** Une note par rang de rareté, puis un accord tenu pour mystique et légendaire. */
function carillon(rang: number): void {
  if (!contexte || contexte.state !== "running") return;
  const gamme = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  for (let i = 0; i < rang; i++) note(gamme[i] ?? 523.25, 0.03 + i * 0.11, 0.7, 0.07, "triangle");
  if (rang >= 4) for (const f of rang === 5 ? [523.25, 783.99, 1046.5, 1318.5, 1567.98] : [523.25, 783.99, 1046.5]) note(f, 0.08 + rang * 0.11, 2.4, 0.03, "sine");
}

// ---------- Le dessin ----------

const TAU = Math.PI * 2;
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const lisse = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const sortie3 = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const melange = (a: string, b: string, t: number): string => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) =>
    Math.round(v + ((B[i] ?? 0) - v) * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
};
const rgba = (hex: string, a: number): string => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${clamp(a)})`;
};

/** Les couleurs des raretés, lues sur les jetons du site (`--rarete-…`) ; celles de `docs/DESIGN.md` si un jeton manque. */
const REPLI: Record<Rarete, string> = {
  commun: "#4aa3ff",
  "peu-commun": "#3a4fe8",
  epique: "#9b4dff",
  mystique: "#ff2e4a",
  legendaire: "#f2b632",
};
function couleursDuSite(el: Element): Record<Rarete, string> {
  const style = getComputedStyle(el);
  return Object.fromEntries(
    ORDRE_RARETES.map((rarete) => {
      const valeur = style.getPropertyValue(`--rarete-${rarete}`).trim();
      return [rarete, /^#[0-9a-f]{6}$/i.test(valeur) ? valeur : REPLI[rarete]];
    }),
  ) as Record<Rarete, string>;
}

const TOILES = new WeakMap<object, HTMLCanvasElement>();
function toileDu(dessin: NonNullable<RangeeVue["dessin"]>): HTMLCanvasElement {
  let toile = TOILES.get(dessin);
  if (toile) return toile;
  toile = document.createElement("canvas");
  toile.width = dessin.largeur;
  toile.height = dessin.hauteur;
  const ctx = toile.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(dessin.largeur, dessin.hauteur);
    dessin.cases.forEach((couleur, i) => {
      if (!couleur) return;
      const [r, g, b] = rgb(couleur);
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(image, 0, 0);
  }
  TOILES.set(dessin, toile);
  return toile;
}

/** Un dessin en cases, centré et tenu dans `place` : agrandi par paliers nets, réduit en douceur. */
function poserDessin(ctx: CanvasRenderingContext2D, dessin: NonNullable<RangeeVue["dessin"]>, cx: number, cy: number, place: number, dpr: number): void {
  let e = place / Math.max(dessin.largeur, dessin.hauteur);
  if (e >= 1) e = Math.max(1, Math.floor(e * dpr) / dpr);
  ctx.imageSmoothingEnabled = e < 1;
  ctx.drawImage(toileDu(dessin), cx - (dessin.largeur * e) / 2, cy - (dessin.hauteur * e) / 2, dessin.largeur * e, dessin.hauteur * e);
  ctx.imageSmoothingEnabled = true;
}

function losanges(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, r: number, couleur: string): void {
  const pas = r * 2.7;
  for (let j = 0; j < n; j++) {
    const cx = x + (j - (n - 1) / 2) * pas;
    ctx.beginPath();
    ctx.moveTo(cx, y - r);
    ctx.lineTo(cx + r, y);
    ctx.lineTo(cx, y + r);
    ctx.lineTo(cx - r, y);
    ctx.closePath();
    ctx.fillStyle = couleur;
    ctx.fill();
  }
}

function clou(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = "#f2b632";
  ctx.fill();
  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = r * 0.4;
  ctx.stroke();
}

/** Un rectangle arrondi dans le chemin en cours ; un rectangle droit sur un navigateur qui ne sait pas l'arrondir. */
function arrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

interface Confetti {
  x: number;
  y0: number;
  vy: number;
  sw: number;
  ph: number;
  couleur: string;
  taille: number;
}
function pluieDOr(): Confetti[] {
  const couleurs = ["#f2b632", "#fff1a8", "#ffdd80", "#ffffff"];
  return Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y0: -0.07 - Math.random() * 0.5,
    vy: 0.1 + Math.random() * 0.12,
    sw: 4 + Math.random() * 10,
    ph: Math.random() * TAU,
    couleur: couleurs[Math.floor(Math.random() * couleurs.length)] ?? "#f2b632",
    taille: 2 + Math.round(Math.random() * 3),
  }));
}

interface Scene {
  rangees: readonly RangeeVue[];
  position: number;
  /** Les secondes depuis l'arrêt, ou -1 tant que le tambour tourne. */
  fete: number;
  couleurs: Record<Rarete, string>;
  police: string;
  pluie: Confetti[] | null;
}

function peindre(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, s: Scene): void {
  const k = H / 300;
  const cy = H / 2;
  const rayon = H * 0.4;
  const pas = 0.5;
  const x0 = W * 0.07;
  const x1 = W * 0.93;
  ctx.fillStyle = "#0a1230";
  ctx.fillRect(0, 0, W, H);
  // Le cadre de bois, et ses clous.
  const bois = ctx.createLinearGradient(0, cy - rayon, 0, cy + rayon);
  bois.addColorStop(0, "#8f5727");
  bois.addColorStop(1, "#4a2a12");
  ctx.fillStyle = bois;
  ctx.beginPath();
  arrondi(ctx, x0 - 12 * k, cy - rayon - 12 * k, x1 - x0 + 24 * k, 2 * rayon + 24 * k, 10 * k);
  ctx.fill();
  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = 2 * k;
  ctx.stroke();
  for (const [x, y] of [
    [x0 - 6 * k, cy - rayon - 6 * k],
    [x1 + 6 * k, cy - rayon - 6 * k],
    [x0 - 6 * k, cy + rayon + 6 * k],
    [x1 + 6 * k, cy + rayon + 6 * k],
  ] as const)
    clou(ctx, x, y, 2.8 * k);
  // Le cylindre : chaque rangée vue de face, plus étroite et plus sombre en s'éloignant du milieu.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, cy - rayon, x1 - x0, 2 * rayon);
  ctx.clip();
  ctx.fillStyle = "#050a1f";
  ctx.fillRect(x0, cy - rayon, x1 - x0, 2 * rayon);
  const base = Math.floor(s.position);
  for (let i = base - 4; i <= base + 4; i++) {
    const rangee = s.rangees[i];
    if (!rangee) continue;
    const angle = (s.position - i) * pas;
    const haut = Math.max(-Math.PI / 2, angle - pas / 2);
    const bas = Math.min(Math.PI / 2, angle + pas / 2);
    if (bas <= haut) continue;
    const y0 = cy + rayon * Math.sin(haut);
    const y1 = cy + rayon * Math.sin(bas);
    if (y1 - y0 < 0.5) continue;
    const face = Math.cos(angle);
    const lumiere = 0.25 + 0.75 * Math.max(0, face);
    const couleur = s.couleurs[rangee.rarete];
    // Le doré, plus clair que les autres raretés, est foncé un peu plus pour que le nom blanc s'y lise.
    ctx.fillStyle = melange(melange(couleur, "#0a1230", rangee.rarete === "legendaire" ? 0.5 : 0.35), "#000000", 1 - lumiere);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = `rgba(255,255,255,${0.14 * lumiere})`;
    ctx.fillRect(x0, y0, x1 - x0, Math.max(1, 1.5 * k * face));
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x0, y1 - k, x1 - x0, k);
    if (face > 0.2) {
      const yc = cy + rayon * Math.sin(angle);
      ctx.save();
      ctx.translate(0, yc);
      ctx.scale(1, face);
      ctx.globalAlpha = lumiere;
      if (rangee.dessin) poserDessin(ctx, rangee.dessin, x0 + W * 0.085, 0, H * 0.15, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const taille = 16 * k;
      const largeurMax = x1 - x0 - W * 0.31;
      ctx.font = `600 ${taille}px ${s.police}`;
      const mesure = ctx.measureText(rangee.nom).width;
      if (mesure > largeurMax) ctx.font = `600 ${(taille * largeurMax) / mesure}px ${s.police}`;
      ctx.fillText(rangee.nom, x0 + W * 0.17, 0);
      losanges(ctx, x1 - W * 0.075, 0, RARETES[rangee.rarete].rang, 2.4 * k, melange(couleur, "#ffffff", 0.55));
      ctx.restore();
    }
  }
  const ombre = ctx.createLinearGradient(0, cy - rayon, 0, cy + rayon);
  ombre.addColorStop(0, "rgba(0,0,0,0.78)");
  ombre.addColorStop(0.3, "rgba(0,0,0,0)");
  ombre.addColorStop(0.7, "rgba(0,0,0,0)");
  ombre.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = ombre;
  ctx.fillRect(x0, cy - rayon, x1 - x0, 2 * rayon);
  const resultat = s.rangees[Math.round(s.position)];
  if (s.fete >= 0 && resultat) {
    const hauteur = 2 * rayon * Math.sin(pas / 2);
    ctx.strokeStyle = rgba(melange(s.couleurs[resultat.rarete], "#ffffff", 0.55), 0.55 + 0.4 * (1 - lisse(0, 2, s.fete)));
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath();
    arrondi(ctx, x0 + 3 * k, cy - hauteur / 2, x1 - x0 - 6 * k, hauteur, 6 * k);
    ctx.stroke();
  }
  ctx.restore();
  // Les deux repères dorés du milieu.
  for (const [x, sens] of [
    [x0 - 2 * k, 1],
    [x1 + 2 * k, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x - sens * 10 * k, cy - 9 * k);
    ctx.lineTo(x + sens * 6 * k, cy);
    ctx.lineTo(x - sens * 10 * k, cy + 9 * k);
    ctx.closePath();
    ctx.fillStyle = "#f2b632";
    ctx.fill();
    ctx.strokeStyle = "#3a2412";
    ctx.lineWidth = 1.2 * k;
    ctx.stroke();
  }
  if (s.fete >= 0 && resultat) feter(ctx, W, H, k, s.fete, RARETES[resultat.rarete].rang, s.couleurs[resultat.rarete], s.pluie);
}

/** La fête, selon le rang : une lueur qui se pose, puis un anneau, des rayons lents, une pluie d'or. Rien ne clignote. */
function feter(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, rang: number, couleur: string, pluie: Confetti[] | null): void {
  const clair = melange(couleur, "#ffffff", 0.55);
  const cx = W / 2;
  const cy = H / 2;
  const grand = Math.max(W, H);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pic = 0.08 + 0.05 * rang;
  const repos = 0.03 * rang;
  const a = t < 0.5 ? pic * sortie3(t / 0.5) : repos + (pic - repos) * (1 - lisse(0.5, 2.2, t));
  const lueur = ctx.createRadialGradient(cx, cy, 0, cx, cy, grand * 0.45);
  lueur.addColorStop(0, rgba(couleur, a));
  lueur.addColorStop(1, rgba(couleur, 0));
  ctx.fillStyle = lueur;
  ctx.fillRect(0, 0, W, H);
  if (rang >= 3 && t < 2.4) {
    const u = t / 2.4;
    ctx.strokeStyle = rgba(clair, 0.55 * (1 - u));
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, grand * (0.08 + sortie3(u) * 0.42), 0, TAU);
    ctx.stroke();
  }
  if (rang >= 4) {
    const ar = 0.2 * clamp(t / 0.8) * (1 - lisse(2, DUREE_DE_LA_FETE / 1000, t));
    if (ar > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.15);
      for (let j = 0; j < 12; j++) {
        ctx.rotate(TAU / 12);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(grand * 0.75, -grand * 0.05);
        ctx.lineTo(grand * 0.75, grand * 0.05);
        ctx.closePath();
        const rayon = ctx.createLinearGradient(0, 0, grand * 0.75, 0);
        rayon.addColorStop(0, rgba(couleur, ar));
        rayon.addColorStop(1, rgba(couleur, 0));
        ctx.fillStyle = rayon;
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  if (pluie) {
    ctx.globalAlpha = 1 - lisse(3.6, DUREE_DE_LA_FETE / 1000, t);
    for (const p of pluie) {
      const y = (p.y0 + p.vy * t) * H;
      if (y > H + 10) continue;
      ctx.fillStyle = p.couleur;
      ctx.fillRect(Math.round(p.x * W + Math.sin(t * 1.3 + p.ph) * p.sw * k), Math.round(y), p.taille * k, p.taille * k);
    }
  }
  ctx.restore();
}

/**
 * Le tambour : `rangees` défilent de `depart` à `cible`, le résultat. `passer` l'arrête tout de suite sur le résultat ;
 * `onArrive` est appelé une fois, à l'arrêt.
 */
export function Tambour({ rangees, depart, cible, passer, son, onArrive }: { rangees: readonly RangeeVue[]; depart: number; cible: number; passer: boolean; son: boolean; onArrive: () => void }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const reglages = useRef({ passer, son, onArrive });
  reglages.current = { passer, son, onArrive };
  useEffect(() => {
    const cv = toile.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) {
      // Sans toile, pas de tambour : la fenêtre passe tout de suite au résultat, jamais bloquée.
      reglages.current.onArrive();
      return;
    }
    const couleurs = couleursDuSite(cv);
    const police = getComputedStyle(cv).getPropertyValue("--font-display").trim() || "system-ui, sans-serif";
    const anime = motionAllowed();
    const resultat = rangees[cible];
    const debut = performance.now();
    let arrivee: number | null = null;
    let pluie: Confetti[] | null = null;
    let milieu = depart;
    let image = 0;
    let fini = false;
    const dessiner = (now: number): number => {
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      const position = arrivee === null ? positionDuTambour({ depart, cible }, now - debut) : cible;
      if (!W || !H) return position;
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.round(W * dpr);
      const h = Math.round(H * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      peindre(ctx, W, H, dpr, {
        rangees,
        position,
        fete: arrivee === null ? -1 : (now - arrivee) / 1000,
        couleurs,
        police,
        pluie,
      });
      return position;
    };
    const boucle = (now: number) => {
      try {
        tour(now);
      } catch {
        // Un dessin qui échoue arrête le tambour, mais jamais la fenêtre : elle passe au résultat.
        if (arrivee === null) reglages.current.onArrive();
      }
    };
    const tour = (now: number) => {
      if (arrivee === null && (!anime || reglages.current.passer || now - debut >= DUREE_DU_TAMBOUR)) {
        arrivee = anime ? now : now - DUREE_DE_LA_FETE;
        if (anime && resultat && RARETES[resultat.rarete].rang === 5) pluie = pluieDOr();
        if (reglages.current.son && resultat) carillon(RARETES[resultat.rarete].rang);
        reglages.current.onArrive();
      }
      const position = dessiner(now);
      if (arrivee === null) {
        const rangee = Math.round(position);
        if (rangee !== milieu) {
          milieu = rangee;
          if (reglages.current.son) tic();
        }
      }
      if (arrivee !== null && now - arrivee >= DUREE_DE_LA_FETE) {
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
  }, [rangees, depart, cible]);
  return <canvas ref={toile} class="tambour" aria-hidden="true" data-testid="tambour" />;
}

/** Couper ou remettre le son du tambour : le bouton dit ce qu'il va faire. */
export function BoutonSon({ son, onBasculer, testid }: { son: boolean; onBasculer: () => void; testid: string }) {
  return (
    <button type="button" class="btn btn-ghost" onClick={onBasculer} data-testid={testid}>
      {son ? "Couper le son" : "Remettre le son"}
    </button>
  );
}
