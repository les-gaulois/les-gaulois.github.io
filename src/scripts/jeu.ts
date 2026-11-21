/**
 * Le cadre de jeu de « Mon Gaulois » (/village, 21 novembre 2026) : les boutons du son et de la musique de la barre du jeu
 * (BarreDuJeu.astro), le petit bruit des boutons, leur rebond, et le fond de l'écran : huit paysages animés en cases, de
 * jour en thème clair et de nuit en thème sombre, qui tournent toutes les 15 minutes (choix du pilote du 21 novembre 2026 ;
 * dessins de Claude Fable 5.2 dans `public/paysages/`, calculs dans `src/lib/jeu/fonds-du-jeu.ts`). Ils ont remplacé la
 * bannière du joueur et les collines pâles derrière l'écran ; la bannière reste sur sa carte. Il ne change aucun texte ni
 * aucun chiffre.
 *
 * Le bouton pause du site (`fx-off`), « réduire les animations » et un onglet caché arrêtent tout mouvement : le paysage
 * reste dessiné, immobile, et le suivant arrive sans fondu.
 */
import { type FondDuJeu, type IdDeFond, VERSION_DES_FONDS, estUnFond, fondDuMoment, toileDuFond } from "../lib/jeu/fonds-du-jeu";
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


// ---------- Le fond : huit paysages qui tournent toutes les 15 minutes ----------

declare global {
  interface Window {
    FONDS?: unknown[];
  }
}

const fond = document.querySelector<HTMLElement>("[data-jeu-fond]");
const premiereToile = fond?.querySelector<HTMLCanvasElement>(".jeu-fond-vivant") ?? null;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// La souris décale doucement les plans des paysages (jamais au doigt).
let mx = 0;
let my = 0;
let vx = 0;
let vy = 0;
document.addEventListener("pointermove", (ev) => {
  if (fige() || ev.pointerType === "touch") return;
  mx = (ev.clientX / Math.max(1, innerWidth)) * 2 - 1;
  my = (ev.clientY / Math.max(1, innerHeight)) * 2 - 1;
});

// Chaque paysage n'est chargé qu'à son tour, une seule fois ; un échec se retente au tour suivant.
const charges = new Map<IdDeFond, Promise<FondDuJeu>>();
function chargerLeFond(id: IdDeFond): Promise<FondDuJeu> {
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
      else ko(new Error(`le fond ${id} ne s'est pas déclaré`));
    };
    script.onerror = () => ko(new Error(`le fond ${id} n'a pas pu être chargé`));
    document.head.append(script);
  });
  charges.set(id, promesse);
  promesse.catch(() => charges.delete(id));
  return promesse;
}

interface Scene {
  id: IdDeFond;
  fond: FondDuJeu;
  toile: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  casse: boolean;
}
let actuelle: Scene | null = null;
let sortante: Scene | null = null;
// Le temps des animations ne court que quand rien n'est figé : une pause reprend où elle s'était arrêtée.
let tempsAnime = 0;

function dessiner(s: Scene): void {
  if (s.casse) return;
  try {
    s.fond.dessiner(s.ctx, tempsAnime, { x: vx, y: vy });
  } catch (e) {
    s.casse = true;
    console.error(e);
  }
}

// La taille de la dernière toile montée. Au défilement d'un téléphone, la barre d'adresse qui rentre ou sort ne change que
// la hauteur, d'un dixième environ : une hauteur un peu plus petite garde la toile (le surplus est coupé), et seule une plus
// grande, ou bien plus petite, la refait. Sans cela, le paysage se recomposerait à chaque changement de sens du défilement.
let posee: { l: number; h: number } | null = null;
function tailleVoulue(): { l: number; h: number } {
  const l = fond?.clientWidth || innerWidth;
  const h = fond?.clientHeight || innerHeight;
  if (posee && posee.l === l && h <= posee.h && h >= posee.h * 0.8) return posee;
  return { l, h };
}

// La toile en cases, à la taille du fond (barre de défilement exclue) ; chaque case fait exactement `echelle` pixels, ce qui
// dépasse est coupé par le fond. Le paysage refait ses calques (thème, taille) puis peint une image.
function monter(s: Scene): void {
  posee = tailleVoulue();
  const { largeur, hauteur, echelle } = toileDuFond(posee.l, posee.h);
  s.toile.width = largeur;
  s.toile.height = hauteur;
  s.toile.style.width = `${largeur * echelle}px`;
  s.toile.style.height = `${hauteur * echelle}px`;
  s.ctx.imageSmoothingEnabled = false;
  try {
    s.fond.monter({ largeur, hauteur, sombre: racine.dataset["mode"] === "sombre", echelle });
    s.casse = false;
  } catch (e) {
    s.casse = true;
    console.error(e);
    return;
  }
  dessiner(s);
}

