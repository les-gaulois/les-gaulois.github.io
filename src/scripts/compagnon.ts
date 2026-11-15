/**
 * Le Gaulois compagnon : le Gaulois du village, en pixels, qui suit le visiteur sur toute la fenêtre, de page en page
 * (demande du pilote, 14 novembre 2026 : d'abord au bas de la fenêtre, puis « sur tout l'écran »). Rangé, il attend dans
 * une petite prison, au coin bas gauche ; un clic l'en sort. Balisage : `src/components/GauloisCompagnon.astro`.
 * Calculs, testés : `src/lib/compagnon/` (mouvement, répliques, tenue ; la prison, dessin de Claude Fable 5.2, dans
 * `prison.ts`). Style : `src/styles/feuilles/13-compagnon.css`.
 *
 * Léger sur chaque page : ce script ne contient ni Supabase ni le dessin du Gaulois. Le dessin (`gaulois.ts`, lourd) est
 * dans `src/lib/compagnon/dessin.ts`, chargé à la demande une seule fois par onglet : ses images, une fois peintes,
 * sont gardées dans l'onglet (`sessionStorage`), et les pages suivantes le montrent tout de suite, sans rien charger.
 * La tenue d'un membre connecté est lue au serveur une fois par onglet (`src/lib/compagnon/tenue.ts`) ; Supabase n'est
 * chargé que s'il y a une session, comme pour l'en-tête.
 *
 * Décoratif : il n'affiche aucune donnée. Pause de l'en-tête (`fx-off`) ou « réduire les animations » : il ne suit plus
 * et ne marche plus, il reste debout à sa place ; on peut toujours lui parler, le déplacer et le mettre en prison.
 *
 * Arrêté, il ne couvre jamais du texte ni une commande (revue du site, 14 novembre 2026) : à l'arrivée, à la fin d'un
 * défilement, d'un redimensionnement, d'une marche, et d'un coup d'œil sous lui toutes les 1,25 s, il se tient à la place
 * libre la plus proche de celle qu'il voudrait (`src/lib/compagnon/repos.ts`) ; sans place pour lui en entier, il
 * s'enfonce sous le bord bas, la tête dehors, ou s'y cache le temps qu'une place se libère. Il n'y travaille qu'à ces
 * moments-là, jamais à chaque image : la carte de ce qu'il ne couvre pas est gardée tant que la page ne bouge pas. Il
 * n'apparaît qu'une fois finies les entrées en fondu de la page, et son salut spontané ne se dit que d'une place où sa
 * bulle ne couvre rien non plus.
 */
import { tirage } from "../lib/fx/repliques";
import {
  CASES_H,
  CASES_L,
  IMAGES,
  LIT_H,
  LIT_L,
  NOMBRE_D_IMAGES,
  avancer,
  bornerLaPlace,
  cadreA,
  coinDuCote,
  corpsA,
  depuisPart,
  echelleDeLaPrison,
  echelleDuCompagnon,
  enPart,
  fenetreGenee,
  imageDeMarche,
  marcheurA,
  margeDuBord,
  nullePart,
  placeAcoteDuCurseur,
  placeDeDepart,
  reposApres,
  seuilDeDepart,
  souffleA,
  touche,
  JEU,
  PRISON_FENETRE_MIN,
  type Allure,
  type Bornes,
  type Cadre,
  type Marcheur,
  type Point,
  type Repos,
} from "../lib/compagnon/mouvement";
import { REPLIQUES, REPLIQUES_DES_GESTES, dureeDeLaBulle, ponctuer, repliqueDuClic, rubriqueDe, type Geste } from "../lib/compagnon/repliques";
import {
  AIR,
  EMPREINTE_ENDORMI,
  bulleAuMieux,
  carteDesZones,
  empreinteA,
  etatDeLaPlace,
  fondDeLaFenetre,
  formeA,
  placeAprendre,
  placeDeRepos,
  placePourSaluer,
  type Carte,
  type Fenetre,
  type Taille,
} from "../lib/compagnon/repos";
import {
  ATTENTE_DU_SERVEUR_MS,
  CLE_IMAGES,
  EVENEMENT_ENREGISTRE,
  besoinDeCettePage,
  cleDeLaTenue,
  lireLaTenue,
  marquerUnPassageAuVillage,
  recevoirLaTenue,
  surveillerLeCompte,
} from "../lib/compagnon/tenue";

/** Dans ce navigateur : rangé (en prison), et posé à la main (il ne suit plus). */
const CLE_RANGE = "gal-compagnon-range";
const CLE_POSE = "gal-compagnon-pose";
/** Dans cet onglet : où il était, et s'il a déjà salué. Ses images peintes : `CLE_IMAGES` (`tenue.ts`). */
const CLE_PLACE = "gal-compagnon-place";
const CLE_SALUE = "gal-compagnon-salue";
/**
 * À changer quand la forme des images gardées ou leur peinture (`peindre`) change. Un dessin changé (`gaulois.ts`, les
 * poses du village) n'a pas besoin d'y toucher : la version du dessin, calculée à la construction du site par
 * `GauloisCompagnon.astro` (`data-version`), est dans la clé des images.
 */
const VERSION_DES_IMAGES = 2;
/**
 * Ce qui est fixé sur la fenêtre et qu'il ne couvre jamais : tout élément marqué `data-compagnon-obstacle`, les fenêtres
 * des appels du QG (`AppelsGaulois.tsx`). Il se tient à côté ; s'il ne tient nulle part, il s'efface le temps qu'ils
 * restent. Sa prison remonte au-dessus d'eux. (La barre « Enregistrer » du vestiaire n'en est plus : il ne vient pas au
 * village.)
 */
const OBSTACLES = "[data-compagnon-obstacle], [data-testid='appels-popups']";
/** Ce qu'il ne couvre pas, arrêté, en entier : les commandes, et les lignes de tableau (la ligne de [GAL] du classement). */
const COMMANDES =
  "a[href], button, input:not([type='hidden']), select, textarea, summary, tr, [contenteditable]:not([contenteditable='false']), [role='button'], [role='link'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch'], [role='slider'], [role='menuitem'], [role='option']";
/** Les images : il ne couvre pas celles qui disent quelque chose ; il peut passer devant celles qui ornent. */
const BALISES_D_IMAGE = new Set(["img", "svg", "canvas", "video", "iframe", "object", "embed"]);
/**
 * Les graphiques, qu'il ne couvre pas en entier : tout élément marqué `data-graphique` (les courbes, les barres : cachés aux
 * lecteurs d'écran, qui en lisent les valeurs en texte, ils ne seraient pas reconnus autrement), et la jauge commune du
 * site, `.meter` (docs/DESIGN.md), partout où elle est.
 */
const GRAPHIQUES = "[data-graphique], .meter";

/**
 * Une image qui dit quelque chose : ni cachée aux lecteurs d'écran (elle ni un parent), ni décorative (texte de
 * remplacement vide, rôle `presentation`), et, pour un dessin (`svg`, `canvas`), avec un nom ou le rôle d'image.
 */
function imageQuiDitQuelqueChose(el: Element): boolean {
  const role = el.getAttribute("role");
  if (el.closest("[aria-hidden='true']") || el.getAttribute("alt") === "" || role === "presentation" || role === "none") return false;
  if (el.localName !== "svg" && el.localName !== "canvas") return true;
  return role === "img" || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || el.querySelector(":scope > title") !== null;
}
const SANS_TEXTE = new Set(["script", "style", "noscript", "template", "link", "meta"]);
/** Après l'avoir posé à la main (glisser, flèches), le visiteur a ce temps pour le placer avant qu'il ne dégage ce qu'il couvre. */
const POSE_MS = 2_000;
/** La fin d'un défilement : plus aucun mouvement de la page depuis ce temps. */
const FIN_DU_DEFILEMENT_MS = 220;
/**
 * Pour dégager ce qu'il couvre, il marche jusqu'à trois fois sa hauteur (sept secondes au plus sur ordinateur) ; plus
 * loin, il s'efface en fondu et réapparaît à sa nouvelle place, plutôt que de traverser la page en marchant dessus.
 */
const PORTEE_EN_HAUTEURS = 3;
const FONDU_MS = 450;
/** Son salut se dit 1,6 s après son apparition au plus tôt, et attend au plus 30 s une place où sa bulle ne couvre rien. */
const SALUT_APRES_MS = 1_600;
const SALUT_MAX_MS = 30_000;
/** Il n'apparaît qu'une fois finies les entrées des blocs et des titres de la page (`fx.ts`), une seconde et demie au plus. */
const ENTREES_MAX_MS = 1_500;

