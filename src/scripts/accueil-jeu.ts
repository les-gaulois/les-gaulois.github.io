/**
 * Le jeu des Gaulois sur l'accueil (22 novembre 2026) : les paysages animés du jeu derrière « Ouvre ton premier booster » et
 * « Du commun au divin », et le défilement de « Du commun au divin ». Décoratif : rien n'y change une valeur. Les paysages
 * sont ceux de « Mon Gaulois » (`public/paysages/`, contrat dans src/lib/jeu/fonds-du-jeu.ts), chargés seulement quand leur
 * bande approche, dessinés trente fois par seconde au plus, et figés par la pause de l'en-tête (`fx-off`), par « réduire
 * les animations », hors de l'écran et dans un onglet caché.
 */
import { bourseDExemple } from "../lib/accueil-jeu";
import { fmtInt } from "../lib/format";
import { VERSION_DES_FONDS, estUnFond, toileDuFond, type FondDuJeu } from "../lib/jeu/fonds-du-jeu";

declare global {
  interface Window {
    FONDS?: unknown[];
  }
}

const racine = document.documentElement;
const calme = matchMedia("(prefers-reduced-motion: reduce)");
const fige = (): boolean => racine.classList.contains("fx-off") || calme.matches || document.hidden;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const sombre = (): boolean => racine.dataset["mode"] === "sombre";

// ---------- Les paysages ----------

const charges = new Map<string, Promise<FondDuJeu>>();
function chargerLeFond(id: string): Promise<FondDuJeu> {
  const deja = charges.get(id);
  if (deja) return deja;
  const trouver = (): FondDuJeu | undefined => (window.FONDS ?? []).find((f): f is FondDuJeu => estUnFond(f) && f.id === id);
  const promesse = new Promise<FondDuJeu>((ok, ko) => {
    const present = trouver();
    if (present) return ok(present);
    const script = document.createElement("script");
    script.src = `${BASE}/paysages/${id}.js?v=${VERSION_DES_FONDS}`;
    script.async = true;
    script.onload = () => {
      const f = trouver();
      if (f) ok(f);
      else ko(new Error(`le paysage ${id} ne s'est pas déclaré`));
    };
    script.onerror = () => ko(new Error(`le paysage ${id} n'a pas pu être chargé`));
    document.head.append(script);
  });
  charges.set(id, promesse);
  promesse.catch(() => charges.delete(id));
  return promesse;
}

interface Scene {
  toile: HTMLCanvasElement;
  hote: HTMLElement;
  ctx: CanvasRenderingContext2D;
  fond: FondDuJeu | null;
  monte: string | null;
  visible: boolean;
  casse: boolean;
}

let temps = 0;
let souris = { x: 0, y: 0 };
let vise = { x: 0, y: 0 };
document.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  vise = { x: (e.clientX / Math.max(1, innerWidth)) * 2 - 1, y: (e.clientY / Math.max(1, innerHeight)) * 2 - 1 };
});

function monter(s: Scene): boolean {
  if (!s.fond || s.casse) return false;
  const l = s.hote.clientWidth;
  const h = s.hote.clientHeight;
  if (l < 2 || h < 2) return false;
  const cle = `${l}x${h}|${sombre()}`;
  if (s.monte === cle) return true;
  const { largeur, hauteur, echelle } = toileDuFond(l, h);
  s.toile.width = largeur;
  s.toile.height = hauteur;
  s.toile.style.width = `${largeur * echelle}px`;
  s.toile.style.height = `${hauteur * echelle}px`;
  s.ctx.imageSmoothingEnabled = false;
  try {
    s.fond.monter({ largeur, hauteur, sombre: sombre(), echelle });
    s.fond.dessiner(s.ctx, temps, souris);
  } catch (e) {
    s.casse = true;
    console.error(e);
    return false;
  }
  s.monte = cle;
  return true;
}

const scenes: Scene[] = [];
for (const toile of document.querySelectorAll<HTMLCanvasElement>("canvas[data-accueil-paysage]")) {
  const ctx = toile.getContext("2d");
  const hote = toile.parentElement;
  if (!ctx || !hote) continue;
  scenes.push({ toile, hote, ctx, fond: null, monte: null, visible: false, casse: false });
}

