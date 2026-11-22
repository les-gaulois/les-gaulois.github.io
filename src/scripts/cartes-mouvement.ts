/**
 * Le mouvement des cartes à finition (les cartes du podium de l'accueil, `src/components/CartesPodium.astro`, et la carte
 * d'essai du rayon « Cartes » de la boutique, `src/components/village/Cartes.tsx`) : chaque carte se tourne vers le
 * curseur de la souris ; sans souris depuis trois secondes, ou au doigt, elle se balance lentement. Le script ne pose que
 * deux nombres par carte, `--carte-mx` et `--carte-my`, de -1 à 1 : l'inclinaison et le reflet sont dans la feuille de style
 * (04-poste.css). Il dessine aussi, vingt fois par seconde (dix en régime économe), la finition animée de chaque carte sur ses deux toiles
 * (src/lib/fx/finitions-carte.ts). Il ne change aucun texte ni aucun chiffre.
 *
 * En pause (bouton de l'en-tête, `fx-off`), avec « réduire les animations », hors de l'écran ou dans un onglet caché,
 * les cartes reviennent à plat, les toiles sont effacées et le script ne dessine plus rien.
 */
import { HAUTEUR_DU_CADRE, INSTANT_DU_CADRE_FIGE, LARGEUR_DU_CADRE, cadreAnime, peindreLeCadre } from "../lib/fx/cadres-carte";
import { FINITIONS, HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE, etincellesDuChampion, finitionAnimee, fusionDeLaFinition } from "../lib/fx/finitions-carte";

/*
 * Le régime économe (demande du pilote, 17 novembre 2026 : « je veux que ça déchire visuellement », sans faire ramer les
 * joueurs) : la page mesure elle-même sa fluidité, par fenêtres de deux secondes de mouvement. Une fenêtre est lente si
 * plus de la moitié de ses images ont mis plus de 34 millièmes de seconde à venir (moins de 30 par seconde) : un à-coup
 * isolé ne compte pas, une page qui rame vraiment, si. Après deux fenêtres lentes de suite, elle passe seule en mode
 * léger, pour le reste de la visite :
 * l'arc-en-ciel ne dérive plus, le halo du Gaulois disparaît (classe `cartes-econome`, 04-poste.css) et les finitions ne
 * sont redessinées que dix fois par seconde au lieu de vingt. Un bon ordinateur garde tout ; personne n'a rien à régler.
 * Les trois premières secondes de la page ne comptent pas (elle se met en place), ni un trou de plus d'une seconde (un
 * onglet qu'on quitte).
 */
const CLE_ECONOME = "gal-cartes-econome";
const FENETRE_DE_MESURE = 2000;
const IMAGE_TROP_LENTE = 34;
const FENETRES_LENTES_DE_SUITE = 2;

/** Une image est-elle lente ? `ecart` : le temps depuis la précédente, en millièmes de seconde. */
export const imageLente = (ecart: number): boolean => ecart > IMAGE_TROP_LENTE;
/** Une fenêtre de mesure dit-elle que la page rame ? Plus de la moitié de ses images sont lentes (trois images au moins). */
export const fenetreLente = (lentes: number, images: number): boolean => images >= 3 && lentes / images > 0.5;

let econome = false;
if (typeof document !== "undefined") {
  try {
    econome = sessionStorage.getItem(CLE_ECONOME) === "1";
  } catch {
    // Sans stockage, la mesure se refait à chaque page.
  }
  if (econome) document.documentElement.classList.add("cartes-econome");
}
function passerEnEconome(): void {
  econome = true;
  document.documentElement.classList.add("cartes-econome");
  try {
    sessionStorage.setItem(CLE_ECONOME, "1");
  } catch {
    // Rien à garder : le mode léger vaut pour cette page.
  }
}

/**
 * Anime les cartes (`.podium-carte`) de cette racine. Rend de quoi tout arrêter : l'écran qui les retire l'appelle.
 * `sonde` : dans le défilé de la boutique, la carte est posée et déplacée par l'écran, et le navigateur la croit parfois hors de l'écran ;
 * sa place est alors remesurée, deux fois par seconde au plus, tant qu'elle est au repos pour cette seule raison.
 * `immobile` : sans souris, pas de balancement (le reflet d'un grand bloc de fiche : rien à repeindre quand rien ne bouge).
 */