interface ImagesGardees {
  cle: string;
  gaulois: string;
  lit: string;
  deDepart: boolean;
}

const lire = (stockage: "localStorage" | "sessionStorage", cle: string): string | null => {
  try {
    return window[stockage].getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (stockage: "localStorage" | "sessionStorage", cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) window[stockage].removeItem(cle);
    else window[stockage].setItem(cle, valeur);
  } catch {
    // Stockage indisponible : il repart de sa place de départ à chaque page.
  }
};

/** Une planche d'images en cases, peinte côte à côte dans une image PNG. */
function peindre(largeur: number, hauteur: number, images: readonly (readonly (string | null)[])[]): string {
  const toile = document.createElement("canvas");
  toile.width = largeur * images.length;
  toile.height = hauteur;
  const contexte = toile.getContext("2d");
  if (!contexte) return "";
  images.forEach((cases, rang) => {
    cases.forEach((couleur, i) => {
      if (!couleur) return;
      contexte.fillStyle = couleur;
      contexte.fillRect(rang * largeur + (i % largeur), Math.floor(i / largeur), 1, 1);
    });
  });
  return toile.toDataURL("image/png");
}

/** Les images gardées dans l'onglet pour cette clé, si elles sont entières. */
function imagesGardees(cle: string): ImagesGardees | null {
  try {
    const gardees = JSON.parse(lire("sessionStorage", CLE_IMAGES) ?? "null") as ImagesGardees | null;
    if (gardees && gardees.cle === cle && typeof gardees.gaulois === "string" && typeof gardees.lit === "string" && gardees.gaulois && gardees.lit) return gardees;
  } catch {
    // Images illisibles : elles sont refaites.
  }
  return null;
}

/** Le cadre d'un élément dans la fenêtre. */
const cadreDe = (el: Element): Cadre => {
  const r = el.getBoundingClientRect();
  return { gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom };
};

/**
 * Un élément est-il là, à lire : pas en `visibility: hidden` (lui ou un parent) ? Un élément transparent compte : à
 * l'arrivée, les blocs, les titres et les lignes de tableau entrent en fondu depuis une opacité nulle (`fx.ts`), et le
 * Gaulois se posait dessus juste avant qu'ils ne paraissent. Sans le savoir, on le croit là.
 */
const vu = (el: Element): boolean => typeof el.checkVisibility !== "function" || el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });

/**
 * Ce qu'il ne couvre pas, arrêté, dans `region` (la fenêtre, ou sa boîte pour un coup d'œil), hors de `exclus` (lui, sa
 * prison) : chaque ligne de texte vu, chaque commande, chaque ligne de tableau et chaque graphique en entier (`GRAPHIQUES`),
 * chaque image qui dit quelque chose (une image décorative, `aria-hidden` elle ou un parent, ou sans texte de remplacement,
 * ne compte pas). Les branches de la page hors de `region` ne sont pas parcourues.
 */
function zonesOccupees(region: Cadre, exclus: readonly Element[]): Cadre[] {
  const trouvees: Cadre[] = [];
  const dedans = (r: DOMRectReadOnly): boolean => r.right > region.gauche && r.left < region.droite && r.bottom > region.haut && r.top < region.bas;
  const garder = (r: DOMRectReadOnly): void => {
    if (r.width >= 2 && r.height >= 2 && dedans(r)) trouvees.push({ gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom });
  };
  const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.TEXT_NODE) return /\S/.test(n.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      const el = n as Element;
      if (SANS_TEXTE.has(el.localName) || exclus.includes(el)) return NodeFilter.FILTER_REJECT;
      const r = el.getBoundingClientRect();
      // Sans boîte : caché (on passe), ou `display: contents` (on regarde dedans).
      if (r.width === 0 && r.height === 0) return getComputedStyle(el).display === "none" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      if (!dedans(r)) return NodeFilter.FILTER_REJECT;
      if (el.matches(GRAPHIQUES)) {
        if (vu(el)) garder(r);
        return NodeFilter.FILTER_REJECT;
      }
      if (BALISES_D_IMAGE.has(el.localName)) {
        if (imageQuiDitQuelqueChose(el) && vu(el)) garder(r);
        return NodeFilter.FILTER_REJECT;
      }
      if (el.matches(COMMANDES)) {
        if (vu(el)) garder(r);
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  const plage = document.createRange();
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    if (!n.parentElement || !vu(n.parentElement)) continue;
    plage.selectNodeContents(n);
    for (const r of plage.getClientRects()) garder(r);
  }
  return trouvees;
}

