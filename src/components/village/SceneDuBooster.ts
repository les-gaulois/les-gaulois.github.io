/**
 * La scène de l'ouverture d'un booster (21 novembre 2026), reprise de l'animation validée par le pilote (« c'est la pièce
 * la plus importante », « ça doit être le top du top »), sans rien en changer : le booster respire, une lumière filtre par sa
 * couture et annonce la vraie rareté, jamais plus haut ; le joueur tient, tire ou tape le paquet, qui penche, tremble et
 * craque couture par couture, puis cède ; la carte se pose face cachée et le joueur la retourne lui-même ; la fête suit la
 * rareté. Un commun s'ouvre en 2,4 s ; pendant le vol ou le retournement, un second appui montre la carte tout de suite.
 *
 * La scène ne tire rien : le serveur a déjà tiré, elle reçoit la carte à montrer (`CarteDeScene`). Ce que la démonstration
 * avait en plus (la main de cartes, la boîte, la carte en grand, les puces de rareté) ne vient pas sur le site.
 *
 * La vraie carte (22 novembre 2026, demande du pilote : « tu peux virer la peu détaillée et qu'il n'y ait qu'une seule carte
 * en ouvrant le booster ») : quand la fenêtre la donne (`vraie`), la carte qui sort du paquet garde son dos dessiné, mais
 * dès qu'elle passe la tranche au retournement, c'est la carte détaillée de la chose (celle des cartes des cosmétiques) qui
 * se montre, avec le même mouvement, et qui reste. Le paquet, la déchirure, la sortie, la fête, les lumières et les sons ne
 * changent pas.
 *
 * Mouvement coupé (bouton pause du jeu, `fx-off`, ou « réduire les animations ») : rien ne bouge ; un appui sur le paquet
 * pose la carte retournée, sans mouvement. Une pause en cours de route montre la carte tout de suite. Les sons
 * (`src/lib/jeu/sons-des-boosters.ts`) suivent le réglage du son du jeu. La scène est décorative pour un lecteur d'écran :
 * le paquet et la carte sont des boutons nommés, la fenêtre écrit le résultat en texte.
 */
import { motionAllowed } from "../../lib/fx/motion";
import { GRAINS, LUMIERES, LUMIERE_NEUTRE, RARETES_DE_CARTE, cielDeLaScene, dosDeCarte, fissures, morceauxDuPaquet, rayonsEnCss, type CarteDeScene } from "../../lib/jeu/boosters";
import { ecrire, enCapitales, lignesDuTexte } from "../../lib/jeu/ecriture";
import type { Planche } from "../../lib/jeu/planche";
import * as son from "../../lib/jeu/sons-des-boosters";

type Rvb = readonly [number, number, number];
export type { CarteDeScene };

export interface OptionsDeScene {
  paquet: Planche;
  /** Le nom du booster, pour le paquet : « Booster surprise ». */
  nomDuPaquet: string;
  carte: CarteDeScene;
  /** La carte vient d'être retournée : la fenêtre peut écrire le résultat. Appelé une fois. */
  onRevelee: () => void;
  /**
   * La vraie carte de la chose, déjà dessinée par la fenêtre dans cet élément : elle prend la place de la face dessinée
   * dès que la carte passe la tranche, et suit son mouvement. Sans elle, la face dessinée (`carte.face`).
   */
  vraie?: HTMLElement;
}

export interface Scene {
  /** Montre la carte retournée tout de suite, d'où qu'on en soit. */
  passer: () => void;
  /** Fige la scène, ou la relance (le bouton « Pause » de la fenêtre) : tout s'arrête là où il en est. */
  mettreEnPause: (oui: boolean) => void;
  arreter: () => void;
}

const CASE = 3;
const GRAV = 1500;
const V_MAIN = [0, 0, 0.06, 0.16, 0.3, 0.44, 0.55];
const R_MAIN = [0, 0, 0, 0.26, 0.38, 0.54, 0.64];
const HALO_S = [0, 0.62, 0.72, 0.88, 1.02, 1.2, 1.35];
const HALO_O = [0, 0.5, 0.55, 0.65, 0.75, 0.9, 0.95];
const A_REPOS = [0, 0.1, 0.12, 0.22, 0.3, 0.42, 0.5];
const PAPIER = ["#eef2fc", "#eef2fc", "#9aa6c8", "#2f6bff", "#8fb6ff", "#e0263a", "#f6f1e3", "#cfe2ff"];
const a = (t: readonly number[], i: number): number => t[i] ?? 0;

const borne = (v: number, x = 0, y = 1): number => (v < x ? x : v > y ? y : v);
const entre = (x: number, y: number, t: number): number => x + (y - x) * t;
const lisse = (x: number, y: number, v: number): number => {
  const t = borne((v - x) / (y - x));
  return t * t * (3 - 2 * t);
};
const sortCub = (u: number): number => 1 - Math.pow(1 - borne(u), 3);

/** Une planche posée dans une toile, case pour case. */
function peindre(toile: HTMLCanvasElement, p: Planche): void {
  toile.width = p.width;
  toile.height = p.height;
  const g = toile.getContext("2d");
  if (g) g.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
}
function enUrl(p: Planche): string {
  const t = document.createElement("canvas");
  peindre(t, p);
  return `url(${t.toDataURL()})`;
}

interface Ressort {
  v: number;
  c: number;
  vit: number;
  k: number;
  d: number;
}
const res = (k = 170, d = 18, v = 0): Ressort => ({ v, c: v, vit: 0, k, d });

interface Grain {
  type?: undefined;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vie: number;
  duree: number;
  t: number;
  c: Rvb;
  g: number;
  f: number;
  plus: boolean;
  sc: number;
  ph: number;
}
interface Bout {
  type: "bout" | "eclat";
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  w: number;
  h: number;
  c: string;
  sol: number;
  repos: boolean;
  g: number;
}
type Particule = Grain | Bout;

interface Onde {
  el: HTMLElement;
  t: number;
  d: number;
  x: number;
  y: number;
  k: number;
}

interface CarteVue {
  el: HTMLButtonElement;
  corps: HTMLElement;
  rang: number;
  dec: number;
  a: number;
  mx: number;
  my: number;
  z: number;
  vol: number;
  devant: boolean;
  x: Ressort;
  y: Ressort;
  rz: Ressort;
  sc: Ressort;
  rx: Ressort;
  ry: Ressort;
  tour: Ressort;
}

const GABARIT = `<canvas class="bst-fond" aria-hidden="true"></canvas>
<div class="bst-voile"></div><div class="bst-rais bst-r1"></div><div class="bst-rais bst-r2"></div><div class="bst-halo"></div><div class="bst-faisceau"></div><div class="bst-ombre"></div>
<button class="bst-paquet" type="button"><span class="bst-p-aura"></span><canvas class="bst-p-corps"></canvas><span class="bst-p-lueur"></span><canvas class="bst-p-fissures"></canvas><span class="bst-p-couture"></span><span class="bst-p-jour"></span><span class="bst-p-jour"></span><span class="bst-p-jour"></span><span class="bst-p-jour"></span><span class="bst-p-bande"></span></button>
<div class="bst-lame"></div>
<div class="bst-onde"></div><div class="bst-onde"></div><div class="bst-onde"></div><div class="bst-onde"></div><div class="bst-onde"></div><div class="bst-onde"></div>
<canvas class="bst-etincelles" aria-hidden="true"></canvas>
<div class="bst-eclat"></div>
<div class="bst-consigne" aria-hidden="true"><span class="bst-px bst-consigne-mot"></span></div>
<div class="bst-trouve" aria-hidden="true"><span class="bst-px bst-nom"></span><span class="bst-px bst-rarete"></span><span class="bst-tampon" hidden></span></div>`;