export function monterLesCartes(racine: HTMLElement, { sonde = false, immobile = false }: { sonde?: boolean; immobile?: boolean } = {}): () => void {
  const html = document.documentElement;
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const toile = (el: HTMLElement, nom: string) => el.querySelector<HTMLCanvasElement>(`canvas[data-toile="${nom}"]`)?.getContext("2d") ?? null;
  const cartes = [...racine.querySelectorAll<HTMLElement>(".podium-carte")].map((el, i) => {
    const nom = finitionAnimee(el.dataset["finition"]);
    const fond = toile(el, "fond");
    if (fond) fond.canvas.style.mixBlendMode = nom ? fusionDeLaFinition(nom) : "";
    // Le cadre animé du rayon « Cadres » : sa toile déborde de la carte, son image est peinte case par case.
    const cadre = cadreAnime(el.dataset["cadre"]);
    const toileDuCadre = cadre ? toile(el, "cadre") : null;
    const imageDuCadre = toileDuCadre ? toileDuCadre.createImageData(LARGEUR_DU_CADRE, HAUTEUR_DU_CADRE) : null;
    // Le champion de la semaine : des étincelles d'or par-dessus sa finition (sa couronne est dans la page).
    return { el, i, mx: 0, my: 0, finition: nom ? FINITIONS[nom] : null, fond, devant: toile(el, "devant"), champion: el.dataset["champion"] !== undefined, cadre, toileDuCadre, imageDuCadre };
  });
  let souris: [number, number] | null = null;
  let vue = -Infinity;
  let visible = true;
  let image = 0;
  let arrete = false;
  let rappel: ReturnType<typeof setTimeout> | undefined;
  const aLEcran = (): boolean => {
    const r = racine.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  // Pour ne pas faire chuter les images par seconde : l'inclinaison n'est reposée que trente fois par seconde, et les
  // toiles des finitions ne sont redessinées que vingt fois. Entre deux, le navigateur n'a rien à repeindre.
  const PAS_DE_L_INCLINAISON = 1000 / 30;
  const pasDuDessin = () => (econome ? 1000 / 10 : 1000 / 20);
  let inclineA = -Infinity;
  let dessineA = -Infinity;
  // La mesure de la fluidité (régime économe, en tête du fichier).
  const montee = performance.now();
  let imageAvant = 0;
  let mesuree = 0;
  let comptees = 0;
  let imagesLentes = 0;
  let lentes = 0;

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

  // Le cadre est un objet du membre, pas un effet : en pause ou au repos il reste, figé (INSTANT_DU_CADRE_FIGE).
  const peindreCadre = (c: (typeof cartes)[number], secondes: number) => {
    if (!c.cadre || !c.toileDuCadre || !c.imageDuCadre) return;
    peindreLeCadre(c.cadre, secondes, c.imageDuCadre.data);
    c.toileDuCadre.putImageData(c.imageDuCadre, 0, 0);
  };

  const tour = (t: number) => {
    image = 0;
    if (sonde && !visible) visible = aLEcran();
    const tourne = actif();
    // Au repos, les animations de la feuille de style s'arrêtent aussi (data-repos, 04-poste.css).
    if (racine.hasAttribute("data-repos") === tourne) racine.toggleAttribute("data-repos", !tourne);
    if (!tourne) {
      for (const c of cartes) {
        c.mx = c.my = 0;
        poser(c);
        effacer(c);
        peindreCadre(c, INSTANT_DU_CADRE_FIGE);
      }
      imageAvant = 0;
      // Au repos seulement parce qu'elle paraît hors de l'écran : on y revient dans une demi-seconde.
      if (sonde && !visible && !arrete && !calme.matches && !html.classList.contains("fx-off") && !document.hidden) {
        clearTimeout(rappel);
        rappel = setTimeout(relancer, 500);
      }
      return;
    }
    // Chaque image qui vient compte, tant que le mode léger n'est pas pris.
    if (!econome && t - montee > 3000) {
      const ecart = t - imageAvant;
      // Un trou de plus d'une seconde n'est pas une image lente : la page était ailleurs.
      if (imageAvant > 0 && ecart < 1000) {
        mesuree += ecart;
        comptees++;
        if (imageLente(ecart)) imagesLentes++;
        if (mesuree >= FENETRE_DE_MESURE) {
          lentes = fenetreLente(imagesLentes, comptees) ? lentes + 1 : 0;
          if (lentes >= FENETRES_LENTES_DE_SUITE) passerEnEconome();
          imagesLentes = 0;
          mesuree = 0;
          comptees = 0;
        }
      }
    }
    imageAvant = t;
    if (t - inclineA < PAS_DE_L_INCLINAISON) {
      image = requestAnimationFrame(tour);
      return;
    }
    inclineA = t;
    const dessiner = t - dessineA >= pasDuDessin();
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
      } else if (immobile) {
        tx = 0;
        ty = 0;
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
      if (dessiner) peindreCadre(c, t / 1000);
      if (dessiner && c.devant && (c.finition || c.champion)) {
        effacer(c);
        if (c.finition && c.fond) c.finition(c.fond, c.devant, t / 1000, c.mx, c.my);
        // Les étincelles du champion se posent par-dessus la finition, quelle qu'elle soit.
        if (c.champion) {
          c.devant.globalCompositeOperation = "source-over";
          etincellesDuChampion(c.devant, t / 1000);
        }
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
    clearTimeout(rappel);
    if (image) cancelAnimationFrame(image);
    image = 0;
    removeEventListener("pointermove", suivre);
    regard.disconnect();
    classes.disconnect();
    calme.removeEventListener("change", relancer);
    document.removeEventListener("visibilitychange", relancer);
    for (const c of cartes) {
      effacer(c);
      peindreCadre(c, INSTANT_DU_CADRE_FIGE);
    }
  };
}