function init(): void {
  const racine = document.documentElement;
  const route = document.body.dataset.route;
  // Il ne vient ni sur la Carte, qui tient dans l'écran sans pied de page, ni au village, qui a déjà ses Gaulois (demande
  // du pilote, 14 novembre 2026 : « ça fait doublon »), même en prison : il attend à la page suivante. Une déconnexion
  // faite là (fenêtre « Alliance », compte du village) efface quand même ce qui reste du membre dans l'onglet. La boutique
  // (/boutique, 15 novembre 2026), sortie de « Mon Gaulois », montre elle aussi le Gaulois du membre : il n'y vient pas non plus.
  const auVillage = route === "/village" || route === "/boutique";
  if (route === "/carte" || auVillage) {
    // Sans session, ce qui reste du membre dans l'onglet s'efface aussi ici, comme sur les autres pages.
    besoinDeCettePage();
    void surveillerLeCompte(() => undefined);
    if (auVillage) {
      // La tenue a pu changer ici (vestiaire, « Le porter » de la boutique) : la page suivante la relira une fois au serveur. Marqué dès
      // l'arrivée et de nouveau en partant, pour un onglet fermé d'un coup comme pour une page ouverte dans un autre.
      marquerUnPassageAuVillage();
      window.addEventListener("pagehide", () => marquerUnPassageAuVillage());
      // Une tenue tout juste enregistrée au vestiaire est gardée : la page suivante la montre avant même la réponse.
      window.addEventListener(EVENEMENT_ENREGISTRE, (e) => void recevoirLaTenue((e as CustomEvent<unknown>).detail, true), true);
    }
    return;
  }
  const boite = document.querySelector<HTMLElement>("[data-compagnon]");
  const gaulois = boite?.querySelector<HTMLButtonElement>("[data-compagnon-gaulois]");
  const image = boite?.querySelector<HTMLElement>("[data-compagnon-image]");
  const lit = boite?.querySelector<HTMLElement>("[data-compagnon-lit]");
  const bulle = boite?.querySelector<HTMLElement>("[data-compagnon-bulle]");
  const parole = boite?.querySelector<HTMLElement>("[data-compagnon-parole]");
  const village = boite?.querySelector<HTMLAnchorElement>("[data-compagnon-village]");
  const boutonSuivre = boite?.querySelector<HTMLButtonElement>("[data-compagnon-suivre]");
  const boutonRanger = boite?.querySelector<HTMLButtonElement>("[data-compagnon-ranger]");
  const prison = document.querySelector<HTMLButtonElement>("[data-compagnon-prison]");
  const prisonnier = prison?.querySelector<HTMLElement>("[data-compagnon-prisonnier]");
  /** La mention de licence d'OpenFront, au pied de page : il ne s'y arrête pas, et s'efface s'il s'y trouve. */
  const mention = document.querySelector<HTMLElement>("[data-compagnon-mention]");
  if (!boite || !gaulois || !image || !lit || !bulle || !parole || !village || !boutonSuivre || !boutonRanger || !prison || !prisonnier) return;

  const mouvementReduit = matchMedia("(prefers-reduced-motion: reduce)");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const chemin = location.pathname.replace(base, "") || "/";
  const rubrique = rubriqueDe(chemin);
  /** La version du dessin du Gaulois, posée à la construction du site : un dessin changé ne garde pas ses anciennes images. */
  const versionDuDessin = boite.dataset.version ?? "";
  const suivante = tirage(REPLIQUES.length, Math.random);
  // Son salut est déjà dit dans cet onglet : il ne le redit pas à chaque page.
  if (lire("sessionStorage", CLE_SALUE) === "1") suivante();

  // Sans session, ce qui reste du membre dans l'onglet s'efface dès l'ouverture de la page, même s'il est en prison.
  besoinDeCettePage();

  let range = lire("localStorage", CLE_RANGE) === "1";
  let suit = lire("localStorage", CLE_POSE) !== "1";
  let pret = false;
  let deDepart = true;
  /** La clé des images montrées : `""` tant qu'aucune ne l'est. */
  let montree = "";
  /** Chaque habillage a son numéro : seul le dernier demandé se pose. */
  let habillage = 0;
  /** La lecture de la tenue au serveur, tant qu'elle est en route. */
  let enLecture: Promise<unknown> | null = null;
  let cote = 2;
  let largeur = CASES_L * cote;
  let hauteur = CASES_H * cote;
  let bornes: Bornes = { gauche: 0, droite: 0, haut: 0, bas: 0 };
  let marcheur: Marcheur = marcheurA(0, 0);
  /** Où est le visiteur : le curseur, ou le dernier endroit touché. `null` tant qu'il n'a pas bougé. */
  let visiteur: Point | null = null;
  let auDoigt = false;
  /** Où aller pour dégager un champ, un lien atteint au clavier ou ce qui est fixé sur la fenêtre. */
  let ecart: Point | null = null;
  let champ: HTMLElement | null = null;
  /** Ce qu'il ne couvre pas : ce qui est fixé sur la fenêtre (`OBSTACLES`), et le champ ou le lien qui a le focus. */
  let zonesFixees: Cadre[] = [];
  let zoneDuChamp: Cadre | null = null;
  /** Ce qui l'efface : une saisie sur écran tactile, le clavier du téléphone ou la page agrandie, une fenêtre sans place libre. */
  let saisie = false;
  let fenetrePetite = false;
  let barre = false;
  let glisse = false;
  let bulleOuverte = false;
  let clics = 0;
  let dernierGeste = performance.now();
  let repos: Repos = "debout";
  let dortDepuis = 0;
  let image0 = performance.now();
  let boucle = 0;
  let veille = 0;
  let fermeture = 0;
  let regard = 0;
  /**
   * Où il voudrait se tenir, en parts de la largeur et de la hauteur de ses bornes : sa place gardée dans l'onglet, celle où
   * on l'a posé, ou celle du visiteur qu'il suit. Arrêté, il se tient à la place libre la plus proche (`repos.ts`).
   */
  let ancre = { part: 0, partY: 1 };
  /** La carte de ce qu'il ne couvre pas, faite à `carteA` ; `carteAJour` passe à faux dès que la page bouge. */
  let carte: Carte | null = null;
  let carteA = -Infinity;
  let carteAJour = false;
  /** La dernière place libre trouvée pour une place voulue, tant que la carte ne change pas. */
  let trouvee: { cle: string; place: Point } | null = null;
  /** Le moment où on l'a posé à la main, et celui du dernier défilement. */
  let poseA = -Infinity;
  let defileA = -Infinity;
  let verification = 0;
  let finDuDefilement = 0;
  /** Le fondu d'une longue traversée, tant qu'il dure. */
  let passage = 0;
  /** Il est apparu sur cette page (`apparaitre`) : avant, il ne bouge pas. */
  let apparu = false;
  /**
   * Son salut, tant qu'il attend de le dire : sa phrase, et le moment où il peut la dire au plus tôt. Il ne le dit que
   * d'une place où ni lui ni sa bulle ne couvrent quoi que ce soit ; sans une telle place, il attend, puis y renonce
   * sur cette page (`SALUT_MAX_MS`).
   */
  let salut: { texte: string; des: number } | null = null;
  /** La bulle ouverte est son salut : elle ne le retient pas de dégager ce qu'il couvrirait. */
  let bulleSpontanee = false;

  const calme = (): boolean => racine.classList.contains("fx-off") || mouvementReduit.matches;
  const efface = (): boolean => saisie || fenetrePetite || barre;
  const zones = (): Cadre[] => (zoneDuChamp ? [...zonesFixees, zoneDuChamp] : zonesFixees);
  /** La mention de licence, si elle est dans la fenêtre. */
  function zoneDeLaMention(): Cadre | null {
    if (!mention) return null;
    const cadre = cadreDe(mention);
    return cadre.bas > 0 && cadre.haut < hauteurFenetre() && cadre.droite > cadre.gauche ? cadre : null;
  }
  const largeurFenetre = (): number => document.documentElement.clientWidth;
  const hauteurFenetre = (): number => document.documentElement.clientHeight;

  /* ---------- Taille et place ---------- */

  /** Le bas de l'en-tête collé en haut de la fenêtre : il passerait dessous. */
  function plafond(): number {
    const tete = document.querySelector("body > header");
    if (!tete) return 0;
    const position = getComputedStyle(tete).position;
    if (position !== "sticky" && position !== "fixed") return 0;
    return Math.max(0, tete.getBoundingClientRect().bottom);
  }

  function mesurer(): void {
    const parts = pret ? { x: enPart(marcheur.x, bornes.gauche, bornes.droite), y: enPart(marcheur.y, bornes.haut, bornes.bas) } : null;
    const echelle = echelleDuCompagnon(window.innerWidth, window.devicePixelRatio);
    cote = echelle.cote;
    largeur = CASES_L * cote;
    hauteur = CASES_H * cote;
    const marge = margeDuBord(cote);
    // Le bas de l'écran d'un téléphone à encoche : `scroll-margin-bottom` porte `env(safe-area-inset-bottom)` (13-compagnon.css).
    const sol = Number.parseFloat(getComputedStyle(boite!).scrollMarginBottom) || 0;
    bornes = { gauche: marge, droite: largeurFenetre() - largeur - marge, haut: plafond() + 4, bas: hauteurFenetre() - hauteur - sol };
    boite!.style.setProperty("--case", `${cote}px`);
    prison!.style.setProperty("--case", `${echelleDeLaPrison(window.devicePixelRatio).cote}px`);
    if (parts !== null) marcheur = { ...marcheur, x: depuisPart(parts.x, bornes.gauche, bornes.droite), y: depuisPart(parts.y, bornes.haut, bornes.bas) };
  }

  /** Les places où il marche : celles des bornes, et sous le bord bas, où il s'enfonce jusqu'à la tête ou se cache. */
  const bornesDeMarche = (): Bornes => ({ ...bornes, bas: Math.max(bornes.bas, hauteurFenetre()) });
  const ancreEnPlace = (): Point => ({ x: depuisPart(ancre.part, bornes.gauche, bornes.droite), y: depuisPart(ancre.partY, bornes.haut, bornes.bas) });
  const poserLAncre = (p: Point): void => {
    ancre = { part: enPart(p.x, bornes.gauche, bornes.droite), partY: enPart(p.y, bornes.haut, bornes.bas) };
  };

  /**
   * La carte de ce qu'il ne couvre pas : le texte et les commandes de la fenêtre, ce qui y est fixé, le champ ou le lien
   * qui a le focus. Gardée deux secondes tant que la page ne bouge pas ; refaite au plus tous les quarts de seconde sinon.
   */
  function carteDuMoment(refaire = false): Carte {
    const maintenant = performance.now();
    if (carte && !refaire && maintenant - carteA < (carteAJour ? 2_000 : 250)) return carte;
    const vue: Cadre = { gauche: 0, droite: largeurFenetre(), haut: 0, bas: hauteurFenetre() };
    carte = carteDesZones([...zonesOccupees(vue, [boite!, prison!]), ...zones()], vue.droite, vue.bas);
    carteA = maintenant;
    carteAJour = true;
    return carte;
  }

  /** Le curseur qu'il suit : il ne s'arrête pas dessous. */
  const curseur = (): Cadre[] => (visiteur && !auDoigt ? [{ gauche: visiteur.x - 8, droite: visiteur.x + 8, haut: visiteur.y - 8, bas: visiteur.y + 8 }] : []);

  /** La place libre la plus proche de `voulue` (et du curseur, s'il le suit), gardée tant que la carte et la place voulue ne changent pas. */
  function placeLibre(voulue: Point): Point {
    const c = carteDuMoment();
    const cle = `${Math.round(voulue.x / 4)}:${Math.round(voulue.y / 4)}:${carteA}:${cote}:${hauteurFenetre()}`;
    if (trouvee?.cle !== cle) trouvee = { cle, place: placeDeRepos(voulue, c, bornes, cote, hauteurFenetre(), curseur()).place };
    return trouvee.place;
  }

  /** Où il voudrait être : à côté du curseur, ou au coin du côté touché, s'il suit le visiteur ; sinon à sa place. */
  function voulue(): Point {
    if (!suit || calme() || visiteur === null) return ancreEnPlace();
    return auDoigt ? coinDuCote(visiteur.x, largeurFenetre(), bornes) : placeAcoteDuCurseur(visiteur, marcheur, largeur, hauteur, bornes);
  }

  /** La dernière place écrite : un mouvement de souris qui ne le fait pas bouger n'écrit rien. */
  let placeEcrite = "";
  function garderLaPlace(): void {
    if (!pret) return;
    const a = ancreEnPlace();
    const place = JSON.stringify({ part: enPart(a.x, bornes.gauche, bornes.droite), partY: enPart(a.y, bornes.haut, bornes.bas), vers: marcheur.vers });
    if (place === placeEcrite) return;
    placeEcrite = place;
    ecrire("sessionStorage", CLE_PLACE, place);
  }

  /**
   * Sa place gardée dans l'onglet (d'une page à l'autre, et au retour arrière) ; sinon sa place de départ. Il y apparaît
   * tout de suite, ou à la place libre la plus proche : il n'arrive jamais sur ce qu'on lit.
   */
  function reprendreLaPlace(): void {
    poserLAncre(placeDeDepart(bornes));
    let vers: 1 | -1 = 1;
    try {
      const garde = JSON.parse(lire("sessionStorage", CLE_PLACE) ?? "null") as { part?: unknown; partY?: unknown; vers?: unknown } | null;
      if (garde && typeof garde.part === "number") {
        // Une place gardée avant qu'il ne marche sur toute la fenêtre : au bas, comme alors.
        const partY = typeof garde.partY === "number" ? garde.partY : 1;
        poserLAncre({ x: depuisPart(garde.part, bornes.gauche, bornes.droite), y: depuisPart(partY, bornes.haut, bornes.bas) });
        vers = garde.vers === -1 ? -1 : 1;
      }
    } catch {
      // Place illisible : il repart de sa place de départ.
    }
    const libre = placeDeRepos(ancreEnPlace(), carteDuMoment(true), bornes, cote, hauteurFenetre()).place;
    marcheur = marcheurA(libre.x, libre.y, vers);
  }

  /* ---------- Dessin ---------- */

  function dessiner(): void {
    // Sur un pixel entier de l'écran : le dessin reste net.
    const dpr = window.devicePixelRatio || 1;
    boite!.style.transform = `translate3d(${Math.round(marcheur.x * dpr) / dpr}px, ${Math.round(marcheur.y * dpr) / dpr}px, 0)`;
    boite!.dataset.vers = marcheur.vers === 1 ? "droite" : "gauche";
    let pose: { image: number; leve: boolean } = { image: IMAGES.debout, leve: false };
    if (marcheur.enMarche) pose = imageDeMarche(marcheur.pasMs);
    else if (repos === "somnole") pose = { image: IMAGES.yeuxFermes, leve: false };
    image!.style.setProperty("--image", String(pose.image));
    image!.dataset.leve = pose.leve ? "1" : "0";
    boite!.dataset.pose = marcheur.enMarche ? "marche" : repos;
    if (repos === "dort") lit!.style.setProperty("--image", String(souffleA(performance.now() - dortDepuis)));
    laisserLire();
    if (bulleOuverte) placerLaBulle();
  }

  /**
   * La mention de licence d'OpenFront se lit toujours en fin de page : sa place à côté du curseur l'évite, au bas de la
   * fenêtre la place gardée sous le pied de page (13-compagnon.css) la laisse au-dessus de lui, et s'il se tient ailleurs sur
   * elle (posé à la main, en pause), il s'efface, sans bouger, tant que la page reste défilée jusqu'en bas. Pendant le
   * défilement, elle passe sous lui sans qu'il disparaisse : il ne clignote pas.
   */
  function laisserLire(): void {
    const zone = zoneDeLaMention();
    const finDePage = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const dessus = finDePage && zone !== null && touche(corpsA(marcheur, cote), zone);
    if (dessus === (boite!.dataset.laisseLire === "1")) return;
    if (dessus) {
      boite!.dataset.laisseLire = "1";
      fermer(false);
    } else delete boite!.dataset.laisseLire;
  }

  /** La fenêtre où se pose sa bulle : sous l'en-tête collé en haut. */
  const fenetreDeLaBulle = (): Fenetre => ({ largeur: largeurFenetre(), hauteur: hauteurFenetre(), haut: bornes.haut - 4 });

  /**
   * Sa bulle, posée au mieux (`bulleAuMieux`) : là où elle couvre le moins de texte et de commandes, au-dessus de lui de
   * préférence, sous ses pieds si c'est mieux ; la queue toujours vers sa tête, sans sortir de la fenêtre.
   */
  function placerLaBulle(): void {
    const place = bulleAuMieux(marcheur, cote, { largeur: bulle!.offsetWidth, hauteur: bulle!.offsetHeight }, fenetreDeLaBulle(), carteDuMoment());
    bulle!.style.setProperty("--bulle-x", `${place.gauche - marcheur.x}px`);
    bulle!.style.setProperty("--queue", `${place.queue}px`);
    if (place.dessous) boite!.dataset.bulleDessous = "1";
    else delete boite!.dataset.bulleDessous;
  }

  /* ---------- Marche ---------- */

  /** Sa cible : dégager un champ ou ce qui est fixé d'abord ; sinon le visiteur, s'il le suit et que rien ne le retient. */
  function cible(): { place: Point | null; allure: Allure } {
    if (efface()) return { place: null, allure: "suivre" };
    if (ecart !== null) return { place: ecart, allure: "ecarter" };
    if (calme() || !suit || glisse || bulleOuverte || visiteur === null) return { place: null, allure: "suivre" };
    // Au doigt : le coin bas du côté touché. À la souris : à côté du curseur, où qu'il soit. Il y va, ou à la place libre la
    // plus proche : il ne s'arrête ni sur ce qu'on lit (la mention de licence comprise), ni sous le curseur.
    const voulu = voulue();
    poserLAncre(voulu);
    return { place: placeLibre(voulu), allure: auDoigt ? "rejoindre" : "suivre" };
  }

  function pasDeTemps(maintenant: number): void {
    const dt = maintenant - image0;
    image0 = maintenant;
    const but = cible();
    const precis = but.allure === "ecarter";
    marcheur = avancer(marcheur, but.place, dt, bornesDeMarche(), but.allure);
    if (marcheur.enMarche) reveiller(maintenant);
    // Écarté : s'il suit le visiteur, il regarde de nouveau où il est à l'image suivante.
    const ecarte = precis && !marcheur.enMarche;
    if (ecarte) ecart = null;
    dessiner();
    let attend = false;
    if (but.place !== null && !precis) {
      const voulue = bornerLaPlace(but.place, bornesDeMarche());
      attend = Math.hypot(voulue.x - marcheur.x, voulue.y - marcheur.y) > seuilDeDepart(but.allure);
    }
    boucle = marcheur.enMarche || attend || (precis && ecart !== null) || (ecarte && suit && visiteur !== null) ? requestAnimationFrame(pasDeTemps) : 0;
    if (!boucle) {
      garderLaPlace();
      // Arrivé : la page a pu changer sous lui pendant sa marche.
      planifierLaVerification(400);
    }
  }

  function relancer(): void {
    if (boucle || !pret || range || document.hidden) return;
    image0 = performance.now();
    boucle = requestAnimationFrame(pasDeTemps);
  }

  function arreter(): void {
    if (boucle) cancelAnimationFrame(boucle);
    boucle = 0;
    marcheur = avancer(marcheur, null, 0, bornesDeMarche());
  }

  /** Il va tout de suite à `but` : en marchant, ou d'un coup en pause et pendant un glisser. */
  function allerA(but: Point): void {
    if (Math.hypot(but.x - marcheur.x, but.y - marcheur.y) < 0.5) return;
    fermer(false);
    if (calme() || glisse || efface()) {
      arreter();
      marcheur = marcheurA(but.x, but.y, marcheur.vers);
      dessiner();
      garderLaPlace();
    } else {
      ecart = but;
      relancer();
    }
  }

  /* ---------- Sa place de repos : jamais sur ce qu'on lit ---------- */

  /**
   * Arrêté, il ne couvre ni texte ni commande : s'il en couvre, ou s'il peut se montrer davantage (enfoncé sous le bord,
   * ou caché), il va à la place libre la plus proche de celle qu'il voudrait, en marchant, d'un coup en pause. Une place
   * libre où il se voit en entier lui reste acquise : il ne change de place que s'il le faut. `urgent` : un champ ou un
   * lien atteint au clavier, même s'il marche, si sa bulle est ouverte ou si on vient de le poser.
   */
  function verifierLaPlace(urgent = false): void {
    window.clearTimeout(verification);
    verification = 0;
    if (!pret || !apparu || range || efface() || glisse || passage || document.hidden || boite!.hidden) return;
    // Une bulle qu'on lui a demandée le retient ; celle de son salut, non.
    if (!urgent && (marcheur.enMarche || (bulleOuverte && !bulleSpontanee))) return;
    const depuisLaPose = performance.now() - poseA;
    if (!urgent && depuisLaPose < POSE_MS) return planifierLaVerification(POSE_MS - depuisLaPose + 50);
    const c = carteDuMoment(true);
    const endormi = repos === "dort";
    const but = placeAprendre({ x: marcheur.x, y: marcheur.y }, voulue(), c, bornes, cote, hauteurFenetre(), [], endormi);
    if (but === null) return essayerDeSaluer();
    // Couché, son lit n'a plus sa place : il se lève, et ne bouge que si, debout, il couvre encore quelque chose.
    if (endormi) {
      reveiller();
      return verifierLaPlace(urgent);
    }
    if (!calme() && Math.hypot(but.place.x - marcheur.x, but.place.y - marcheur.y) > PORTEE_EN_HAUTEURS * hauteur) passer(but.place);
    else allerA(but.place);
  }

  /** Une longue traversée : il s'efface en fondu et réapparaît à sa nouvelle place, plutôt que de marcher sur toute la page. */
  function passer(but: Point): void {
    fermer(false);
    arreter();
    ecart = null;
    boite!.dataset.passe = "1";
    window.clearTimeout(passage);
    passage = window.setTimeout(() => {
      passage = 0;
      marcheur = marcheurA(but.x, but.y, marcheur.vers);
      dessiner();
      garderLaPlace();
      delete boite!.dataset.passe;
    }, FONDU_MS);
  }

  function planifierLaVerification(delai = 0): void {
    window.clearTimeout(verification);
    verification = window.setTimeout(() => {
      verification = 0;
      requestAnimationFrame(() => verifierLaPlace());
    }, delai);
  }

  /**
   * Toutes les 1,25 s, arrêté : un coup d'œil sous sa boîte seulement (le texte d'une page peut changer sans qu'elle
   * bouge) ; enfoncé ou caché, sur toute la fenêtre, pour se remontrer dès qu'une place se libère. Pas pendant un
   * défilement : la page passe sous lui.
   */
  function coupDOeil(): void {
    if (!pret || !apparu || range || efface() || verification || passage || performance.now() - defileA < FIN_DU_DEFILEMENT_MS) return;
    if (formeA(marcheur, bornes, cote, hauteurFenetre()) !== "entier") return verifierLaPlace();
    const ici = empreinteA(marcheur, cote, repos === "dort" ? EMPREINTE_ENDORMI : undefined);
    const occupe = (c: Cadre): boolean => {
      const region: Cadre = { gauche: c.gauche - AIR, droite: c.droite + AIR, haut: c.haut - AIR, bas: c.bas + AIR };
      return zonesOccupees(region, [boite!, prison!]).length > 0 || zones().some((z) => touche(region, z));
    };
    if (occupe(ici)) {
      carteAJour = false;
      verifierLaPlace();
      return;
    }
    // La bulle de son salut ne couvre rien non plus : un texte venu dessous la referme.
    if (bulleOuverte && bulleSpontanee && occupe(cadreDe(bulle!))) fermer(false);
  }

  /** La taille qu'aurait sa bulle pour cette phrase, mesurée bulle fermée (invisible, les lecteurs d'écran n'en disent rien). */
  function tailleDeLaBulle(texte: string, lien: boolean): Taille {
    const avant = { phrase: parole!.textContent, sansLien: village!.hidden, suivre: boutonSuivre!.textContent };
    parole!.textContent = ponctuer(texte);
    village!.hidden = !lien;
    boutonSuivre!.textContent = suit ? "Reste là" : "Suis-moi";
    const taille = { largeur: bulle!.offsetWidth, hauteur: bulle!.offsetHeight };
    parole!.textContent = avant.phrase;
    village!.hidden = avant.sansLien;
    boutonSuivre!.textContent = avant.suivre;
    return taille;
  }

  /**
   * Son salut, spontané : seulement arrêté, en entier, à une place libre, et si sa bulle y tient sans rien couvrir. Sinon
   * il attend (un défilement, une place qui se libère : il réessaie à chaque coup d'œil) et y renonce sur cette page au
   * bout de `SALUT_MAX_MS` ; la page suivante de l'onglet réessaie.
   */
  function essayerDeSaluer(): void {
    if (salut === null || !apparu || range || calme() || bulleOuverte || glisse || passage || efface() || document.hidden || boite!.hidden) return;
    const maintenant = performance.now();
    if (maintenant < salut.des || marcheur.enMarche || boucle) return;
    if (maintenant - salut.des > SALUT_MAX_MS) {
      salut = null;
      return;
    }
    const c = carteDuMoment(true);
    const ici = etatDeLaPlace(marcheur, c, bornes, cote, hauteurFenetre());
    if (!ici.libre || ici.forme !== "entier") return;
    if (!bulleAuMieux(marcheur, cote, tailleDeLaBulle(salut.texte, false), fenetreDeLaBulle(), c).libre) return;
    const texte = salut.texte;
    salut = null;
    ecrire("sessionStorage", CLE_SALUE, "1");
    dire(texte, false, true);
  }

  /** Caché sous le bord bas, il sort la tête pour parler ou quand le clavier l'atteint : on le voit, et son focus aussi. */
  function sortirLaTete(): void {
    if (formeA(marcheur, bornes, cote, hauteurFenetre()) !== "cache") return;
    arreter();
    ecart = null;
    marcheur = marcheurA(marcheur.x, fondDeLaFenetre(bornes, cote, hauteurFenetre()), marcheur.vers);
    dessiner();
  }

  /** Il ne se couche que debout en entier, et là où son lit ne couvre rien. */
  const litPossible = (): boolean =>
    formeA(marcheur, bornes, cote, hauteurFenetre()) === "entier" && etatDeLaPlace(marcheur, carteDuMoment(), bornes, cote, hauteurFenetre(), [], true).libre;

  /* ---------- Repos : il somnole, puis se couche ---------- */

  function reveiller(maintenant = performance.now()): void {
    dernierGeste = maintenant;
    if (repos === "debout") return;
    repos = "debout";
    dessiner();
  }

  function veiller(): void {
    window.clearInterval(veille);
    veille = 0;
    if (!pret || range || calme()) {
      repos = "debout";
      return;
    }
    veille = window.setInterval(() => {
      if (document.hidden) return;
      // De temps en temps, il regarde aussi ce qui est fixé sur la fenêtre : une barre a pu y venir sans prévenir.
      regarderLesObstacles();
      if (marcheur.enMarche || glisse) return;
      // Et sous lui : un texte a pu y venir sans que la page bouge (sous la bulle de son salut aussi). Puis, s'il attend
      // pour saluer, il regarde si sa place le permet maintenant.
      if (!bulleOuverte || bulleSpontanee) coupDOeil();
      if (bulleOuverte) return;
      essayerDeSaluer();
      const maintenant = performance.now();
      let suite = reposApres(maintenant - dernierGeste);
      // Sans la place de son lit, il somnole debout.
      if (suite === "dort" && repos !== "dort" && !litPossible()) suite = "somnole";
      if (suite === "dort" && repos !== "dort") dortDepuis = maintenant;
      if (suite !== repos || suite === "dort") {
        repos = suite;
        dessiner();
      }
    }, 1_250);
  }

  /* ---------- Bulle ---------- */

  /** `spontanee` : son salut, qu'on ne lui a pas demandé (il ne le dit que d'une place où sa bulle ne couvre rien). */
  function dire(texte: string, lien: boolean, spontanee = false): void {
    if (efface()) return;
    window.clearTimeout(fermeture);
    reveiller();
    arreter();
    sortirLaTete();
    // Le visiteur lui parle avant son salut : il ne saluera plus, dans cet onglet.
    if (!spontanee && salut !== null) {
      salut = null;
      ecrire("sessionStorage", CLE_SALUE, "1");
    }
    bulleSpontanee = spontanee;
    bulleOuverte = true;
    village!.hidden = !lien;
    boutonSuivre!.textContent = suit ? "Reste là" : "Suis-moi";
    boite!.dataset.bulle = "1";
    gaulois!.setAttribute("aria-expanded", "true");
    // La bulle est d'abord montrée, puis remplie : les lecteurs d'écran annoncent la phrase.
    parole!.textContent = "";
    requestAnimationFrame(() => {
      parole!.textContent = ponctuer(texte);
      dessiner();
    });
    dessiner();
    // Un petit salut : un saut lent, sauf en pause.
    if (!calme()) {
      image!.classList.remove("compagnon-saut");
      void image!.offsetWidth;
      image!.classList.add("compagnon-saut");
    }
    fermeture = window.setTimeout(() => {
      // Tant qu'on s'en occupe (clavier ou curseur dessus), elle reste.
      if (boite!.contains(document.activeElement) || bulle!.matches(":hover")) return;
      fermer(false);
    }, dureeDeLaBulle(texte));
  }

  function fermer(rendreLeFocus: boolean): void {
    if (!bulleOuverte) return;
    window.clearTimeout(fermeture);
    const dedans = bulle!.contains(document.activeElement);
    bulleOuverte = false;
    bulleSpontanee = false;
    delete boite!.dataset.bulle;
    gaulois!.setAttribute("aria-expanded", "false");
    if ((rendreLeFocus || dedans) && !efface()) gaulois!.focus({ preventScroll: true });
    dernierGeste = performance.now();
    relancer();
  }

  function parler(geste?: Geste): void {
    const invite = deDepart;
    if (geste) return dire(REPLIQUES_DES_GESTES[geste], false);
    if (repos !== "debout") return dire(REPLIQUES_DES_GESTES.reveil, false);
    // Le Gaulois de départ invite à l'habiller, une fois par page, à son deuxième mot.
    if (invite && clics === 1) {
      clics++;
      return dire(REPLIQUES_DES_GESTES.invitation, true);
    }
    dire(repliqueDuClic(rubrique, clics++, suivante), false);
  }

  /* ---------- Ce qui l'efface, ce qu'il évite ---------- */

  /** Il s'efface (le temps d'une saisie au doigt, du clavier du téléphone, d'une fenêtre sans place libre), puis revient. */
  function effacement(): void {
    // Sa prison s'efface aussi le temps d'une saisie au doigt ou du clavier du téléphone, et dans une fenêtre trop basse.
    if (saisie || fenetrePetite || hauteurFenetre() < PRISON_FENETRE_MIN) prison!.dataset.efface = "1";
    else delete prison!.dataset.efface;
    const avant = boite!.dataset.efface === "1";
    const maintenant = efface();
    if (avant === maintenant) return;
    if (maintenant) {
      boite!.dataset.efface = "1";
      fermer(false);
      arreter();
      ecart = null;
      if (pret) dessiner();
    } else {
      delete boite!.dataset.efface;
      relancer();
    }
  }

  // Un élément fixé dont la taille change (une fenêtre d'appel qui s'allonge) : il regarde de nouveau.
  const tailles = typeof ResizeObserver === "function" ? new ResizeObserver(() => planifierLeRegard()) : null;
  const suivis = new WeakSet<Element>();

  /** La prison remonte au-dessus de ce qui est fixé au coin bas gauche de la fenêtre (la fenêtre d'un appel du QG). */
  function remonterLaPrison(): void {
    prison!.style.setProperty("--monte", "0px");
    if (prison!.hidden) return;
    const place = cadreDe(prison!);
    let monte = 0;
    for (const z of zonesFixees) {
      if (z.droite <= place.gauche - JEU || z.gauche >= place.droite + JEU || z.bas <= place.haut - JEU || z.haut >= place.bas + JEU) continue;
      monte = Math.max(monte, place.bas - z.haut + JEU);
    }
    if (monte > 0) prison!.style.setProperty("--monte", `${Math.ceil(monte)}px`);
  }

  /** Ce qui est fixé sur la fenêtre : il se tient à côté, ou s'efface s'il ne tient nulle part ; sa prison remonte. */
  function regarderLesObstacles(): void {
    if (!pret) return;
    const vue: Cadre = { gauche: 0, droite: largeurFenetre(), haut: 0, bas: hauteurFenetre() };
    const trouvees: Cadre[] = [];
    for (const obstacle of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
      if (boite!.contains(obstacle) || prison!.contains(obstacle)) continue;
      if (tailles && !suivis.has(obstacle)) {
        suivis.add(obstacle);
        tailles.observe(obstacle);
      }
      const cadre = cadreDe(obstacle);
      if (cadre.droite - cadre.gauche < 1 || cadre.bas - cadre.haut < 1 || !touche(cadre, vue)) continue;
      trouvees.push(cadre);
    }
    zonesFixees = trouvees;
    laisserLire();
    if (range) return remonterLaPrison();
    const toutes = zones();
    barre = toutes.length > 0 && nullePart(marcheur, largeur, hauteur, toutes, bornes);
    effacement();
    // En marche vers une place libre, il ne fait que passer dessus : il n'est écarté qu'une fois arrêté, vers la place libre
    // la plus proche de celle qu'il voudrait, hors de ce qui est fixé comme du texte.
    if (barre || toutes.length === 0 || (marcheur.enMarche && ecart === null)) return;
    if (toutes.some((z) => touche(cadreA(marcheur, largeur, hauteur), z, JEU))) {
      carteAJour = false;
      verifierLaPlace();
    }
  }

  function planifierLeRegard(): void {
    if (regard || !pret) return;
    regard = requestAnimationFrame(() => {
      regard = 0;
      regarderLesObstacles();
    });
  }

  /** Le clavier d'un téléphone ouvert, ou la page agrandie du bout des doigts : il s'efface (`fenetreGenee`). */
  function regarderLaFenetre(): void {
    fenetrePetite = fenetreGenee(window.innerHeight, window.visualViewport);
    effacement();
  }

  /* ---------- La prison ---------- */

  function montrer(): void {
    const images = pret && montree !== "";
    boite!.hidden = range || !images;
    prison!.hidden = !range || !images;
    if (range) remonterLaPrison();
  }

  /** « En prison » : il quitte la page et attend dans sa prison, au coin bas gauche, sur toutes les pages. */
  function ranger(): void {
    fermer(false);
    arreter();
    ecart = null;
    range = true;
    ecrire("localStorage", CLE_RANGE, "1");
    montrer();
    veiller();
    if (!prison!.hidden) prison!.focus({ preventScroll: true });
  }

  /**
   * Un clic sur la prison : il en sort, en bas à gauche, à côté d'elle (ou à la place libre la plus proche, s'il y
   * couvrirait quelque chose), prend le focus et remercie. La prison ne se montre qu'une fois ses images posées : il est prêt.
   */
  function liberer(): void {
    if (!pret) return;
    range = false;
    ecrire("localStorage", CLE_RANGE, null);
    mesurer();
    poserLAncre(placeDeDepart(bornes));
    const sortie = placeDeRepos(ancreEnPlace(), carteDuMoment(true), bornes, cote, hauteurFenetre()).place;
    marcheur = marcheurA(sortie.x, sortie.y);
    apparu = true;
    delete boite!.dataset.passe;
    repos = "debout";
    dernierGeste = performance.now();
    montrer();
    veiller();
    dessiner();
    garderLaPlace();
    regarderLesObstacles();
    regarderLaFenetre();
    if (!efface()) gaulois!.focus({ preventScroll: true });
    parler("libere");
  }

  function choisirDeSuivre(oui: boolean): void {
    suit = oui;
    ecrire("localStorage", CLE_POSE, oui ? null : "1");
  }

  /* ---------- Gestes du visiteur ---------- */

  /**
   * Posé à la main : sa place devient celle qu'il voudrait. S'il y couvre quelque chose, il se pousse à la place libre la
   * plus proche, une fois le visiteur laissé tranquille (`POSE_MS`) : on peut le faire passer sur un texte.
   */
  function poser(): void {
    poseA = performance.now();
    poserLAncre(marcheur);
    garderLaPlace();
    planifierLaVerification(POSE_MS + 50);
  }

  // Glisser : il se déplace à la main, partout dans la fenêtre, et reste où on le pose.
  let prise: { id: number; x0: number; y0: number; depart: Point; bouge: boolean } | null = null;
  let clicAvale = false;
  gaulois.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    prise = { id: e.pointerId, x0: e.clientX, y0: e.clientY, depart: { x: marcheur.x, y: marcheur.y }, bouge: false };
    gaulois.setPointerCapture(e.pointerId);
  });
  gaulois.addEventListener("pointermove", (e) => {
    if (!prise || e.pointerId !== prise.id) return;
    const dx = e.clientX - prise.x0;
    const dy = e.clientY - prise.y0;
    if (!prise.bouge && Math.hypot(dx, dy) < 6) return;
    if (!prise.bouge) {
      prise.bouge = true;
      glisse = true;
      fermer(false);
      arreter();
      reveiller();
      boite.dataset.glisse = "1";
    }
    const place = bornerLaPlace({ x: prise.depart.x + dx, y: prise.depart.y + dy }, bornes);
    marcheur = marcheurA(place.x, place.y, dx < 0 ? -1 : dx > 0 ? 1 : marcheur.vers);
    dessiner();
  });
  const lacher = (e: PointerEvent): void => {
    if (!prise || e.pointerId !== prise.id) return;
    const bouge = prise.bouge;
    prise = null;
    if (!bouge) return;
    glisse = false;
    delete boite.dataset.glisse;
    clicAvale = true;
    window.setTimeout(() => (clicAvale = false), 0);
    choisirDeSuivre(false);
    poser();
    parler("pose");
  };
  gaulois.addEventListener("pointerup", lacher);
  gaulois.addEventListener("pointercancel", lacher);
  // Sur téléphone, le doigt qui glisse sur lui le déplace au lieu de faire défiler la page (`touch-action` en CSS).

  gaulois.addEventListener("click", () => {
    if (clicAvale) return;
    if (bulleOuverte) fermer(false);
    else parler();
  });

  // Au clavier : les flèches le déplacent, comme un glisser, dans les quatre directions.
  const FLECHES: Readonly<Record<string, Point>> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
  gaulois.addEventListener("keydown", (e) => {
    const fleche = FLECHES[e.key];
    if (!fleche) return;
    e.preventDefault();
    fermer(false);
    arreter();
    reveiller();
    const place = bornerLaPlace({ x: marcheur.x + fleche.x * 24, y: marcheur.y + fleche.y * 24 }, bornes);
    marcheur = marcheurA(place.x, place.y, fleche.x < 0 ? -1 : fleche.x > 0 ? 1 : marcheur.vers);
    choisirDeSuivre(false);
    dessiner();
    poser();
  });

  boutonSuivre.addEventListener("click", () => {
    choisirDeSuivre(!suit);
    if (suit) parler("suivre");
    else parler("pose");
    gaulois.focus({ preventScroll: true });
  });
  boutonRanger.addEventListener("click", ranger);
  prison.addEventListener("click", liberer);

  // Échap ferme sa bulle, et seulement elle : avant les autres (la fenêtre d'un appel du QG écoute aussi Échap), et marqué
  // comme traité pour qu'une seule touche ne ferme pas deux choses.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !bulleOuverte || e.defaultPrevented || document.activeElement?.closest("dialog[open]")) return;
      e.preventDefault();
      fermer(boite.contains(document.activeElement));
    },
    true,
  );
  document.addEventListener("pointerdown", (e) => {
    if (bulleOuverte && !boite.contains(e.target as Node)) fermer(false);
  });

  // Le visiteur : le curseur d'une souris, ou l'endroit touché.
  const suivre = (e: PointerEvent): void => {
    if (boite.contains(e.target as Node)) return;
    visiteur = { x: e.clientX, y: e.clientY };
    auDoigt = e.pointerType !== "mouse";
    reveiller();
    relancer();
  };
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "mouse") suivre(e);
    },
    { passive: true },
  );
  window.addEventListener("pointerdown", suivre, { passive: true });
  window.addEventListener("scroll", () => reveiller(), { passive: true });
  window.addEventListener("keydown", () => reveiller(), { passive: true });

  // Un champ en cours de saisie, ou tout élément qui prend le focus au clavier, n'est jamais couvert : il s'écarte ; sur un
  // écran tactile, où le clavier prend la place, il s'efface le temps d'une saisie.
  const estUnChamp = (el: EventTarget | null): el is HTMLElement =>
    el instanceof HTMLElement &&
    (el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el.isContentEditable ||
      (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image"].includes(el.type)));
  function degager(): void {
    if (!champ || !pret || range) return;
    zoneDuChamp = cadreDe(champ);
    if (!touche(cadreA(marcheur, largeur, hauteur), zoneDuChamp, JEU)) return;
    carteAJour = false;
    verifierLaPlace(true);
  }
  // Atteint au clavier, caché sous le bord bas : il sort la tête.
  gaulois.addEventListener("focus", sortirLaTete);
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof HTMLElement) || boite.contains(e.target) || prison.contains(e.target)) return;
    const unChamp: boolean = estUnChamp(e.target as EventTarget);
    // Un lien ou un bouton atteint au clavier n'est jamais caché derrière lui (WCAG 2.4.11) : il s'écarte aussi, sans s'effacer.
    if (!unChamp && !e.target.matches(":focus-visible")) return;
    champ = e.target;
    saisie = unChamp && matchMedia("(pointer: coarse)").matches;
    effacement();
    degager();
  });
  document.addEventListener("focusout", (e) => {
    if (e.target !== champ) return;
    champ = null;
    zoneDuChamp = null;
    saisie = false;
    effacement();
  });
  window.addEventListener(
    "scroll",
    () => {
      degager();
      planifierLeRegard();
      // La page passe sous lui pendant le défilement ; à la fin, il regarde s'il couvre quelque chose.
      defileA = performance.now();
      carteAJour = false;
      window.clearTimeout(finDuDefilement);
      finDuDefilement = window.setTimeout(() => planifierLaVerification(), FIN_DU_DEFILEMENT_MS);
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    mesurer();
    if (pret) dessiner();
    planifierLeRegard();
    regarderLaFenetre();
    carteAJour = false;
    planifierLaVerification(FIN_DU_DEFILEMENT_MS);
  });
  // La page qui change de taille (un bloc chargé, une police) : ce qui est sous lui a pu changer.
  if (typeof ResizeObserver === "function")
    new ResizeObserver(() => {
      carteAJour = false;
      planifierLaVerification(400);
    }).observe(document.body);
  window.visualViewport?.addEventListener("resize", regarderLaFenetre);
  // Une fenêtre d'appel qui s'ouvre (posée dans <body>), un obstacle marqué : il regarde de nouveau.
  new MutationObserver(planifierLeRegard).observe(document.body, { childList: true });
  new MutationObserver(planifierLeRegard).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-compagnon-obstacle"] });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) arreter();
    else {
      dernierGeste = performance.now();
      relancer();
    }
  });
  window.addEventListener("pagehide", garderLaPlace);

  // Retour arrière : le navigateur rend la page telle qu'on l'a quittée. Ce qui a changé depuis, sur les autres pages, fait
  // foi : sa place, en prison ou non, suivre ou non, la tenue (une déconnexion, un passage au village).
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    range = lire("localStorage", CLE_RANGE) === "1";
    suit = lire("localStorage", CLE_POSE) !== "1";
    fermer(false);
    arreter();
    ecart = null;
    glisse = false;
    delete boite.dataset.glisse;
    montrer();
    if (pret && !range) {
      mesurer();
      reprendreLaPlace();
      dernierGeste = performance.now();
      repos = "debout";
      dessiner();
      regarderLesObstacles();
      regarderLaFenetre();
    }
    veiller();
    void preparer();
  });

  // La pause de l'en-tête et « réduire les animations » : il s'arrête net, debout, sans disparaître.
  const calmer = (): void => {
    if (calme()) {
      arreter();
      ecart = null;
      repos = "debout";
      image.classList.remove("compagnon-saut");
      if (pret) dessiner();
    } else relancer();
    veiller();
  };
  new MutationObserver(calmer).observe(racine, { attributes: true, attributeFilter: ["class"] });
  mouvementReduit.addEventListener("change", calmer);

  /* ---------- La tenue ---------- */

  // Déconnecté (ici ou ailleurs), ou un autre compte : rien du membre ne reste, ni tenue gardée ni image peinte.
  void surveillerLeCompte((changement) => {
    if (changement === "parti") {
      montree = "";
      image.style.backgroundImage = "";
      prisonnier.style.backgroundImage = "";
      lit.style.backgroundImage = "";
      fermer(false);
      montrer();
    }
    void preparer();
  });

  /* ---------- Démarrage ---------- */

  function demarrer(): void {
    mesurer();
    reprendreLaPlace();
    pret = true;
    dernierGeste = performance.now();
    if (!range) boite!.dataset.passe = "1";
    montrer();
    dessiner();
    veiller();
    regarderLesObstacles();
    regarderLaFenetre();
    apparaitre();
  }

  /**
   * Il apparaît en fondu une fois la page chargée (ses images gardées dans l'onglet le prêtent avant), et les entrées de
   * ses blocs, de ses titres et de ses lignes finies : elles partent d'une opacité nulle et glissent de quelques pixels
   * (`fx.ts`), et il se posait sur un titre ou un tableau juste avant qu'ils ne paraissent. Il apparaît à la place libre
   * la plus proche de la sienne, choisie sur la page finie ; s'il a un salut à dire, à une place où sa bulle tient aussi.
   */
  function apparaitre(): void {
    const seMontrer = (): void => {
      if (apparu) return;
      apparu = true;
      preparerLeSalut();
      if (!range) {
        mesurer();
        const c = carteDuMoment(true);
        const pourSaluer = salut ? placePourSaluer(ancreEnPlace(), c, bornes, cote, fenetreDeLaBulle(), tailleDeLaBulle(salut.texte, false)) : null;
        const libre = pourSaluer ?? placeDeRepos(ancreEnPlace(), c, bornes, cote, hauteurFenetre()).place;
        marcheur = marcheurA(libre.x, libre.y, marcheur.vers);
        dessiner();
      }
      delete boite!.dataset.passe;
      if (salut) window.setTimeout(essayerDeSaluer, SALUT_APRES_MS + 50);
    };
    const auCalme = (): void => {
      const ensuite = (): void => void finDesEntrees().then(seMontrer);
      if ("requestIdleCallback" in window) window.requestIdleCallback(ensuite, { timeout: 600 });
      else setTimeout(ensuite, 200);
    };
    if (document.readyState === "complete") auCalme();
    else window.addEventListener("load", auCalme, { once: true });
    // Une police chargée après lui déplace le texte : il regarde de nouveau.
    void document.fonts.ready.then(() => {
      carteAJour = false;
      planifierLaVerification();
    });
  }

  /** Les entrées en cours sur la page (animations finies, hors de lui et de sa prison) : on les attend, `ENTREES_MAX_MS` au plus. */
  async function finDesEntrees(): Promise<void> {
    if (typeof document.getAnimations !== "function") return;
    const enCours = document.getAnimations().filter((a) => {
      if (a.playState !== "running") return false;
      const cible = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      if (!cible || boite!.contains(cible) || prison!.contains(cible)) return false;
      const fin = a.effect?.getComputedTiming().endTime;
      return typeof fin === "number" && Number.isFinite(fin);
    });
    if (enCours.length === 0) return;
    await Promise.race([Promise.allSettled(enCours.map((a) => a.finished)), new Promise((fin) => setTimeout(fin, ENTREES_MAX_MS))]);
  }

  /** Son salut, une seule fois par onglet, et seulement si les animations sont permises : rien ne change tout seul en pause. */
  function preparerLeSalut(): void {
    if (range || calme() || lire("sessionStorage", CLE_SALUE) === "1") return;
    salut = { texte: REPLIQUES[suivante()] ?? "", des: performance.now() + SALUT_APRES_MS };
  }

  function poserLesImages(images: ImagesGardees): void {
    montree = images.cle;
    deDepart = images.deDepart;
    image!.style.backgroundImage = `url("${images.gaulois}")`;
    prisonnier!.style.backgroundImage = `url("${images.gaulois}")`;
    lit!.style.backgroundImage = `url("${images.lit}")`;
    if (!pret) demarrer();
    else montrer();
  }

  /**
   * L'habille : les images gardées pour cette tenue ; pour le Gaulois de départ, celles peintes à la construction du site
   * (`data-depart-gaulois`, `data-depart-lit`) ; sinon peintes une fois, le dessin du Gaulois chargé à la demande.
   */
  async function habiller(brute: unknown): Promise<void> {
    const cle = `${VERSION_DES_IMAGES}.${versionDuDessin}:${cleDeLaTenue(brute)}`;
    const numero = ++habillage;
    if (montree === cle) return;
    const gardees = imagesGardees(cle);
    if (gardees) return poserLesImages(gardees);
    const { departGaulois, departLit } = boite!.dataset;
    if ((brute === null || brute === undefined) && departGaulois && departLit) {
      try {
        // Chargées avant d'être montrées : il n'apparaît pas vide. Gardées ensuite par le navigateur.
        await Promise.all(
          [departGaulois, departLit].map((adresse) => {
            const planche = new Image();
            planche.src = adresse;
            return planche.decode();
          }),
        );
        if (numero !== habillage) return;
        const images: ImagesGardees = { cle, gaulois: departGaulois, lit: departLit, deDepart: true };
        ecrire("sessionStorage", CLE_IMAGES, JSON.stringify(images));
        return poserLesImages(images);
      } catch {
        // Images introuvables : il est peint dans le navigateur, comme celui d'un membre.
        if (numero !== habillage) return;
      }
    }
    try {
      const { dessinDuCompagnon } = await import("../lib/compagnon/dessin");
      if (numero !== habillage) return;
      const dessin = dessinDuCompagnon(brute);
      if (dessin.gaulois.largeur !== CASES_L || dessin.gaulois.hauteur !== CASES_H || dessin.gaulois.images.length !== NOMBRE_D_IMAGES) return;
      if (dessin.lit.largeur !== LIT_L || dessin.lit.hauteur !== LIT_H) return;
      const images: ImagesGardees = {
        cle,
        gaulois: peindre(dessin.gaulois.largeur, dessin.gaulois.hauteur, dessin.gaulois.images),
        lit: peindre(dessin.lit.largeur, dessin.lit.hauteur, dessin.lit.images),
        deDepart: dessin.deDepart,
      };
      if (!images.gaulois || !images.lit) return;
      ecrire("sessionStorage", CLE_IMAGES, JSON.stringify(images));
      poserLesImages(images);
    } catch {
      // Le dessin ne s'est pas chargé : pas de compagnon sur cette page (ou il garde sa tenue), le site reste entier.
    }
  }

  /**
   * La tenue de cette page, puis l'habillage. Tenue gardée dans l'onglet : tout de suite. Première page d'un membre
   * connecté : la réponse du serveur, attendue au plus `ATTENTE_DU_SERVEUR_MS`, pour ne pas montrer d'abord le Gaulois
   * de départ ; au-delà, celui de départ, rhabillé dès la réponse.
   */
  async function preparer(): Promise<void> {
    const besoin = besoinDeCettePage();
    if (!besoin.lire) return habiller(besoin.tenue);
    // Une lecture déjà en route (la page et le suivi de la session la demandent parfois ensemble) : on l'attend, sans en refaire une.
    const lecture = (enLecture ??= lireLaTenue(false)
      .then((gardee) => (gardee ? gardee.tenue : null))
      .finally(() => {
        enLecture = null;
      }));
    if (!besoin.attendre) {
      void habiller(besoin.tenue);
      return habiller(await lecture);
    }
    const trop = Symbol("trop long");
    const premiere = await Promise.race([lecture, new Promise<typeof trop>((fin) => window.setTimeout(() => fin(trop), ATTENTE_DU_SERVEUR_MS))]);
    if (premiere !== trop) return habiller(premiere);
    void habiller(null);
    return habiller(await lecture);
  }

  montrer();
  // Dehors ou en prison, il est habillé dès que la page est tranquille ; tout de suite si ses images sont déjà peintes.
  if (lire("sessionStorage", CLE_IMAGES)) void preparer();
  else if ("requestIdleCallback" in window) window.requestIdleCallback(() => void preparer(), { timeout: 2_000 });
  else setTimeout(() => void preparer(), 300);
}

init();