if (scenes.length > 0) {
  const approche = new IntersectionObserver(
    (entrees) => {
      for (const e of entrees) {
        const s = scenes.find((x) => x.hote === e.target);
        if (!s) continue;
        s.visible = e.isIntersecting;
        if (s.visible && !s.fond) {
          void chargerLeFond(s.toile.dataset["accueilPaysage"] ?? "")
            .then((f) => {
              s.fond = f;
              monter(s);
            })
            .catch((err: unknown) => console.error(err));
        }
      }
    },
    { rootMargin: "300px 0px" },
  );
  for (const s of scenes) approche.observe(s.hote);
  // Une autre taille ou un autre thème : le paysage refait ses calques, même immobile.
  // `monter` ne refait les calques que si la taille ou le thème ont changé : la page qui s'allonge ne coûte rien.
  const remonter = () => {
    for (const s of scenes) if (s.visible) monter(s);
  };
  new ResizeObserver(remonter).observe(document.body);
  new MutationObserver(remonter).observe(racine, { attributes: true, attributeFilter: ["data-mode"] });

  let avant = performance.now();
  let dernier = 0;
  const boucle = (t: number): void => {
    const dt = Math.min(100, t - avant);
    avant = t;
    if (!fige()) {
      temps += dt;
      const k = Math.min(1, dt * 0.0036);
      souris = { x: souris.x + (vise.x - souris.x) * k, y: souris.y + (vise.y - souris.y) * k };
      if (t - dernier >= 32) {
        dernier = t;
        for (const s of scenes) {
          if (!s.visible || !monter(s)) continue;
          try {
            s.fond?.dessiner(s.ctx, temps, souris);
          } catch (e) {
            s.casse = true;
            console.error(e);
          }
        }
      }
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}

// ---------- « Du commun au divin » : quatre étapes au fil du défilement ----------

const piste = document.querySelector<HTMLElement>("[data-parcours]");
const scene = piste?.querySelector<HTMLElement>(".accueil-parcours-scene") ?? null;
if (piste && scene) {
  // Sans ce script, les quatre étapes se lisent à la suite ; avec lui, la scène reste en place et suit le défilement.
  piste.classList.add("accueil-parcours-vivant");
  const etapes = [...piste.querySelectorAll<HTMLElement>(".accueil-parcours-etape")];
  const plein = piste.querySelector<HTMLElement>("[data-parcours-plein]");
  const stateres = piste.querySelector<HTMLElement>("[data-parcours-stateres]");
  const points = piste.querySelector<HTMLElement>("[data-parcours-points]");
  const motDesPoints = piste.querySelector<HTMLElement>("[data-parcours-mot]");
  const boutons = [...piste.querySelectorAll<HTMLButtonElement>("[data-aller]")];
  const sprites = [...piste.querySelectorAll<HTMLElement>(".accueil-echelle-sprite")];
  const noms = [...piste.querySelectorAll<HTMLElement>(".accueil-echelle-nom")];
  const marches = [...piste.querySelectorAll<HTMLElement>(".accueil-echelle li")];
  let etapeVue = -1;
  let marcheVue = -1;
  let pointsVus = -1;

  const part = (): number => {
    const r = piste.getBoundingClientRect();
    const course = Math.max(1, r.height - scene.clientHeight);
    return Math.min(1, Math.max(0, -r.top / course));
  };
  const suivre = (): void => {
    const p = part();
    const etape = Math.min(3, Math.floor(p * 4));
    const local = p * 4 - etape;
    plein?.style.setProperty("--part", p.toFixed(3));
    if (etape !== etapeVue) {
      etapeVue = etape;
      scene.dataset["etape"] = String(etape);
      etapes.forEach((li, i) => li.classList.toggle("actif", i === etape));
      boutons.forEach((b, i) => (i === etape ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    }
    if (etape === 1 && stateres && points) {
      const b = bourseDExemple(local * 1.3);
      if (b.points !== pointsVus) {
        pointsVus = b.points;
        stateres.textContent = fmtInt(b.stateres);
        points.textContent = fmtInt(b.points);
        if (motDesPoints) motDesPoints.textContent = b.points > 1 ? "points" : "point";
      }
    }
    if (etape === 2 && sprites.length > 0) {
      const marche = Math.min(sprites.length - 1, Math.floor(local * sprites.length));
      if (marche !== marcheVue) {
        marcheVue = marche;
        sprites.forEach((s, i) => {
          const oui = i === marche;
          s.classList.toggle("actif", oui);
          if (oui && !calme.matches) {
            s.classList.remove("saut");
            void s.offsetWidth;
            s.classList.add("saut");
          }
        });
        noms.forEach((n, i) => n.classList.toggle("actif", i === marche));
        marches.forEach((m) => m.classList.toggle("actif", m.dataset["marche"] === String(marche)));
      }
    }
  };
  let prevu = false;
  addEventListener(
    "scroll",
    () => {
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(() => {
        prevu = false;
        suivre();
      });
    },
    { passive: true },
  );
  addEventListener("resize", suivre);
  // Un clic sur une étape y mène : le haut de la piste, plus la part de cette étape.
  for (const bouton of boutons) {
    bouton.addEventListener("click", () => {
      const k = Number(bouton.dataset["aller"]);
      const r = piste.getBoundingClientRect();
      const course = r.height - scene.clientHeight;
      scrollTo({ top: scrollY + r.top + course * (k / 4 + 0.08), behavior: fige() ? "auto" : "smooth" });
    });
  }
  suivre();
}
