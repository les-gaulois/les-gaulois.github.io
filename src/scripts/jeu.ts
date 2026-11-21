/**
 * Le cadre de jeu de « Mon Gaulois » (/village, 21 novembre 2026) : les boutons du son et de la musique de la barre du jeu
 * (BarreDuJeu.astro), le petit bruit des boutons, leur rebond, et le fond de l'écran : la bannière du joueur, qui respire et
 * suit la souris, ou, sans bannière, des collines vivantes dessinées en cases (maquette validée par le pilote, planche de
 * Claude Fable 5.2). Il ne change aucun texte ni aucun chiffre.
 *
 * La page dit la bannière du joueur par l'annonce `jeu:banniere` (`detail.url`, ou `null` sans bannière) : VillageApp.tsx
 * l'envoie une fois le compte lu. Le bouton pause du site (`fx-off`), « réduire les animations » et un onglet caché arrêtent
 * tout mouvement ; les collines restent dessinées, immobiles.
 */
import { MUSIQUE_CHANGE, SON_CHANGE, basculerLaMusique, basculerLeSon, jouer, musiqueEnMarche, musiqueVoulue, preparerLeSon, sonVoulu } from "../lib/jeu/sons";

const racine = document.documentElement;
const calme = matchMedia("(prefers-reduced-motion: reduce)");
const fige = (): boolean => racine.classList.contains("fx-off") || calme.matches || document.hidden;

// ---------- Le son et la musique ----------

const boutonSon = document.querySelector<HTMLButtonElement>("[data-jeu-son]");
const boutonMusique = document.querySelector<HTMLButtonElement>("[data-jeu-musique]");

function majSon(): void {
  if (!boutonSon) return;
  const on = sonVoulu();
  boutonSon.hidden = false;
  boutonSon.setAttribute("aria-pressed", String(on));
  boutonSon.title = on ? "Couper le son" : "Remettre le son";
}
function majMusique(): void {
  if (!boutonMusique) return;
  const on = musiqueEnMarche();
  boutonMusique.hidden = false;
  boutonMusique.setAttribute("aria-pressed", String(on));
  boutonMusique.title = on ? "Couper la musique" : "Mettre la musique";
}
majSon();
majMusique();
boutonSon?.addEventListener("click", () => {
  basculerLeSon();
  jouer("clic");
});
boutonMusique?.addEventListener("click", () => {
  basculerLaMusique();
});
window.addEventListener(SON_CHANGE, majSon);
window.addEventListener(MUSIQUE_CHANGE, majMusique);

// Chaque geste du visiteur crée ou réveille le contexte audio (les navigateurs n'en jouent aucun avant), et le premier geste
// fait déjà son bruit. La musique, coupée au départ, ne revient au premier geste que si le visiteur l'avait allumée.
let premierGeste = true;
function geste(cible: Element | null): void {
  if (sonVoulu() || musiqueVoulue()) preparerLeSon();
  if (premierGeste) {
    premierGeste = false;
    if (musiqueVoulue() && !cible?.closest("[data-jeu-musique]")) basculerLaMusique(true);
  }
}
// Le petit bruit des boutons du jeu et des onglets du menu, à la souris, au doigt ou au clavier.
const bruitDe = (cible: Element | null): void => {
  const bouton = cible?.closest(".jeu-btn, .jeu-onglet");
  if (bouton && !bouton.matches("[data-jeu-son]")) jouer("clic");
};
document.addEventListener(
  "pointerdown",
  (ev) => {
    geste(ev.target as Element | null);
    bruitDe(ev.target as Element | null);
  },
  { capture: true },
);
document.addEventListener(
  "keydown",
  (ev) => {
    geste(ev.target as Element | null);
    if (ev.key === "Enter" || ev.key === " ") bruitDe(ev.target as Element | null);
  },
  { capture: true },
);

// Le rebond d'un bouton relâché.
document.addEventListener("pointerup", (ev) => {
  const b = (ev.target as Element | null)?.closest<HTMLElement>(".jeu-btn");
  if (!b || fige()) return;
  b.classList.remove("jeu-rebond");
  void b.offsetWidth;
  b.classList.add("jeu-rebond");
});
document.addEventListener("animationend", (ev) => {
  if (ev.animationName === "jeu-rebond") (ev.target as Element).classList.remove("jeu-rebond");
});

// ---------- Le fond ----------

const fond = document.querySelector<HTMLElement>("[data-jeu-fond]");
const toile = fond?.querySelector<HTMLCanvasElement>(".jeu-fond-vivant") ?? null;

// La bannière du joueur, dite par la page.
window.addEventListener("jeu:banniere", (ev) => {
  if (!fond) return;
  const url = (ev as CustomEvent<{ url: string | null }>).detail?.url ?? null;
  if (url) fond.style.setProperty("--jeu-banniere", `url("${url}")`);
  else fond.style.removeProperty("--jeu-banniere");
  fond.dataset["banniere"] = url ? "oui" : "non";
  if (!url) dessinerLesCollines(0);
});

// Elle suit doucement la souris.
let mx = 0;
let vx = 0;
document.addEventListener("pointermove", (ev) => {
  if (fige() || ev.pointerType === "touch") return;
  mx = (ev.clientX / Math.max(1, innerWidth)) * 2 - 1;
  const my = (ev.clientY / Math.max(1, innerHeight)) * 2 - 1;
  fond?.style.setProperty("--jeu-mx", mx.toFixed(3));
  fond?.style.setProperty("--jeu-my", my.toFixed(3));
});

