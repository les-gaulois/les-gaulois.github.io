/**
 * Le mouvement des cartes du podium de l'accueil (src/components/CartesPodium.astro) : chaque carte se tourne vers le
 * curseur de la souris ; sans souris depuis trois secondes, ou au doigt, elle se balance lentement. Le script ne pose que
 * deux nombres par carte, `--mx` et `--my`, de -1 à 1 : l'inclinaison et le reflet sont dans la feuille de style
 * (04-poste.css). Il ne change aucun texte ni aucun chiffre.
 *
 * En pause (bouton de l'en-tête, `fx-off`), avec « réduire les animations », hors de l'écran ou dans un onglet caché,
 * les cartes reviennent à plat et le script ne dessine plus rien.
 */
// Un module : ses noms ne se mêlent pas à ceux des autres scripts.
export {};

const racine = document.querySelector<HTMLElement>("[data-podium-cartes]");

if (racine) {
  const html = document.documentElement;
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const cartes = [...racine.querySelectorAll<HTMLElement>(".podium-carte")].map((el, i) => ({ el, i, mx: 0, my: 0 }));
  let souris: [number, number] | null = null;
  let vue = -Infinity;
  let visible = true;
  let image = 0;

  const actif = () => !calme.matches && !html.classList.contains("fx-off") && visible && !document.hidden;
  const borne = (v: number) => Math.max(-1, Math.min(1, v));
  const poser = (c: (typeof cartes)[number]) => {
    c.el.style.setProperty("--mx", c.mx.toFixed(3));
    c.el.style.setProperty("--my", c.my.toFixed(3));
  };

  const tour = (t: number) => {
    image = 0;
    if (!actif()) {
      for (const c of cartes) {
        c.mx = c.my = 0;
        poser(c);
      }
      return;
    }
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
        tx = Math.sin(t / 2600 + c.i * 1.3) * 0.6;
        ty = Math.sin(t / 3800 + c.i * 0.8) * 0.32;
      }
      c.mx += (tx - c.mx) * 0.07;
      c.my += (ty - c.my) * 0.07;
      poser(c);
    }
    image = requestAnimationFrame(tour);
  };
  const relancer = () => {
    if (!image) image = requestAnimationFrame(tour);
  };

  addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      souris = [e.clientX, e.clientY];
      vue = performance.now();
    },
    { passive: true },
  );
  new IntersectionObserver((entrees) => {
    visible = entrees.some((e) => e.isIntersecting);
    relancer();
  }).observe(racine);
  new MutationObserver(relancer).observe(html, { attributes: true, attributeFilter: ["class"] });
  calme.addEventListener("change", relancer);
  document.addEventListener("visibilitychange", relancer);
  relancer();
}