// Un changement de fond refait tous les calques (jusqu'à un dixième de seconde) : attendre que le navigateur souffle, pour
// ne pas accrocher un geste en cours, comme le glisser d'une carte au vestiaire.
const souffle = (): Promise<void> =>
  new Promise((ok) => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => ok(), { timeout: 2000 });
    else setTimeout(ok, 0);
  });

// Le fond voulu par l'horloge, et seulement lui : un chargement lent dépassé par le quart d'heure suivant ne s'affiche pas.
const toujoursVoulu = (id: IdDeFond): boolean => actuelle?.id !== id && fondDuMoment(Date.now()).id === id;
let enCours: IdDeFond | null = null;

async function passerAuFond(id: IdDeFond): Promise<void> {
  if (!fond || !premiereToile || enCours === id || !toujoursVoulu(id)) return;
  enCours = id;
  try {
    let f: FondDuJeu;
    try {
      f = await chargerLeFond(id);
    } catch (e) {
      console.error(e);
      return;
    }
    if (actuelle) await souffle();
    if (!toujoursVoulu(id)) return;
    // Le premier fond prend la toile de la page ; les suivants arrivent dans une toile neuve, en fondu, par-dessus l'ancien.
    const toile = actuelle ? (premiereToile.cloneNode(false) as HTMLCanvasElement) : premiereToile;
    const ctx = toile.getContext("2d");
    if (!ctx) return;
    const nouvelle: Scene = { id, fond: f, toile, ctx, casse: false };
    const ancienne = actuelle;
    if (ancienne) {
      sortante?.toile.remove();
      sortante = null;
      toile.style.opacity = "0";
      fond.append(toile);
    }
    monter(nouvelle);
    actuelle = nouvelle;
    if (!ancienne) return;
    if (fige()) {
      ancienne.toile.remove();
      toile.style.opacity = "";
      return;
    }
    sortante = ancienne;
    // Lire une mesure fixe l'opacité 0 avant de passer à 1 : sans elle, le navigateur saute le fondu.
    void toile.offsetWidth;
    toile.style.opacity = "1";
    setTimeout(() => {
      if (sortante === ancienne) {
        ancienne.toile.remove();
        sortante = null;
      }
    }, 3500);
  } finally {
    if (enCours === id) enCours = null;
  }
}

// Le tour suivant arrive au quart d'heure ; un onglet revenu au premier plan rattrape le tour qu'il a manqué.
function planifier(): void {
  const { finMs } = fondDuMoment(Date.now());
  setTimeout(
    () => {
      void passerAuFond(fondDuMoment(Date.now()).id);
      planifier();
    },
    Math.max(1000, finMs - Date.now() + 50),
  );
}

if (fond && premiereToile) {
  void passerAuFond(fondDuMoment(Date.now()).id);
  planifier();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void passerAuFond(fondDuMoment(Date.now()).id);
  });
  // Trente images par seconde suffisent à ces mouvements lents ; le temps, lui, avance à chaque image de l'écran.
  let avant = performance.now();
  let dernier = 0;
  const boucle = (t: number): void => {
    const dt = Math.min(100, t - avant);
    avant = t;
    if (!fige() && actuelle) {
      tempsAnime += dt;
      const k = Math.min(1, dt * 0.0036);
      vx += (mx - vx) * k;
      vy += (my - vy) * k;
      if (t - dernier >= 32) {
        dernier = t;
        if (sortante) dessiner(sortante);
        dessiner(actuelle);
      }
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  // Une autre taille d'écran ou un autre thème : le paysage refait ses calques, même immobile.
  const remonter = (): void => {
    if (actuelle) monter(actuelle);
    if (sortante) monter(sortante);
  };
  let attente = 0;
  addEventListener("resize", () => {
    clearTimeout(attente);
    attente = window.setTimeout(() => {
      if (tailleVoulue() !== posee) remonter();
    }, 150);
  });
  new MutationObserver(remonter).observe(racine, { attributes: true, attributeFilter: ["data-mode"] });
}