// Les collines : une lueur et ses rayons, deux lignes de collines (sapins sur la plus lointaine), neige le jour, lucioles et
// étoiles la nuit. Une case de la toile vaut quatre pixels ; dix images par seconde suffisent.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const COULEURS = {
  clair: { a: "#f8fafe", b: "#dde6f8", lueur: "#ffffff", loin: "#c5d3f0", pres: "#eef3fc", crete: "#ffffff", sapin: "#9db2e0", g1: "#8fa8de", g2: "#e0263a", g3: "#2f6bff" },
  sombre: { a: "#070c24", b: "#111c50", lueur: "#24389e", loin: "#16236a", pres: "#0a1238", crete: "#1f3187", sapin: "#0d1746", g1: "#f6f1e3", g2: "#ff5a6a", g3: "#6aa5ff" },
} as const;
const octets = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
interface Grain {
  x: number;
  y: number;
  v: number;
  ph: number;
  k: number;
}
let grains: Grain[] = [];
let temps = 0;
let image: ImageData | null = null;

function dessinerLesCollines(dt: number): void {
  if (!toile || fond?.dataset["banniere"] === "oui") return;
  const W = Math.max(40, Math.ceil(innerWidth / 4));
  const H = Math.max(40, Math.ceil(innerHeight / 4));
  if (toile.width !== W || toile.height !== H) {
    toile.width = W;
    toile.height = H;
    image = null;
  }
  const g = toile.getContext("2d");
  if (!g) return;
  if (!image) {
    image = g.createImageData(W, H);
    grains = Array.from({ length: Math.round((W * H) / 1100) }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, v: 1.5 + Math.random() * 3.5, ph: Math.random() * 6.28, k: i % 9 }));
  }
  const sombre = racine.dataset["mode"] === "sombre";
  const c = COULEURS[sombre ? "sombre" : "clair"];
  const ca = octets(c.a);
  const cb = octets(c.b);
  const cl = octets(c.lueur);
  temps += dt;
  vx += (mx - vx) * Math.min(1, dt * 3);
  const d = image.data;
  const cx = W * 0.5;
  const cy = H * 0.42;
  const rayon = Math.max(W, H) * 0.5;
  const tour = temps * 0.025;
  for (let y = 0, i = 0; y < H; y++) {
    const pente = (y / H) * 17 - 1;
    for (let x = 0; x < W; x++, i += 4) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const b = BAYER[(y & 3) * 4 + (x & 3)]!;
      let L = Math.max(0, 1 - dist / rayon);
      L = L * L * 12;
      if (Math.sin((Math.atan2(dy, dx) + tour) * 9) > 0.3) L += 2.6 * Math.max(0, 1 - dist / (rayon * 1.7));
      const k = b < L ? cl : b < pente ? cb : ca;
      d[i] = k[0];
      d[i + 1] = k[1];
      d[i + 2] = k[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  if (sombre)
    for (const p of grains)
      if (p.k > 5) {
        g.fillStyle = Math.sin(temps * 0.6 + p.ph) > 0 ? c.g1 : c.g3;
        g.fillRect(Math.round(p.x), Math.round(p.ph * H * 0.11), 1, 1);
      }
  const o1 = temps * 0.7 + vx * 3;
  const o2 = temps * 1.8 + vx * 8;
  for (let x = 0; x < W; x++) {
    const u = x + Math.round(o1);
    const h1 = Math.round(H * 0.8 - Math.sin(u * 0.045) * 6 - Math.sin(u * 0.11 + 1) * 3);
    g.fillStyle = c.loin;
    g.fillRect(x, h1, 1, H - h1);
    const s = ((u % 13) + 13) % 13;
    const grand = (((Math.floor(u / 13) * 7) % 5) + 5) % 5 > 1;
    if (grand && s < 7) {
      const m = 3 - Math.abs(3 - s);
      g.fillStyle = c.sapin;
      g.fillRect(x, h1 - 1 - m * 2, 1, m * 2 + 2);
    }
  }
  for (let x = 0; x < W; x++) {
    const u = x + Math.round(o2);
    const h2 = Math.round(H * 0.91 - Math.sin(u * 0.03 + 2) * 7 - Math.sin(u * 0.09) * 2);
    g.fillStyle = c.pres;
    g.fillRect(x, h2, 1, H - h2);
    g.fillStyle = c.crete;
    g.fillRect(x, h2, 1, 1);
  }
  for (const p of grains) {
    if (p.k > 5 && sombre) continue;
    const pres = p.k < 2;
    p.y += (sombre ? -0.45 : 1) * p.v * (pres ? 1.6 : 1) * dt;
    if (p.y < -2) p.y = H + 1;
    if (p.y > H + 2) p.y = -1;
    const x = Math.round(p.x + Math.sin(temps * 0.5 + p.ph) * 3 - vx * (pres ? 6 : 2));
    const y = Math.round(p.y);
    g.fillStyle = sombre ? (p.k === 0 ? c.g2 : p.k === 2 ? c.g3 : "#ffd84a") : p.k === 0 ? c.g2 : p.k === 1 ? c.g3 : c.g1;
    g.fillRect(x, y, 1, 1);
    if (pres && Math.sin(temps * 0.7 + p.ph) > -0.3) {
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
    }
  }
}

if (toile) {
  dessinerLesCollines(0);
  let avant = performance.now();
  let cumul = 0;
  const boucle = (t: number): void => {
    const dt = Math.min(0.1, (t - avant) / 1000);
    avant = t;
    cumul += dt;
    if (cumul >= 0.1) {
      if (!fige()) dessinerLesCollines(cumul);
      cumul = 0;
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  addEventListener("resize", () => dessinerLesCollines(0));
  // Le thème change : les collines changent de couleurs, même immobiles.
  new MutationObserver(() => dessinerLesCollines(0)).observe(racine, { attributes: true, attributeFilter: ["data-mode"] });
}