/** Lance la scène dans `racine` (un élément vide, `.bst-scene`). */
export function lancerLaScene(racine: HTMLElement, o: OptionsDeScene): Scene {
  const scene = racine;
  scene.innerHTML = GABARIT;
  const $ = <T extends Element = HTMLElement>(s: string): T => scene.querySelector(s) as T;
  const carte = o.carte;
  const rangCarte = carte.rang;
  /** Le rang des réglages de la fête : un rendu se fête comme un commun. */
  const rf = Math.max(1, Math.min(6, rangCarte));
  const lumiereDuRang = (v: number): Rvb => (v <= 0 ? LUMIERE_NEUTRE : carte.rarete === "rendu" ? carte.lumiere : (LUMIERES[RARETES_DE_CARTE[v - 1] ?? "commun"] ?? LUMIERE_NEUTRE));

  const elPaquet = $<HTMLButtonElement>(".bst-paquet");
  const elBande = $(".bst-p-bande");
  const elCorps = $<HTMLCanvasElement>(".bst-p-corps");
  const elFiss = $<HTMLCanvasElement>(".bst-p-fissures");
  const elLueur = $(".bst-p-lueur");
  const elAura = $(".bst-p-aura");
  const jours = [...scene.querySelectorAll<HTMLElement>(".bst-p-jour")];
  const elTrait = $(".bst-lame");
  const elVoile = $(".bst-voile");
  const elR1 = $(".bst-r1");
  const elR2 = $(".bst-r2");
  const elHalo = $(".bst-halo");
  const elFais = $(".bst-faisceau");
  const elOmbre = $(".bst-ombre");
  const elEclat = $(".bst-eclat");
  const toileP = $<HTMLCanvasElement>(".bst-etincelles");
  const gP = toileP.getContext("2d");
  const elCons = $(".bst-consigne");
  const elConsMot = $(".bst-consigne-mot");
  const elTrouve = $(".bst-trouve");
  const elNom = $(".bst-nom");
  const elRar = $(".bst-rarete");
  const elTampon = $(".bst-tampon");
  const ondes: Onde[] = [...scene.querySelectorAll<HTMLElement>(".bst-onde")].map((el) => ({ el, t: -1, d: 1, x: 0, y: 0, k: 1 }));
  /** La vraie carte : son enveloppe dans la scène, sa taille, sa réduction pour tenir dans la scène, sa dernière place. */
  const vraie = o.vraie
    ? { el: document.createElement("div"), corps: o.vraie, l: 0, h: 0, k: 1, vue: false, place: null as null | readonly [number, number, number, number, number, number] }
    : null;
  let tailleDeLaVraie: ResizeObserver | null = null;
  /** La demi-largeur et la demi-hauteur de la carte à l'écran : la fête se pose autour d'elle. */
  const demi = { l: 102, h: 132 };
  const segs: HTMLElement[] = [];
  const charn = [0, 1, 2, 3].map(() => res(260, 11));
  const geo = { L: 0, H: 0, cx: 0, yP: 0, yC: 0, sol: 0 };
  let T = 0;
  let raf = 0;
  let avant = 0;
  let visible = true;
  let detruit = false;
  let fige = false;
  let estSombre = false;
  let revelee = false;
  let pause = false;
  const calme = (): boolean => !motionAllowed();
  const vers = (x: number, y: number, k: number, dt: number): number => (fige ? y : x + (y - x) * (1 - Math.exp(-dt * k)));
  const pasRes = (r: Ressort, dt: number): void => {
    if (fige) {
      r.v = r.c;
      r.vit = 0;
      return;
    }
    r.vit += (r.k * (r.c - r.v) - r.d * r.vit) * dt;
    r.v += r.vit * dt;
  };

  const S = {
    phase: "vide" as "vide" | "arrive" | "pret" | "vol" | "dos" | "tourne" | "main",
    tp: 0,
    vu: 0,
    eff: 0,
    cv: 0,
    plancher: 0,
    crans: 0,
    tenu: false,
    tempsTenu: 0,
    baseE: 0,
    grace: 0,
    traine: 0,
    tirX: 0,
    tirY: 0,
    appuiX: 0,
    appuiY: 0,
    appuiA: 0,
    penche: 0,
    froisse: 0,
    rot: res(300, 13),
    ec: res(430, 15),
    tx: res(240, 20),
    ty: res(240, 20),
    libre: 1,
    gel: 0,
    secousse: 0,
    tSec: 0,
    tr: 0,
    pvy: 0,
    pchute: 0,
    pbasc: 0,
    bd: null as { x: number; y: number; vx: number; vy: number; a: number; va: number } | null,
    lance: false,
    attente: 0,
    sens: 1,
    prise: null as { x0: number; y0: number; bouge: boolean } | null,
    lum: [...LUMIERE_NEUTRE] as number[],
    lumC: LUMIERE_NEUTRE as Rvb,
    lumTxt: "",
    voile: 0,
    rais: 0,
    fais: 0,
    eclat: 0,
    fete: 0,
    aurore: 0,
    trait: 0,
    carte: null as CarteVue | null,
    survol: false,
    hx: 0,
    hy: 0,
    flotte: 0,
    fissQ: -1,
    file: [] as { t: number; fn: () => void }[],
    semis: 0,
    pluie: 0,
    jourQ: "",
  };
  const apres = (d: number, fn: () => void): void => {
    S.file.push({ t: T + d, fn });
  };

  /** La couleur d'un grain de lumière pour un rang (0 : la lumière neutre du paquet scellé). */
  function teinte(rang: number, k = Math.random()): Rvb {
    if (!rang) return estSombre ? [255, 244, 214] : [255, 255, 255];
    let c = lumiereDuRang(rang);
    if (carte.rarete !== "rendu") {
      if (rang === 6) c = k < 0.5 ? c : k < 0.75 ? [255, 120, 214] : [255, 214, 90];
      if (rang === 5 && !estSombre && k < 0.6) c = [226, 150, 20];
      if (rang === 4 && k < 0.3) c = [255, 140, 60];
    }
    const b = k > 0.82 ? 0.75 : estSombre ? 0.3 : 0;
    return [(c[0] + (255 - c[0]) * b) | 0, (c[1] + (255 - c[1]) * b) | 0, (c[2] + (255 - c[2]) * b) | 0];
  }
  const P: Particule[] = [];
  function grain(x: number, y: number, vx: number, vy: number, duree: number, t: number, c: Rvb, op: { g?: number; f?: number; plus?: boolean; sc?: number } = {}): void {
    if (P.length < 560) P.push({ x, y, vx, vy, vie: 0, duree, t, c, g: op.g ?? 0, f: op.f ?? 1.5, plus: !!op.plus, sc: op.sc ?? 0, ph: Math.random() * 6.283 });
  }
  function onde(x: number, y: number, k = 1, d = 0.9): void {
    const w = ondes.find((u) => u.t < 0) ?? ondes[0];
    if (!w) return;
    w.t = 0;
    w.d = d;
    w.x = x;
    w.y = y;
    w.k = k;
    w.el.style.borderColor = w.el.style.color = `rgb(${S.lumC.join(",")})`;
  }
  const lire = (nom: string): string => getComputedStyle(scene).getPropertyValue(nom).trim();

  /**
   * La hauteur de la scène pour que la vraie carte y tienne en entier, à sa taille (réduite seulement si elle est plus large
   * que la scène) : au-dessus et au-dessous du milieu de la carte (43 % de la hauteur), sans mordre le nom écrit en bas.
   * Jamais moins que la hauteur de la feuille, au plus 1 100 pixels.
   */
  function hauteurPourLaVraie(base: number): number {
    if (!vraie) return base;
    const l = vraie.corps.offsetWidth;
    const h = vraie.corps.offsetHeight;
    if (!l || !h) return base;
    const k = Math.min(1, Math.max(60, scene.clientWidth - 24) / l);
    const hv = h * k;
    const besoin = Math.ceil(Math.max((hv / 2 + margeDuHaut(scene.clientWidth, l * k)) / 0.43, (hv / 2 + 88) / 0.57));
    // Pas plus haute que l'écran (moins le haut de la fenêtre) : au-delà, la carte se réduit plutôt que de sortir de l'écran.
    const plafond = Math.max(base, Math.min(1100, (typeof window === "undefined" ? 900 : window.innerHeight) - 140));
    return Math.min(Math.max(base, besoin), plafond);
  }
  /** L'air au-dessus de la carte : celui des boutons de la scène (son, pause) quand la carte arrive sous eux. */
  const margeDuHaut = (largeurScene: number, largeurCarte: number): number => ((largeurScene - largeurCarte) / 2 < 110 ? 58 : 12);
  function mesurer(): void {
    if (vraie) {
      // La scène grandit pour la vraie carte, plutôt que la carte ne rapetisse : le paquet et son mouvement restent les mêmes.
      scene.style.height = "";
      const base = scene.clientHeight;
      const voulue = hauteurPourLaVraie(base);
      if (voulue > base) scene.style.height = `${voulue}px`;
    }
    geo.L = scene.clientWidth;
    geo.H = scene.clientHeight;
    geo.cx = geo.L / 2;
    geo.yP = Math.round(geo.H * 0.47);
    geo.yC = Math.round(geo.H * 0.43);
    geo.sol = geo.H - 5;
    toileP.width = geo.L;
    toileP.height = geo.H;
    elPaquet.style.top = `${geo.yP - 132}px`;
    elFais.style.height = `${geo.yP + 24}px`;
    elOmbre.style.top = `${geo.yP + 152}px`;
    peindreFond();
    if (vraie && S.carte) mesurerLaVraie();
  }
  function peindreFond(): void {
    const c = $<HTMLCanvasElement>(".bst-fond");
    peindre(c, cielDeLaScene(geo.L / CASE, geo.H / CASE, lire("--bst-ciel-b") || "#d9e5fb", lire("--bst-etoile") || "#ffffff"));
  }

  /**
   * Un texte en pixels, à l'échelle `p`, sur deux lignes au plus s'il ne tient pas dans la scène ; `coul` : une couleur ou
   * un jeton de la feuille (`--bst-texte`).
   */
  function ecrit(el: HTMLElement, texte: string, coul: string, p = 2): void {
    el.querySelectorAll("canvas").forEach((c) => c.remove());
    if (!texte) return;
    const couleur = coul.startsWith("--") ? lire(coul) || "#0a1230" : coul;
    const max = Math.max(40, Math.floor((geo.L - 40) / p));
    for (const ligne of lignesDuTexte(enCapitales(texte), max, 2)) {
      const t = document.createElement("canvas");
      peindre(t, ecrire(ligne, couleur));
      t.style.width = `${t.width * p}px`;
      t.style.height = `${t.height * p}px`;
      t.setAttribute("aria-hidden", "true");
      el.append(t);
    }
  }
  let consigneVue = "";
  function consigne(t: string | null): void {
    if (!t) {
      elCons.classList.remove("bst-vu");
      return;
    }
    if (consigneVue !== t) {
      consigneVue = t;
      ecrit(elConsMot, t, "--bst-doux");
    }
    elCons.classList.add("bst-vu");
  }
  const motDuPaquet = (): string => (calme() ? "Touche pour ouvrir" : "Tiens le paquet");

  /* ---------- Les éclats qui ont du poids : ils tombent, rebondissent et restent au fond de la scène ---------- */
  function bout(x: number, y: number, op: { type?: "bout" | "eclat"; ang?: number; ouv?: number; dx?: number; dy?: number; v0: number; v1: number; couls: readonly string[] }): void {
    const ang = (((op.ang ?? -90) + (Math.random() * 2 - 1) * (op.ouv ?? 180)) * Math.PI) / 180;
    const v = op.v0 + Math.random() * (op.v1 - op.v0);
    P.push({
      type: op.type ?? "bout",
      x: x + (Math.random() * 2 - 1) * (op.dx ?? 4),
      y: y + (Math.random() * 2 - 1) * (op.dy ?? 2),
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v,
      a: Math.random() * 6.28,
      va: (Math.random() * 2 - 1) * 14,
      w: 2 + ((Math.random() * 3) | 0),
      h: 2 + ((Math.random() * 2) | 0),
      c: op.couls[(Math.random() * op.couls.length) | 0] ?? "#eef2fc",
      sol: geo.sol - Math.random() * 9,
      repos: false,
      g: 1,
    });
    while (P.length > 440) P.shift();
  }
  const sauter = (f: number): void => {
    for (const p of P)
      if (p.type && p.repos) {
        p.repos = false;
        p.vy = -(180 + Math.random() * 330) * f;
        p.vx = (Math.random() * 2 - 1) * 150 * f;
        p.va = (Math.random() * 2 - 1) * 12;
      }
  };
  const secouer = (f: number): void => {
    if (calme()) return;
    S.secousse = Math.max(S.secousse, f);
    S.tSec = 0;
  };

  /* ---------- La carte ---------- */
  function poserCarte(c: CarteVue, x: number, y: number, sc: number, rx: number, ry: number, rz: number): void {
    c.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    c.corps.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
  }
  function matiere(c: CarteVue, al: number, mx: number, my: number, h: number): void {
    const st = c.el.style;
    st.setProperty("--a", al.toFixed(3));
    st.setProperty("--mx", mx.toFixed(3));
    st.setProperty("--my", my.toFixed(3));
    st.setProperty("--h", h.toFixed(1));
    if (c.rang >= 5) st.setProperty("--ang", ((T * 46 + c.dec * 57) % 360).toFixed(1));
  }
  function creerCarteDeScene(): CarteVue {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "bst-carte bst-dos";
    el.dataset.r = carte.rarete;
    el.style.setProperty("--s", String(CASE));
    el.innerHTML = '<span class="bst-c-aura"></span><span class="bst-c-ombre"></span><span class="bst-c-corps"><canvas class="bst-c-face"></canvas><canvas class="bst-c-dos"></canvas><span class="bst-c-mat"></span><span class="bst-c-grains"></span><span class="bst-c-reflet"></span><span class="bst-c-lisere"></span></span>';
    peindre(el.querySelector<HTMLCanvasElement>(".bst-c-face")!, carte.face);
    peindre(el.querySelector<HTMLCanvasElement>(".bst-c-dos")!, dosDeCarte());
    el.tabIndex = -1;
    el.style.display = "none";
    scene.insertBefore(el, elPaquet);
    const c: CarteVue = { el, corps: el.querySelector<HTMLElement>(".bst-c-corps")!, rang: rangCarte, dec: Math.random() * 6.283, a: 0, mx: 0.5, my: 0.5, z: -1, vol: 0, devant: false, x: res(210, 20), y: res(210, 20), rz: res(160, 16), sc: res(230, 17, 1), rx: res(170, 14), ry: res(170, 14), tour: res(190, 15) };
    c.tour.v = c.tour.c = 180;
    S.carte = c;
    // La vraie carte passe juste après la carte dessinée : par-dessus son aura. La carte dessinée prend sa taille.
    if (vraie) {
      el.after(vraie.el);
      mesurerLaVraie();
    }
    el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || S.phase !== "dos" || calme() || pause) return;
      S.prise = { x0: e.clientX, y0: e.clientY, bouge: false };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Sans capture, le retournement se fait au relâché.
      }
      son.sonPrise();
      relancer();
    });
    el.addEventListener("pointermove", (e) => {
      const q = S.prise;
      if (!q || S.phase !== "dos") return;
      const dx = e.clientX - q.x0;
      if (!q.bouge && Math.hypot(dx, e.clientY - q.y0) > 7) q.bouge = true;
      if (!q.bouge) return;
      S.sens = dx > 0 ? -1 : 1;
      const ang = borne(180 - (Math.abs(dx) / (demi.l * 2)) * 190, 0, 180);
      c.tour.v = c.tour.c = ang;
      c.tour.vit = 0;
      if (ang < 104) {
        S.prise = null;
        retourner(true);
      }
    });
    const fin = (e: PointerEvent): void => {
      const q = S.prise;
      if (!q) return;
      S.prise = null;
      if (S.phase === "dos") {
        if (!q.bouge && e.type === "pointerup") retourner();
        else c.tour.c = 180;
      }
      relancer();
    };
    el.addEventListener("pointerup", fin);
    el.addEventListener("pointercancel", fin);
    // Au clavier (ou avec le mouvement coupé) : un clic retourne la carte.
    el.addEventListener("click", (e) => {
      if (S.phase !== "dos" || pause) return;
      if (e.detail === 0) retourner();
      else if (calme()) reveler();
    });
    return c;
  }

  /* ---------- La vraie carte ---------- */
  /**
   * Sa taille, et sa réduction pour tenir dans la scène : au-dessus et au-dessous du milieu de la carte, sans mordre le nom
   * écrit en bas de la scène, ni ses bords. La carte dessinée prend la même taille, pour que son aura l'entoure.
   */
  function mesurerLaVraie(): void {
    const v = vraie;
    const c = S.carte;
    if (!v || !c) return;
    v.l = v.corps.offsetWidth;
    v.h = v.corps.offsetHeight;
    if (!v.l || !v.h) return;
    const haut = 2 * Math.max(60, Math.min(geo.yC - margeDuHaut(geo.L, Math.min(v.l, geo.L - 24)), geo.H - 88 - geo.yC));
    v.k = Math.min(1, haut / v.h, Math.max(60, geo.L - 24) / v.l);
    v.el.style.width = `${v.l}px`;
    v.el.style.height = `${v.h}px`;
    v.el.style.margin = `${(-v.h / 2).toFixed(1)}px 0 0 ${(-v.l / 2).toFixed(1)}px`;
    // La carte dessinée a la taille de la vraie dès sa sortie du paquet : son dos est dessiné à cette taille, une case pour
    // trois pixels, et son aura l'entoure. C'est une seule carte, du paquet à la fête.
    const w = v.l * v.k;
    const h = v.h * v.k;
    demi.l = w / 2;
    demi.h = h / 2;
    c.el.classList.add("bst-a-la-vraie");
    c.el.style.width = `${w.toFixed(1)}px`;
    c.el.style.height = `${h.toFixed(1)}px`;
    c.el.style.margin = `${(-h / 2).toFixed(1)}px 0 0 ${(-w / 2).toFixed(1)}px`;
    const cl = Math.max(20, Math.round(w / CASE));
    const ch = Math.max(20, Math.round(h / CASE));
    const dos = c.el.querySelector<HTMLCanvasElement>(".bst-c-dos");
    if (dos && (dos.width !== cl || dos.height !== ch)) peindre(dos, dosDeCarte(cl, ch));
    if (v.place) poserLaVraie(c, ...v.place);
  }
  /** La vraie carte suit la carte dessinée : la même place, la même inclinaison, une fois passée la tranche. */
  function poserLaVraie(c: CarteVue, x: number, y: number, sc: number, rx: number, ry: number, rz: number): void {
    const v = vraie;
    if (!v) return;
    v.place = [x, y, sc, rx, ry, rz];
    const face = c.tour.v <= 90 && (S.phase === "tourne" || S.phase === "main");
    if (face !== v.vue) {
      v.vue = face;
      v.el.classList.toggle("bst-vu", face);
      c.el.classList.toggle("bst-avec-vraie", face);
      if (face) mesurerLaVraie();
    }
    v.el.toggleAttribute("data-active", S.phase === "main");
    // Ses boutons ne s'atteignent, au clavier comme au pointeur, qu'une fois la carte posée.
    if (v.el.inert !== (S.phase !== "main")) v.el.inert = S.phase !== "main";
    if (!face) return;
    v.el.style.zIndex = c.el.style.zIndex;
    v.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rz.toFixed(2)}deg) scale(${(sc * v.k).toFixed(3)})`;
    v.corps.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
  }

  /* ---------- Le déroulé ---------- */
  const phase = (p: typeof S.phase): void => {
    S.phase = p;
    S.tp = 0;
  };
  function voir(v: number, x: number, y: number): void {
    S.vu = v;
    S.lumC = lumiereDuRang(v);
    onde(x, y, 0.5, 0.6);
    son.sonPalier(v);
  }
  /** Une couture craque : du papier saute, le paquet sursaute, et la lumière de la rareté passe (jamais plus haut que la vraie). */
  function craquer(): void {
    S.crans++;
    S.plancher = S.crans / 4;
    if (S.crans >= 4) return rompre();
    const j = 4 - S.crans;
    const x = geo.cx - 90 + j * 45 + 22 + S.tx.v;
    const y = geo.yP - 104 + S.flotte + S.ty.v;
    for (let i = 0; i < 4; i++) bout(x, y, { ang: -70, ouv: 60, v0: 180, v1: 510, couls: PAPIER });
    S.rot.vit += (S.crans % 2 ? 1 : -1) * 70;
    S.ec.vit -= 1.1;
    S.gel = 0.045;
    secouer(0.5);
    son.sonCraque();
    charn[j]!.vit -= 240;
    consigne(null);
    const v = Math.min(rangCarte, S.crans);
    if (v > S.vu) voir(v, x, y);
    for (let i = 0; i < 9; i++) grain(x + Math.random() * 30 - 15, y, Math.random() * 60 - 30, -90 - Math.random() * 160, 0.5 + Math.random() * 0.5, 1, teinte(S.vu), { f: 1.5 });
  }
  /** Le paquet cède d'un coup : la bande s'envole, le papier vole, la carte jaillit dans un rai de lumière. */
  function rompre(): void {
    phase("vol");
    S.tenu = false;
    S.gel = 0.07;
    secouer(1.6);
    son.sonDechire();
    son.nappeFin(0.2);
    consigne(null);
    S.vu = rangCarte;
    S.lumC = carte.lumiere;
    S.eclat = 1;
    son.sonEclat(rf);
    const x0 = geo.cx - 90 + S.tx.v;
    const y0 = geo.yP - 132 + S.flotte + S.ty.v;
    const my = y0 + 30;
    const mx = geo.cx + S.tx.v;
    S.bd = { x: x0, y: y0, vx: -(90 + Math.random() * 120), vy: -(750 + Math.random() * 240), a: S.rot.v, va: -(300 + Math.random() * 160) };
    scene.insertBefore(elBande, toileP);
    elBande.classList.add("bst-libre");
    charn.forEach((c, j) => {
      c.c = -16 - j * 4;
      c.vit -= 200;
    });
    for (let i = 0; i < 20; i++) bout(mx, my, { ang: -90, ouv: 70, dx: 70, v0: 330, v1: 1100, couls: PAPIER });
    for (let i = 0; i < 20 + 10 * rf; i++) {
      const an = -Math.PI * (0.12 + Math.random() * 0.76);
      const v = 120 + Math.random() * (300 + rf * 50);
      grain(mx + (Math.random() - 0.5) * 150, my, Math.cos(an) * v, Math.sin(an) * v, 0.7 + Math.random() * 0.8, Math.random() < 0.2 ? 2 : 1, teinte(rangCarte), { f: 2.4, g: 60, plus: Math.random() < 0.18 });
    }
    onde(mx, my, 0.9 + rf * 0.08, 0.9);
    if (rf >= 3) apres(0.14, () => onde(mx, my, 1.5, 1));
    if (rf >= 5) apres(0.3, () => onde(mx, my, 2.1, 1.2));
    S.ec.vit += 2.6;
    S.rot.vit += Math.random() * 120 - 60;
    S.tx.c = S.ty.c = 0;
    creerCarteDeScene();
  }
  /** La carte se pose face cachée, avec son poids : plus la rareté est haute, plus la scène tremble. */
  function atterrir(): void {
    const c = S.carte;
    if (!c) return;
    phase("dos");
    c.vol = 0;
    c.devant = true;
    c.x.v = c.x.c = 0;
    c.y.v = c.y.c = 0;
    c.y.vit = 450 + rf * 66;
    c.sc.v = 1.12;
    c.sc.c = 1;
    c.sc.vit = -1.2;
    c.rz.v = -5;
    c.rz.c = 0;
    c.rz.vit = 40;
    const f = a([0, 0.5, 0.6, 0.9, 1.2, 2.2, 1], rf);
    secouer(f);
    son.sonChoc(f);
    if (rf >= 5) sauter(0.8);
    onde(geo.cx, geo.yC + demi.h - 22, 0.4, 0.5);
    c.el.tabIndex = 0;
    c.el.setAttribute("aria-label", "Carte face cachée : la retourner");
    if (document.activeElement === elPaquet || document.activeElement === scene) c.el.focus({ preventScroll: true });
    consigne("Retourne la carte");
  }
  /** Le joueur retourne la carte ; les hautes raretés se font attendre sur la tranche, un trait de lumière à leur couleur. */
  function retourner(deja = false): void {
    const c = S.carte;
    if (S.phase !== "dos" || !c) return;
    phase("tourne");
    consigne(null);
    if (!deja) son.sonFlap();
    if (rangCarte < 4) {
      c.tour.c = 0;
      return;
    }
    S.attente = a([0.33, 0.5, 0.78], rangCarte - 4);
    c.tour.c = 94;
    son.sonTension(S.attente + 0.2);
    if (rangCarte >= 6)
      for (const p of P)
        if (p.type && p.repos) {
          // Le divin : le silence, et tout ce qui traînait se soulève.
          p.repos = false;
          p.vy = -(60 + Math.random() * 180);
          p.g = -0.08;
          p.sol = 1e9;
        }
    apres(S.attente + 0.22, () => {
      if (S.phase === "tourne" && S.carte === c) {
        S.attente = 0;
        c.tour.c = 0;
        son.sonFlap();
      }
    });
  }
  function montrerTrouve(fixe: boolean): void {
    const r = rangCarte;
    const T3 = carte.tons;
    const mot = enCapitales(carte.mot);
    ecrit(elNom, carte.nom, "--bst-texte");
    elTampon.replaceChildren();
    elTampon.hidden = r < 5;
    elRar.hidden = r >= 5;
    if (r >= 5) {
      // Les lettres frappées une à une.
      const k = geo.L < 620 ? 3 : 4;
      [...mot].forEach((ch, i) => {
        const l = document.createElement("canvas");
        peindre(l, ecrire(ch, estSombre ? T3[1] : T3[3], null, estSombre ? "#070b1f" : "#ffffff"));
        l.style.width = `${l.width * k}px`;
        l.style.height = `${l.height * k}px`;
        if (fixe || calme()) l.style.animation = "none";
        else {
          l.style.animationDelay = `${250 + i * 75}ms`;
          apres(0.35 + i * 0.075, son.sonLettre);
        }
        elTampon.append(l);
      });
    } else {
      ecrit(elRar, mot, T3[3]);
      elRar.style.background = T3[0];
      elRar.style.borderColor = T3[2];
    }
    elTrouve.classList.add("bst-vu");
    consigne(null);
  }
  function annoncer(): void {
    if (revelee) return;
    revelee = true;
    o.onRevelee();
  }
  function reveler(): void {
    const c = S.carte;
    if (!c) return;
    const r = rf;
    const n = a([8, 14, 24, 36, 60, 84], r - 1);
    phase("main");
    S.fete = 1;
    S.attente = 0;
    c.tour.c = 0;
    c.sc.vit += 2.2;
    c.devant = true;
    c.el.style.display = "";
    son.sonRevele(rangCarte);
    c.el.tabIndex = -1;
    c.el.setAttribute("aria-label", `${carte.nom}, ${carte.mot.toLowerCase()}`);
    for (let i = 0; i < n; i++) {
      const an = Math.random() * 6.283;
      const v = 50 + Math.random() * (120 + r * 30);
      grain(geo.cx + Math.cos(an) * (demi.l + 2), geo.yC + Math.sin(an) * (demi.h + 2), Math.cos(an) * v, Math.sin(an) * v, 0.7 + Math.random() * (0.6 + r * 0.15), Math.random() < 0.15 ? 2 : 1, teinte(rangCarte || 0), { f: 2, plus: Math.random() < 0.15 + r * 0.03, sc: r >= 5 ? 6 : 0 });
    }
    const od = (d: number, k: number, dd = 1): void => apres(d, () => onde(geo.cx, geo.yC, k, dd));
    onde(geo.cx, geo.yC, 0.5 + r * 0.18, 0.9);
    if (r >= 3) od(0.18, 1.5);
    if (r >= 4) od(0.38, 1.9);
    if (r >= 5) {
      od(0.62, 2.3, 1.2);
      S.eclat = 0.5;
    }
    if (r >= 6) od(0.9, 2.8, 1.5);
    const nb = a([0, 0, 6, 12, 20, 46, 0], r);
    const T3 = carte.tons;
    for (let i = 0; i < nb; i++) bout(geo.cx, geo.yC, { type: r >= 5 ? "eclat" : "bout", ouv: 180, dx: 90, dy: 120, v0: 300, v1: 900 + r * 100, couls: r >= 5 ? ["#ffd84a", "#f2b632", "#d9a21b"] : [T3[2], T3[1], "#ffffff"] });
    if (r >= 4) secouer(r === 5 ? 2.4 : 1);
    if (r === 5) {
      sauter(1.1);
      S.gel = 0.08;
    }
    montrerTrouve(false);
    annoncer();
  }
  /** Droit à la carte révélée : un second appui pendant le vol ou le retournement, ou « Passer ». */
  function passer(): void {
    if (S.phase === "main" || detruit) return;
    son.nappeFin();
    if (!S.carte) {
      // Le paquet est encore fermé : il disparaît d'un coup, la carte paraît.
      S.vu = rangCarte;
      S.lumC = carte.lumiere;
      S.crans = 4;
      S.tenu = false;
      elPaquet.hidden = true;
      creerCarteDeScene();
    }
    const c = S.carte!;
    S.file.length = 0;
    S.gel = 0;
    S.attente = 0;
    S.prise = null;
    S.tr = 9;
    c.vol = 0;
    for (const k of ["x", "y", "rz", "rx", "ry", "tour"] as const) c[k].v = c[k].c = c[k].vit = 0;
    c.sc.v = c.sc.c = 1;
    c.sc.vit = 0;
    if (document.activeElement === elPaquet || document.activeElement === c.el) scene.focus({ preventScroll: true });
    reveler();
    if (!doitTourner()) rendreFixe();
    else relancer();
  }
  const enCours = (): boolean => (S.phase === "vol" && S.tp > 0.12) || (S.phase === "tourne" && S.tp > 0.08);
  /** Mouvement coupé : un appui sur le paquet pose la carte retournée, sans mouvement. */
  function ouvrirCalme(): void {
    S.vu = rangCarte;
    S.lumC = carte.lumiere;
    const c = creerCarteDeScene();
    c.el.style.display = "";
    c.tour.v = c.tour.c = 0;
    c.devant = true;
    S.tr = 9;
    S.crans = 4;
    phase("main");
    S.tp = 9;
    S.fete = 0.3;
    c.el.setAttribute("aria-label", `${carte.nom}, ${carte.mot.toLowerCase()}`);
    montrerTrouve(true);
    son.sonRevele(rangCarte);
    if (document.activeElement === elPaquet) scene.focus({ preventScroll: true });
    rendreFixe();
    annoncer();
  }
  function saisir(x: number, y: number): void {
    son.reveillerLeSon();
    if (pause) return;
    if (calme()) {
      if (S.phase === "pret" || S.phase === "arrive") ouvrirCalme();
      return;
    }
    if (S.phase !== "pret") return;
    S.tenu = true;
    S.tempsTenu = 0;
    S.baseE = S.eff;
    S.traine = 0;
    S.tirX = S.tirY = 0;
    S.appuiX = x;
    S.appuiY = y;
    S.appuiA = performance.now();
    S.grace = 0;
    const r = elPaquet.getBoundingClientRect();
    S.penche = borne((x - r.left - r.width / 2) / 90, -1, 1);
    consigne(null);
    son.nappeSur();
    relancer();
  }
  function relacher(): void {
    if (!S.tenu) return;
    S.tenu = false;
    // Un petit coup : une couture.
    if (performance.now() - S.appuiA < 190 && S.traine < 8 && S.phase === "pret") {
      S.eff = Math.min(1, S.eff + 0.25);
      S.rot.vit += (Math.random() * 2 - 1) * 70;
      S.ec.vit += 1.4;
    }
    S.grace = 0.55;
    S.rot.vit += S.tirX * 0.6;
    relancer();
  }

  function pasScene(dtReel: number): void {
    const g = geo;
    const r = rf;
    let dt = dtReel;
    if (S.gel > 0) {
      S.gel -= dtReel;
      dt = 0;
    }
    S.tp += dt;
    for (let i = S.file.length - 1; i >= 0; i--) if (S.file[i]!.t <= T) S.file.splice(i, 1)[0]!.fn();
    if (S.phase === "vide") return;
    // --- ce qui se passe
    if (S.phase === "arrive" && S.tp > 0.45) phase("pret");
    if (S.phase === "pret") {
      if (S.tenu) {
        S.tempsTenu += dt;
        S.eff = Math.min(1, Math.max(S.eff, S.baseE + S.tempsTenu / 1.2, S.traine / 230));
        S.froisse += dt * (5 + S.eff * 22);
        if (S.froisse > 1) {
          S.froisse = 0;
          son.sonFroisse(S.eff);
        }
      } else if (S.grace > 0) S.grace -= dt;
      else if (S.eff > S.plancher) S.eff = Math.max(S.plancher, S.eff - 1.3 * dt);
      if (dt > 0) son.coeur(S.eff);
      while (S.phase === "pret" && S.crans < 4 && S.eff >= (S.crans + 1) / 4 - 1e-6) craquer();
      if (S.phase === "pret") {
        if (S.eff > 0) son.nappeMaj(S.eff);
        else if (!S.tenu) {
          son.nappeFin();
          if (!S.crans) consigne(motDuPaquet());
        }
      }
    }
    const u = S.phase === "pret" ? borne((S.eff - S.plancher) / 0.25) : 0;
    const c = S.carte;
    if (S.phase === "pret") {
      S.tx.c = S.tenu ? borne(S.tirX * 0.1 + S.penche * 9, -27, 27) : 0;
      S.ty.c = S.tenu ? borne(S.tirY * 0.1, -21, 15) : 0;
      for (let j = 0; j < 4; j++) charn[j]!.c = j >= 4 - S.crans ? -(24 + (j - (4 - S.crans)) * 5) - u * 4 : j === 3 - S.crans ? -9 * u * u : 0;
    } else if (S.phase === "vol" && c) {
      const t = S.tp - 0.09;
      const D = 0.62;
      const A = 0.3;
      if (t >= 0) {
        if (!S.lance) {
          S.lance = true;
          c.el.style.display = "";
          son.sonJaillit();
        }
        const k = Math.min(1, t / D);
        const y0 = g.yP + 20 - g.yC;
        const ya = -120;
        if (t < A) {
          const q = t / A;
          c.y.v = entre(y0, ya, 1 - (1 - q) * (1 - q));
          c.sc.v = entre(0.68, 0.86, q);
          c.devant = false;
        } else {
          const q = Math.min(1, (t - A) / (D - A));
          c.y.v = entre(ya, 0, q * q);
          c.sc.v = entre(0.86, 1.12, q);
          c.devant = true;
        }
        c.vol = -360 * k;
        c.rz.v = 15 * Math.sin(Math.PI * k) - 5 * k;
        c.x.v = 21 * Math.sin(Math.PI * k);
        if (t >= D) atterrir();
      }
    } else if (S.phase === "tourne" && c) {
      if (!S.attente && c.tour.v < 86) reveler();
    } else if (S.phase === "main") S.fete = Math.max(0.3, S.fete - dt * 0.16);
    if (S.crans >= 4) {
      S.tr += dt;
      if (S.tr > 0.3) {
        S.pvy += GRAV * 1.2 * dt;
        S.pchute += S.pvy * dt;
        S.pbasc = Math.min(70, S.pbasc + 220 * dt);
      }
    }
    for (const x of [S.rot, S.ec, S.tx, S.ty, ...charn]) pasRes(x, dt);
    if (S.bd) {
      const b = S.bd;
      b.vy += GRAV * 1.4 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.va * dt;
      if (b.y > g.H + 90) {
        S.bd = null;
        elBande.style.opacity = "0";
      }
    }
    if (S.secousse > 0.02) {
      S.tSec += dtReel;
      S.secousse *= Math.exp(-7 * dtReel);
    } else S.secousse = 0;

    // --- ce qu'on voit
    S.cv = vers(S.cv, S.eff, 14, dt);
    S.libre = vers(S.libre, S.tenu ? 0 : 1 - 0.6 * S.cv, 8, dt);
    for (let i = 0; i < 3; i++) S.lum[i] = vers(S.lum[i]!, S.lumC[i]!, 9, dtReel);
    const txt = S.lum.map(Math.round).join(",");
    if (txt !== S.lumTxt) {
      S.lumTxt = txt;
      scene.style.setProperty("--lum", txt);
    }
    const sx0 = S.secousse > 0 ? Math.round(S.secousse * CASE * Math.sin(S.tSec * 58)) : 0;
    const sy0 = S.secousse > 0 ? Math.round(S.secousse * CASE * 0.8 * Math.cos(S.tSec * 47)) : 0;
    scene.style.transform = sx0 || sy0 ? `translate3d(${sx0}px,${sy0}px,0)` : "";
    const enPaquet = S.phase === "arrive" || S.phase === "pret";
    const cv = S.cv;
    const souffleB = Math.sin(T * 1.6);
    let px = 0;
    let py = 0;
    let prz = 0;
    let ex = 1;
    let ey = 1;
    let pop = 1;
    let haloY = g.yP;
    let haloO = 0.4;
    let haloS = 0.5;
    let voileC = 0;
    let raisC = 0;
    let faisC = 0;
    let auroreC = 0;
    let traitC = 0;
    if (S.crans < 4) {
      const amp = CASE * (0.2 + 1.5 * cv) * Math.pow(u, 1.6) * (S.tenu ? 1 : 0.35);
      const ec = S.ec.v * 0.1;
      const etire = 0.06 * cv * u;
      px = S.tx.v + amp * (Math.sin(T * 83) + Math.sin(T * 131 + 1)) * 0.5;
      py = Math.sin(T * 1.25) * 5 * S.libre + S.ty.v + amp * 0.6 * (Math.sin(T * 97 + 2) + Math.sin(T * 149)) * 0.5;
      prz = Math.sin(T * 0.8) * 1.2 * S.libre + S.rot.v + (S.tenu ? borne(S.tirX * 0.02, -7, 7) + S.penche * 3 : 0) + 0.7 * u * cv * Math.sin(T * 71);
      ex = 1 + ec * 0.6 - etire * 0.5 + cv * 0.02;
      ey = 1 - ec + etire + souffleB * 0.008 * S.libre;
      if (S.phase === "arrive") {
        const q = sortCub(S.tp / 0.45);
        py -= (1 - q) * 70;
        pop = q;
      }
      S.flotte = py - S.ty.v;
    } else {
      const ec = S.ec.v * 0.1;
      px = S.tx.v;
      py = S.pchute + S.ty.v;
      prz = S.rot.v - S.pbasc;
      ex = 1 + ec * 0.6;
      ey = 1 - ec;
      pop = 1 - lisse(0.4, 0.75, S.tr);
    }
    if (enPaquet) {
      haloY = g.yP + py;
      haloO = 0.62 + 0.1 * souffleB + cv * 0.3;
      haloS = 0.92 + 0.03 * souffleB + cv * 0.3 + S.crans * 0.04;
      voileC = cv * 0.2;
    } else if (S.phase === "vol") {
      haloY = S.lance && c ? g.yC + c.y.v : g.yP - 100;
      haloO = 0.9;
      haloS = 0.95;
      voileC = 0.12 + a(V_MAIN, r) * 0.4;
      faisC = S.tp < 0.5 ? 1 : 0;
    } else if (S.phase === "dos") {
      haloY = g.yC;
      haloO = 0.55 + 0.1 * Math.sin(T * 2);
      haloS = 0.8;
      voileC = 0.1 + a(V_MAIN, r) * 0.5;
    } else if (S.phase === "tourne") {
      const att = S.attente > 0;
      haloY = g.yC;
      haloO = att ? 0.9 : 0.7;
      haloS = att ? (rangCarte >= 6 ? 0.4 : 0.7) : 0.9;
      voileC = att ? a(V_MAIN, r) + (rangCarte >= 6 ? 0.2 : 0.1) : a(V_MAIN, r) * 0.6;
      faisC = att ? 0.8 : 0;
      traitC = att ? 1 : 0;
    } else {
      const f = 0.55 + 0.45 * S.fete;
      haloY = g.yC;
      haloO = a(HALO_O, r) * (0.7 + 0.3 * S.fete);
      haloS = a(HALO_S, r) * (1 + 0.03 * Math.sin(T * 1.3));
      voileC = a(V_MAIN, r) * (0.7 + 0.3 * S.fete);
      raisC = a(R_MAIN, r) * f;
      faisC = rangCarte >= 5 ? 0.34 : 0;
      auroreC = rangCarte >= 6 ? 1 : 0;
    }
    S.voile = vers(S.voile, voileC, 5, dtReel);
    S.rais = vers(S.rais, raisC, 3, dtReel);
    S.fais = vers(S.fais, faisC, S.phase === "vol" || S.phase === "tourne" ? 14 : 2.2, dtReel);
    S.aurore = vers(S.aurore, auroreC, 1.2, dtReel);
    S.trait = vers(S.trait, traitC, 16, dtReel);
    S.eclat = Math.max(0, S.eclat - dtReel * 2.6);

    if (pop > 0.001) {
      elPaquet.hidden = false;
      elPaquet.style.opacity = pop.toFixed(3);
      elPaquet.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${prz.toFixed(2)}deg) scale(${ex.toFixed(4)},${ey.toFixed(4)})`;
      let cle = "";
      for (let j = 0; j < 4; j++) {
        segs[j]!.style.transform = `rotate(${charn[j]!.v.toFixed(2)}deg)`;
        const ouvert = j >= 4 - S.crans;
        const h = Math.round(ouvert ? 10 + 2 * Math.sin(T * 3 + j) : 3 + 1.2 * souffleB * S.libre + cv + (j === 3 - S.crans ? u * 5 : 0));
        cle += (ouvert ? "o" : "f") + h;
        if (cle !== S.jourQ.slice(0, cle.length)) {
          jours[j]!.style.top = `${30 - h}px`;
          jours[j]!.style.height = `${h}px`;
          jours[j]!.classList.toggle("bst-ouvert", ouvert);
        }
      }
      S.jourQ = cle;
      elLueur.style.opacity = Math.min(1, 0.4 + 0.12 * souffleB + cv * 0.5).toFixed(3);
      elAura.style.opacity = Math.min(1, 0.6 + 0.12 * souffleB + cv * 0.4).toFixed(3);
      elAura.style.transform = `scale(${(0.86 + 0.03 * souffleB + cv * 0.3).toFixed(3)})`;
      const fq = Math.round(lisse(0.15, 1, cv) * 10);
      if (fq !== S.fissQ) {
        S.fissQ = fq;
        peindre(elFiss, fissures(fq / 10));
      }
      elOmbre.style.opacity = (pop * borne(1 - py * 0.01)).toFixed(3);
      elOmbre.style.transform = `translate3d(${px.toFixed(1)}px,0,0) scale(${(1 - borne(py, -40, 40) * 0.012).toFixed(3)},1)`;
    } else if (!elPaquet.hidden) {
      elPaquet.hidden = true;
      elOmbre.style.opacity = "0";
    }
    if (S.bd) elBande.style.transform = `translate3d(${S.bd.x.toFixed(1)}px,${S.bd.y.toFixed(1)}px,0) rotate(${S.bd.a.toFixed(1)}deg)`;
    elHalo.style.opacity = haloO.toFixed(3);
    elHalo.style.transform = `translate3d(0,${haloY.toFixed(1)}px,0) scale(${haloS.toFixed(3)})`;
    elVoile.style.opacity = S.voile.toFixed(3);
    elR1.style.opacity = S.rais.toFixed(3);
    elR2.style.opacity = (S.rais * (estSombre ? 0.55 : 0.8)).toFixed(3);
    if (S.rais > 0.004) {
      elR1.style.transform = `rotate(${((T * 5) % 360).toFixed(2)}deg)`;
      elR2.style.transform = `rotate(${((-T * 3.4) % 360).toFixed(2)}deg)`;
    }
    elFais.style.opacity = S.fais.toFixed(3);
    if (S.fais > 0.004) elFais.style.transform = `translate3d(0,${S.phase === "vol" ? 0 : 118}px,0) scale(${(S.phase === "vol" ? 0.3 + 0.7 * sortCub(S.tp / 0.3) : 1 + 0.04 * Math.sin(T * 0.9)).toFixed(3)},1)`;
    elTrait.style.opacity = S.trait.toFixed(3);
    if (S.trait > 0.004 && c) elTrait.style.transform = `translate3d(0,${(g.yC + c.y.v).toFixed(1)}px,0) scale(1,${(0.7 + 0.3 * S.trait).toFixed(3)})`;
    elEclat.style.opacity = (S.eclat * S.eclat).toFixed(3);
    if (S.eclat > 0) elEclat.style.transform = `translate3d(0,${(S.phase === "vol" ? g.yP - 100 : g.yC).toFixed(0)}px,0) scale(${(1.5 - S.eclat * 1.1).toFixed(3)})`;
    for (const w of ondes) {
      if (w.t < 0) continue;
      w.t += dt / w.d;
      if (w.t >= 1) {
        w.t = -1;
        w.el.style.opacity = "0";
        continue;
      }
      const d = Math.round(60 + sortCub(w.t) * 400 * w.k);
      w.el.style.opacity = (Math.pow(1 - w.t, 1.6) * 0.9).toFixed(3);
      w.el.style.width = w.el.style.height = `${d}px`;
      w.el.style.transform = `translate3d(${(w.x - g.cx - d / 2).toFixed(1)}px,${(w.y - d / 2).toFixed(1)}px,0)`;
    }

    // --- la carte
    if (c && (S.phase !== "vol" || S.lance)) {
      const sv = S.survol && !S.prise;
      const z = c.devant ? 2 : 0;
      if (z !== c.z) {
        c.z = z;
        c.el.style.zIndex = String(z);
      }
      if (S.phase === "vol") {
        c.el.classList.add("bst-dos");
        c.el.style.transform = `translate3d(${c.x.v.toFixed(1)}px,${(g.yC + c.y.v).toFixed(1)}px,0) rotate(${c.rz.v.toFixed(2)}deg) scale(${c.sc.v.toFixed(3)})`;
        c.corps.style.transform = `rotateX(${c.vol.toFixed(1)}deg)`;
        matiere(c, 1, 0.5, 0.5, 20);
      } else {
        let al = a(A_REPOS, r);
        let mx = 0.5 + 0.45 * Math.sin(T * 0.6);
        let my = 0.5 + 0.3 * Math.cos(T * 0.45);
        let h = 14;
        c.x.c = 0;
        c.y.c = 0;
        c.rz.c = 0;
        c.sc.c = 1;
        if (S.phase === "dos") {
          c.rx.c = sv ? -S.hy * 8 : Math.sin(T * 0.7 + 1) * 1.5;
          c.ry.c = sv ? S.hx * 10 : Math.sin(T * 0.9) * 3;
          c.sc.c = S.prise ? 1.05 : sv ? 1.03 : 1;
          al = 0.75 + 0.2 * Math.sin(T * 2.2);
          h = S.prise ? 16 : 4;
        } else if (S.phase === "tourne") {
          c.rx.c = 0;
          c.ry.c = 0;
          c.sc.c = S.attente ? 1.1 : 1.04;
          c.y.c = S.attente ? -24 : -8;
          al = 1;
          h = 30;
        } else {
          c.y.c = (r >= 5 ? -8 : 0) + Math.sin(T * 1.1) * (r >= 5 ? 6 : 4);
          c.rx.c = sv ? -S.hy * 10 : Math.sin(T * 0.7 + 1) * 2.2;
          c.ry.c = sv ? S.hx * 13 : Math.sin(T * 0.55) * (3 + r);
          c.sc.c = sv ? 1.04 : 1;
          al = sv ? 1 : Math.max(a(A_REPOS, r), (S.fete - 0.3) * 0.6);
          if (sv) {
            mx = 0.5 + S.hx * 0.5;
            my = 0.5 + S.hy * 0.5;
            h = 24;
          }
        }
        for (const k of ["x", "y", "rz", "sc", "rx", "ry", "tour"] as const) pasRes(c[k], dt);
        c.el.classList.toggle("bst-dos", c.tour.v > 90);
        c.a = vers(c.a, al, 8, dt);
        c.mx = vers(c.mx, mx, 10, dt);
        c.my = vers(c.my, my, 10, dt);
        poserCarte(c, c.x.v, g.yC + c.y.v, c.sc.v, c.rx.v, c.ry.v + c.tour.v * S.sens, c.rz.v);
        poserLaVraie(c, c.x.v, g.yC + c.y.v, c.sc.v, c.rx.v, c.ry.v + c.tour.v * S.sens, c.rz.v);
        matiere(c, c.a, c.mx, c.my, h);
      }
    }
    semer(dt);
  }

  /** Les grains de lumière : ceux qui filtrent par la couture, ceux que le paquet aspire, ceux de la carte et de la fête. */
  function semer(dt: number): void {
    const g = geo;
    const r = rf;
    const al = Math.random;
    const c = S.carte;
    if (fige || dt <= 0) return;
    S.semis += dt;
    if (S.phase === "pret") {
      const cadence = S.tenu ? 0.035 / Math.max(0.15, S.cv) : S.crans ? 0.12 : 0.3;
      const yS = g.yP + S.flotte + S.ty.v - 104;
      while (S.semis > cadence) {
        S.semis -= cadence;
        if (S.tenu && al() < 0.6) {
          const an = al() * 6.283;
          const d = 150 + al() * 90;
          const x = g.cx + Math.cos(an) * d;
          const y = g.yP + Math.sin(an) * d * 0.9;
          grain(x, y, (g.cx - x) / 0.6, (g.yP - y) / 0.6, 0.55, 1, teinte(S.vu), { f: 0 });
        } else {
          const j = S.crans ? 4 - S.crans + ((al() * S.crans) | 0) : (al() * 4) | 0;
          grain(g.cx - 90 + S.tx.v + j * 45 + al() * 45, yS, (al() - 0.5) * 14, -18 - al() * 22 - (S.crans ? 70 + S.cv * 60 : 0), 1.1 + al() * 0.8, 1, teinte(S.vu), { f: 0.4, sc: 5 });
        }
      }
    } else if (S.phase === "vol" && S.lance && c) {
      const cadence = 1 / (16 + r * 5);
      while (S.semis > cadence) {
        S.semis -= cadence;
        grain(g.cx + c.x.v + (al() - 0.5) * 150, g.yC + c.y.v + 60 + al() * 60, (al() - 0.5) * 20, 20 + al() * 50, 0.5 + al() * 0.5, 1, teinte(rangCarte), { f: 1 });
      }
    } else if (S.phase === "dos" || S.phase === "tourne") {
      const cadence = 1 / (5 + r * 3);
      while (S.semis > cadence) {
        S.semis -= cadence;
        const an = al() * 6.283;
        grain(g.cx + Math.cos(an) * (demi.l + 8), g.yC + Math.sin(an) * (demi.h + 8), Math.cos(an) * 10, -14 - al() * 24, 1.2 + al(), 1, teinte(rangCarte), { f: 0.3, sc: 4 });
      }
    } else if (S.phase === "main") {
      const f = 0.35 + 0.65 * S.fete;
      const taux = a([0, 0, 1.5, 4, 9, 6, 12], r) * f;
      if (taux) {
        const cadence = 1 / taux;
        while (S.semis > cadence) {
          S.semis -= cadence;
          if (r === 4) grain(g.cx + (al() - 0.5) * (demi.l * 2 + 36), g.yC + demi.h - 12 + al() * 50, (al() - 0.5) * 24, -40 - al() * 60, 1.5 + al(), 1, teinte(4), { f: 0.3, sc: 4 });
          else if (r === 6) grain(al() * g.L, g.H * (0.35 + al() * 0.65), (al() - 0.5) * 10, -14 - al() * 26, 2.2 + al() * 1.6, 1, teinte(6), { f: 0, sc: 3, plus: al() < 0.2 });
          else {
            const an = al() * 6.283;
            grain(g.cx + Math.cos(an) * (demi.l + 18), g.yC + Math.sin(an) * (demi.h + 18), Math.cos(an) * 8, -12 - al() * 20, 1.4 + al(), 1, teinte(rangCarte), { f: 0.3, sc: 4 });
          }
        }
      } else S.semis = 0;
      if (r === 5) {
        S.pluie += dt * 24 * f;
        while (S.pluie > 1) {
          S.pluie -= 1;
          grain(al() * g.L, -6, (al() - 0.5) * 8, 34 + al() * 50, 3 + al() * 1.6, 1, teinte(5), { f: 0, sc: 3 + al() * 2, plus: al() < 0.14 });
        }
      }
    } else S.semis = 0;
  }
  let toileSale = false;
  function pasGrains(dt: number): void {
    const g = gP;
    if (!g) return;
    if (!P.length && S.aurore < 0.01) {
      if (toileSale) {
        g.clearRect(0, 0, geo.L, geo.H);
        toileSale = false;
      }
      return;
    }
    g.clearRect(0, 0, geo.L, geo.H);
    toileSale = true;
    if (S.aurore > 0.01) {
      // Le voile du divin : trois rubans lents en haut de la scène, puis les étoiles qui tournent autour de la carte.
      const bandes: Rvb[] = [
        [25, 211, 197],
        [255, 120, 214],
        [255, 214, 90],
      ];
      const fort = (estSombre ? 0.2 : 0.24) * S.aurore;
      bandes.forEach((cl, b) => {
        for (let x = 0; x < geo.L; x += CASE) {
          const y = geo.H * (0.13 + b * 0.05) + Math.sin(x * 0.006 + T * 0.38 + b * 2.1) * 26 + Math.sin(x * 0.017 - T * 0.25 + b) * 9;
          const h = 54 + Math.sin(x * 0.01 + T * 0.5 + b * 1.7) * 22;
          const pli = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.04 + T * 0.6 + b * 2.4 + Math.sin(x * 0.011 - T * 0.2) * 2.2), 2);
          const y0 = Math.round(y);
          for (let k = 0; k < 9; k++) {
            g.fillStyle = `rgba(${cl[0]},${cl[1]},${cl[2]},${(fort * pli * Math.pow(Math.sin((Math.PI * (k + 0.5)) / 9), 1.6)).toFixed(3)})`;
            g.fillRect(x, y0 + Math.round(((k - 4.5) * h) / 9), CASE, Math.ceil(h / 9));
          }
        }
      });
      for (let i = 0; i < 9; i++) {
        const an = T * 0.7 + (i * 6.283) / 9;
        const x = geo.cx + Math.cos(an) * (demi.l + 66);
        const y = geo.yC + Math.sin(an) * 48 - Math.cos(an) * 22;
        const derriere = Math.sin(an) < 0;
        if (derriere && Math.abs(x - geo.cx) < demi.l + 4 && Math.abs(y - geo.yC) < demi.h + 8) continue;
        const cl = teinte(6, (i * 0.37) % 1);
        const uu = derriere ? 2 : CASE;
        g.fillStyle = `rgba(${cl[0]},${cl[1]},${cl[2]},${((derriere ? 0.5 : 0.95) * S.aurore).toFixed(3)})`;
        g.fillRect(Math.round(x) - uu, Math.round(y), uu * 3, uu);
        g.fillRect(Math.round(x), Math.round(y) - uu, uu, uu * 3);
      }
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]!;
      if (p.type) {
        // Un éclat qui pèse : papier ou pépite.
        if (!p.repos) {
          p.vy += GRAV * p.g * dt;
          if (p.g < 0) {
            p.vx *= 1 - 1.5 * dt;
            p.vy *= 1 - 1.5 * dt;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.a += p.va * dt;
          if (p.y >= p.sol && p.vy > 0) {
            p.y = p.sol;
            if (p.vy > 210) {
              p.vy *= -(p.type === "eclat" ? 0.45 : 0.28);
              p.vx *= 0.6;
              p.va *= 0.5;
            } else {
              p.repos = true;
              p.vy = p.vx = 0;
              p.a = Math.round(p.a / Math.PI) * Math.PI;
            }
          }
          if (p.x < -30 || p.x > geo.L + 30 || p.y < -60 || p.y > geo.H + 30) {
            P.splice(i, 1);
            continue;
          }
        }
        g.fillStyle = p.c;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (p.type === "eclat") {
          g.fillRect(x - 4, y - 8, 9, 9);
          g.fillStyle = "#fffbe6";
          g.fillRect(x - 4, y - 8, 3, 3);
          g.fillStyle = "#9c6a0c";
          g.fillRect(x + 2, y - 2, 3, 3);
        } else {
          const w = Math.max(CASE, Math.round(p.w * CASE * Math.abs(Math.cos(p.a))));
          g.fillRect(x - (w >> 1), y - p.h * CASE, w, p.h * CASE);
        }
        continue;
      }
      p.vie += dt;
      if (p.vie >= p.duree) {
        P.splice(i, 1);
        continue;
      }
      const fr = Math.exp(-dt * p.f);
      p.vx *= fr;
      p.vy = p.vy * fr + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const uu = p.vie / p.duree;
      let al = Math.min(1, uu * 8) * (1 - uu * uu);
      if (p.sc) al *= 0.62 + 0.38 * Math.sin(p.vie * p.sc + p.ph);
      g.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${al.toFixed(3)})`;
      const t = p.t * CASE;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (p.plus) {
        g.fillRect(x - t, y, t * 3, t);
        g.fillRect(x, y - t, t, t * 3);
      } else g.fillRect(x, y, t, t);
    }
  }
  /** L'image fixe : tout va droit à sa place, sans grains (mouvement coupé). */
  function rendreFixe(): void {
    fige = true;
    pasScene(0);
    P.length = 0;
    pasGrains(0);
    fige = false;
  }

  /* ---------- La boucle : une seule, arrêtée quand la scène n'est pas à l'écran ou que le mouvement est coupé ---------- */
  const doitTourner = (): boolean => !detruit && visible && !pause && !calme();
  function boucle(t: number): void {
    raf = 0;
    const dt = Math.min(0.05, (t - avant) / 1000);
    avant = t;
    T += dt;
    try {
      pasScene(dt);
      pasGrains(S.gel > 0 ? 0 : dt);
    } catch {
      // Un dessin qui échoue arrête la scène, jamais la fenêtre : la carte est montrée, posée au milieu.
      if (vraie) {
        vraie.el.classList.add("bst-vu");
        vraie.el.inert = false;
        vraie.el.setAttribute("data-active", "");
        vraie.el.style.transform = `translate3d(0,${geo.yC}px,0) scale(${vraie.k.toFixed(3)})`;
        vraie.corps.style.transform = "";
      }
      if (!revelee) annoncer();
      return;
    }
    if (doitTourner()) raf = requestAnimationFrame(boucle);
  }
  function relancer(): void {
    if (!raf && doitTourner()) {
      avant = performance.now();
      raf = requestAnimationFrame(boucle);
    }
  }

  /* ---------- Les gestes ---------- */
  elPaquet.setAttribute("aria-label", `${o.nomDuPaquet} scellé : tenir, tirer ou taper pour l'ouvrir`);
  elPaquet.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    try {
      elPaquet.setPointerCapture(e.pointerId);
    } catch {
      // Sans capture, le paquet se lâche quand le pointeur sort.
    }
    saisir(e.clientX, e.clientY);
  });
  elPaquet.addEventListener("pointermove", (e) => {
    if (!S.tenu) return;
    S.tirX = e.clientX - S.appuiX;
    S.tirY = e.clientY - S.appuiY;
    S.traine = Math.max(S.traine, Math.hypot(S.tirX, S.tirY));
  });
  elPaquet.addEventListener("pointerup", relacher);
  elPaquet.addEventListener("pointercancel", relacher);
  elPaquet.addEventListener("lostpointercapture", relacher);
  // Un appui long ne doit pas ouvrir le menu du navigateur ; avec Maj, le menu natif reste là.
  elPaquet.addEventListener("contextmenu", (e) => {
    if (!e.shiftKey) e.preventDefault();
  });
  elPaquet.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      const r = elPaquet.getBoundingClientRect();
      saisir(r.left + r.width / 2, r.top + r.height / 2);
    }
  });
  elPaquet.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      relacher();
    }
  });
  elPaquet.addEventListener("blur", relacher);
  // Un second appui pendant que la carte vole ou se retourne : droit à la carte révélée.
  const surAppui = (e: PointerEvent): void => {
    if (e.button > 0 || pause || !enCours()) return;
    e.preventDefault();
    e.stopPropagation();
    passer();
  };
  const surTouche = (e: KeyboardEvent): void => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat && !pause && enCours()) {
      e.preventDefault();
      e.stopPropagation();
      passer();
    }
  };
  scene.addEventListener("pointerdown", surAppui, true);
  scene.addEventListener("keydown", surTouche, true);
  scene.addEventListener("pointermove", (e) => {
    const r = scene.getBoundingClientRect();
    const dx = e.clientX - r.left - geo.cx;
    const dy = e.clientY - r.top - geo.yC;
    S.survol = e.pointerType === "mouse" && Math.abs(dx) < demi.l + 48 && Math.abs(dy) < demi.h + 53;
    S.hx = borne(dx / (demi.l + 8), -1, 1);
    S.hy = borne(dy / (demi.h + 8), -1, 1);
  });
  scene.addEventListener("pointerleave", () => {
    S.survol = false;
  });

  /* ---------- Le départ ---------- */
  // La vraie carte est posée tout de suite, cachée : sa taille règle celle de la scène. Elle change quand ses effets
  // arrivent, ou quand l'écran change : on remesure.
  if (vraie) {
    vraie.el.className = "bst-vraie";
    vraie.corps.classList.add("bst-vraie-corps");
    vraie.el.append(vraie.corps);
    scene.insertBefore(vraie.el, elPaquet);
    if (typeof ResizeObserver === "function") {
      let avant = "";
      tailleDeLaVraie = new ResizeObserver(() => {
        const t = `${vraie.corps.offsetWidth}x${vraie.corps.offsetHeight}`;
        if (t === avant || detruit) return;
        avant = t;
        mesurer();
        if (!doitTourner()) rendreFixe();
      });
      tailleDeLaVraie.observe(vraie.corps);
    }
  }
  const lireTheme = (): void => {
    estSombre = document.documentElement.dataset.mode === "sombre";
  };
  lireTheme();
  const morceaux = morceauxDuPaquet(o.paquet);
  peindre(elCorps, morceaux.corps);
  peindre(elFiss, fissures(0));
  let parent: HTMLElement = elBande;
  for (let j = 0; j < 4; j++) {
    const sp = document.createElement("span");
    const c = document.createElement("canvas");
    sp.className = "bst-seg";
    peindre(c, morceaux.bande[j]!);
    sp.append(c);
    parent.append(sp);
    parent = sp;
    segs.push(sp);
    jours[j]!.style.left = `${j * 45}px`;
  }
  elR1.style.background = rayonsEnCss("var(--lum)", 7);
  elR2.style.background = rayonsEnCss("var(--lum2)", 19);
  for (const [cle, f] of Object.entries(GRAINS)) scene.style.setProperty(`--grains-${cle[0]}`, enUrl(f()));
  scene.style.setProperty("--lum", LUMIERE_NEUTRE.join(","));
  mesurer();
  phase("arrive");
  consigne(motDuPaquet());
  if (calme()) {
    phase("pret");
    rendreFixe();
  }
  // Le paquet prend le focus après la fenêtre (qui le donne d'abord à son titre) : Espace ou Entrée l'ouvrent aussitôt.
  requestAnimationFrame(() => {
    if (!detruit && S.phase !== "main" && scene.isConnected) elPaquet.focus({ preventScroll: true });
  });

  // Le thème change : le ciel, les mots et les couleurs suivent. La pause du jeu (`fx-off`) ou « réduire les animations » :
  // la scène montre la carte, sans mouvement.
  const reagir = (): void => {
    if (detruit) return;
    const avantSombre = estSombre;
    lireTheme();
    if (avantSombre !== estSombre) {
      peindreFond();
      consigneVue = "";
      if (elCons.classList.contains("bst-vu")) consigne(motDuPaquet());
      if (S.phase === "main") montrerTrouve(true);
    }
    if (calme()) {
      son.nappeFin();
      S.tenu = false;
      if (S.phase === "vol" || S.phase === "dos" || S.phase === "tourne") passer();
      else {
        if (S.phase === "arrive") phase("pret");
        if (S.phase === "pret" && !S.crans) consigne(motDuPaquet());
        rendreFixe();
      }
    } else {
      if (S.phase === "pret" && !S.crans) consigne(motDuPaquet());
      relancer();
    }
  };
  const veilleur = new MutationObserver(reagir);
  veilleur.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-mode"] });
  const reduit = matchMedia("(prefers-reduced-motion: reduce)");
  const surReduit = (): void => reagir();
  reduit.addEventListener("change", surReduit);
  const vue = new IntersectionObserver((es) => {
    for (const e of es) visible = e.isIntersecting;
    relancer();
  });
  vue.observe(scene);
  const taille = new ResizeObserver(() => {
    if (scene.clientWidth === geo.L && scene.clientHeight === geo.H) return;
    mesurer();
    if (!doitTourner()) rendreFixe();
  });
  taille.observe(scene);
  relancer();

  return {
    passer,
    mettreEnPause: (oui) => {
      pause = oui;
      scene.classList.toggle("bst-fige", oui);
      if (oui) {
        son.nappeFin();
        S.tenu = false;
        S.prise = null;
        cancelAnimationFrame(raf);
        raf = 0;
      } else relancer();
    },
    arreter: () => {
      detruit = true;
      cancelAnimationFrame(raf);
      raf = 0;
      son.nappeFin();
      veilleur.disconnect();
      vue.disconnect();
      taille.disconnect();
      tailleDeLaVraie?.disconnect();
      reduit.removeEventListener("change", surReduit);
      scene.removeEventListener("pointerdown", surAppui, true);
      scene.removeEventListener("keydown", surTouche, true);
    },
  };
}
