/**
 * La lumière des cartes des cosmétiques (`CarteDeCosmetique.tsx`) : une seule boucle d'animation pour toutes les cartes de
 * la page. Chaque carte pose `--cc-x`, `--cc-y` (la place de la lumière, de 0 à 1) et `--cc-o` (sa force) sur sa place ; la feuille
 * en tire l'inclinaison, le relief des trois plans et les reflets. Sous le pointeur ou le doigt, la lumière le suit ; au
 * repos, celle d'une grande carte se promène lentement, celle d'une petite reste posée. Elle ne bouge que si la carte se
 * voit. En pause (`fx-off`), rien ne bouge ; si l'appareil demande moins d'animations, la lumière se pose sans glisser et la
 * carte ne penche pas (la feuille). La lumière ne change aucune valeur.
 */

interface Lumiere {
  el: HTMLElement;
  x: number;
  y: number;
  o: number;
  tx: number;
  ty: number;
  to: number;
  actif: boolean;
  vivante: boolean;
  visible: boolean;
  phase: number;
}

/** Le repos d'une carte qui ne se promène pas : la lumière en haut à droite, comme l'aperçu sans animation. */
const REPOS = { x: 0.64, y: 0.34, o: 0.55 } as const;

const CARTES = new Map<HTMLElement, Lumiere>();
let vues: IntersectionObserver | null = null;
let pause: MutationObserver | null = null;
let boucle = 0;
let depart = 0;
let compte = 0;

const enPause = (): boolean => document.documentElement.classList.contains("fx-off");
const calme = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

function poser(l: Lumiere): void {
  l.el.style.setProperty("--cc-x", l.x.toFixed(4));
  l.el.style.setProperty("--cc-y", l.y.toFixed(4));
  l.el.style.setProperty("--cc-o", l.o.toFixed(3));
}

function pas(t: number): void {
  boucle = 0;
  if (!depart) depart = t;
  const u = (t - depart) / 1000;
  const arret = enPause();
  const doux = calme();
  let encore = false;
  for (const l of CARTES.values()) {
    // La pause de la page, ou celle de la fenêtre d'un booster (`bst-fige`) : la lumière reste où elle est.
    if (!l.visible || arret || l.el.closest(".bst-fige")) continue;
    if (!l.actif) {
      if (l.vivante && !doux) {
        l.tx = 0.5 + 0.2 * Math.sin(u / 2.9 + l.phase);
        l.ty = 0.46 + 0.13 * Math.cos(u / 3.7 + l.phase);
        l.to = 0.45;
        encore = true;
      } else {
        l.tx = REPOS.x;
        l.ty = REPOS.y;
        l.to = REPOS.o;
      }
    }
    const k = doux ? 1 : l.actif ? 0.16 : 0.04;
    const ko = doux ? 1 : 0.05;
    l.x += (l.tx - l.x) * k;
    l.y += (l.ty - l.y) * k;
    l.o += (l.to - l.o) * ko;
    poser(l);
    if (Math.abs(l.tx - l.x) + Math.abs(l.ty - l.y) + Math.abs(l.to - l.o) > 0.002) encore = true;
  }
  if (encore) relancer();
}

function relancer(): void {
  if (!boucle && typeof requestAnimationFrame === "function") boucle = requestAnimationFrame(pas);
}

function vers(l: Lumiere, e: PointerEvent): void {
  const b = l.el.getBoundingClientRect();
  if (b.width <= 0 || b.height <= 0) return;
  l.tx = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
  l.ty = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
  l.to = 1;
  l.actif = true;
  relancer();
}

/**
 * Suit la carte `el` : sa lumière, ses gestes, sa visibilité. `vivante` : au repos, la lumière se promène (une grande
 * carte). Rend de quoi l'oublier.
 */
export function suivreLaCarte(el: HTMLElement, vivante: boolean): () => void {
  const l: Lumiere = { el, x: REPOS.x, y: REPOS.y, o: REPOS.o, tx: REPOS.x, ty: REPOS.y, to: REPOS.o, actif: false, vivante, visible: true, phase: (compte++ % 7) * 1.7 };
  CARTES.set(el, l);
  poser(l);
  const bouger = (e: PointerEvent): void => {
    if (!enPause()) vers(l, e);
  };
  const lacher = (): void => {
    l.actif = false;
    relancer();
  };
  const appui = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") bouger(e);
  };
  const levee = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") lacher();
  };
  el.addEventListener("pointermove", bouger);
  el.addEventListener("pointerdown", appui);
  el.addEventListener("pointerup", levee);
  el.addEventListener("pointercancel", lacher);
  el.addEventListener("pointerleave", lacher);
  // La pause levée par le bouton de l'en-tête (la classe `fx-off` de la page) : les cartes reprennent.
  if (!pause && typeof MutationObserver === "function") {
    pause = new MutationObserver(relancer);
    pause.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  if (typeof IntersectionObserver === "function") {
    vues ??= new IntersectionObserver((entrees) => {
      for (const v of entrees) {
        const c = CARTES.get(v.target as HTMLElement);
        if (c) c.visible = v.isIntersecting;
      }
      relancer();
    });
    vues.observe(el);
  }
  relancer();
  return () => {
    CARTES.delete(el);
    vues?.unobserve(el);
    el.removeEventListener("pointermove", bouger);
    el.removeEventListener("pointerdown", appui);
    el.removeEventListener("pointerup", levee);
    el.removeEventListener("pointercancel", lacher);
    el.removeEventListener("pointerleave", lacher);
  };
}
