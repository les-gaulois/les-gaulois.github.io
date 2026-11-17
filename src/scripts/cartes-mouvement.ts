/**
 * Le mouvement des cartes à finition (les cartes du podium de l'accueil, `src/components/CartesPodium.astro`, et la carte
 * d'essai du rayon « Cartes » de la boutique, `src/components/village/Cartes.tsx`) : chaque carte se tourne vers le
 * curseur de la souris ; sans souris depuis trois secondes, ou au doigt, elle se balance lentement. Le script ne pose que
 * deux nombres par carte, `--carte-mx` et `--carte-my`, de -1 à 1 : l'inclinaison et le reflet sont dans la feuille de style
 * (04-poste.css). Il dessine aussi, vingt fois par seconde, la finition animée de chaque carte sur ses deux toiles
 * (src/lib/fx/finitions-carte.ts). Il ne change aucun texte ni aucun chiffre.
 *
 * En pause (bouton de l'en-tête, `fx-off`), avec « réduire les animations », hors de l'écran ou dans un onglet caché,
 * les cartes reviennent à plat, les toiles sont effacées et le script ne dessine plus rien.
 */
import { FINITIONS, HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE, finitionAnimee, fusionDeLaFinition } from "../lib/fx/finitions-carte";

/** Anime les cartes (`.podium-carte`) de cette racine. Rend de quoi tout arrêter : l'écran qui les retire l'appelle. */
export function monterLesCartes(racine: HTMLElement): () => void {
  const html = document.documentElement;
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const toile = (el: HTMLElement, nom: string) => el.querySelector<HTMLCanvasElement>(`canvas[data-toile="${nom}"]`)?.getContext("2d") ?? null;
  const cartes = [...racine.querySelectorAll<HTMLElement>(".podium-carte")].map((el, i) => {
    const nom = finitionAnimee(el.dataset["finition"]);
    const fond = toile(el, "fond");
    if (fond) fond.canvas.style.mixBlendMode = nom ? fusionDeLaFinition(nom) : "";
    return { el, i, mx: 0, my: 0, finition: nom ? FINITIONS[nom] : null, fond, devant: toile(el, "devant") };
  });
  let souris: [number, number] | null = null;
  let vue = -Infinity;
  let visible = true;
  let image = 0;
  let arrete = false;
  // Pour ne pas faire chuter les images par seconde : l'inclinaison n'est reposée que trente fois par seconde, et les
  // toiles des finitions ne sont redessinées que vingt fois. Entre deux, le navigateur n'a rien à repeindre.
  const PAS_DE_L_INCLINAISON = 1000 / 30;
  const PAS_DU_DESSIN = 1000 / 20;
  let inclineA = -Infinity;
  let dessineA = -Infinity;

  const actif = () => !arrete && !calme.matches && !html.classList.contains("fx-off") && visible && !document.hidden;
  const borne = (v: number) => Math.max(-1, Math.min(1, v));
  const poser = (c: (typeof cartes)[number]) => {
    c.el.style.setProperty("--carte-mx", c.mx.toFixed(3));
    c.el.style.setProperty("--carte-my", c.my.toFixed(3));
  };
  const effacer = (c: (typeof cartes)[number]) => {
    for (const t of [c.fond, c.devant]) {
      if (!t) continue;
      t.globalAlpha = 1;
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, LARGEUR_DE_TOILE, HAUTEUR_DE_TOILE);
    }
  };

  const tour = (t: number) => {
    image = 0;
    const tourne = actif();
    // Au repos, les animations de la feuille de style s'arrêtent aussi (data-repos, 04-poste.css).
    if (racine.hasAttribute("data-repos") === tourne) racine.toggleAttribute("data-repos", !tourne);
    if (!tourne) {
      for (const c of cartes) {
        c.mx = c.my = 0;
        poser(c);
        effacer(c);
      }
      return;
    }
    if (t - inclineA < PAS_DE_L_INCLINAISON) {
      image = requestAnimationFrame(tour);
      return;
    }
    inclineA = t;
    const dessiner = t - dessineA >= PAS_DU_DESSIN;
    if (dessiner) dessineA = t;
    const suit = souris !== null && t - vue < 3000;
    for (const c of cartes) {
      let tx: number;
      let ty: number;
      if (suit && souris) {
        // La case de la carte, qui ne tourne pas : la visée ne dépend pas de l'inclinaison en cours.
        const r = (c.el.parentElement ?? c.el).getBoundingClientRect();
        tx = borne((souris[0] - (r.left + r.width / 2)) / (r.width * 1.6));
        ty = borne((souris[1] - (r.top + r.height / 2)) / (r.height * 1.2));
      } else {
        // Un balancement lent, décalé d'une carte à l'autre : un tour en une quinzaine de secondes.
        tx = Math.sin(t / 2600 + c.i * 1.3) * 0.45;
        ty = Math.sin(t / 3800 + c.i * 0.8) * 0.25;
      }
      const mx = c.mx + (tx - c.mx) * 0.13;
      const my = c.my + (ty - c.my) * 0.13;
      // Une carte presque immobile n'est pas reposée : rien à repeindre.
      if (Math.abs(mx - c.mx) > 0.0015 || Math.abs(my - c.my) > 0.0015) {
        c.mx = mx;
        c.my = my;
        poser(c);
      }
      if (dessiner && c.finition && c.fond && c.devant) {
        effacer(c);
        c.finition(c.fond, c.devant, t / 1000, c.mx, c.my);
      }
    }
    image = requestAnimationFrame(tour);
  };
  const relancer = () => {
    if (!image && !arrete) image = requestAnimationFrame(tour);
  };
  const suivre = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    souris = [e.clientX, e.clientY];
    vue = performance.now();
  };

  addEventListener("pointermove", suivre, { passive: true });
  const regard = new IntersectionObserver((entrees) => {
    visible = entrees.some((e) => e.isIntersecting);
    relancer();
  });
  regard.observe(racine);
  const classes = new MutationObserver(relancer);
  classes.observe(html, { attributes: true, attributeFilter: ["class"] });
  calme.addEventListener("change", relancer);
  document.addEventListener("visibilitychange", relancer);
  relancer();

  return () => {
    arrete = true;
    if (image) cancelAnimationFrame(image);
    image = 0;
    removeEventListener("pointermove", suivre);
    regard.disconnect();
    classes.disconnect();
    calme.removeEventListener("change", relancer);
    document.removeEventListener("visibilitychange", relancer);
    for (const c of cartes) effacer(c);
  };
}
