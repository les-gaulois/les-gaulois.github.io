/**
 * Le Gaulois compagnon : le Gaulois du village, en pixels, qui suit le visiteur sur toute la fenêtre, de page en page
 * (demande du pilote, 14 novembre 2026 : d'abord au bas de la fenêtre, puis « sur tout l'écran »). Rangé, il attend dans
 * une petite prison, au coin bas gauche ; un clic l'en sort. Balisage : `src/components/GauloisCompagnon.astro`.
 * Calculs, testés : `src/lib/compagnon/` (mouvement, répliques, tenue ; la prison, dessin de Claude Fable 5.2, dans
 * `prison.ts`). Style : la dernière section de `global.css`.
 *
 * Léger sur chaque page : ce script ne contient ni Supabase ni le dessin du Gaulois. Le dessin (`gaulois.ts`, lourd) est
 * dans `src/lib/compagnon/dessin.ts`, chargé à la demande une seule fois par onglet : ses images, une fois peintes,
 * sont gardées dans l'onglet (`sessionStorage`), et les pages suivantes le montrent tout de suite, sans rien charger.
 * La tenue d'un membre connecté est lue au serveur une fois par onglet (`src/lib/compagnon/tenue.ts`) ; Supabase n'est
 * chargé que s'il y a une session, comme pour l'en-tête.
 *
 * Décoratif : il n'affiche aucune donnée. Pause de l'en-tête (`fx-off`) ou « réduire les animations » : il ne suit plus
 * et ne marche plus, il reste debout à sa place ; on peut toujours lui parler, le déplacer et le mettre en prison.
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
  horsDesZones,
  imageDeMarche,
  marcheurA,
  margeDuBord,
  nullePart,
  placeAcoteDuCurseur,
  placeDeDepart,
  placeDeLaBulle,
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
 * Ce qui est fixé sur la fenêtre et qu'il ne couvre jamais : tout élément marqué `data-compagnon-obstacle`, la barre
 * « Enregistrer » du vestiaire quand elle reste collée en bas (`Vestiaire.tsx`), les fenêtres des appels du QG
 * (`AppelsGaulois.tsx`). Il se tient à côté ; s'il ne tient nulle part, il s'efface le temps qu'ils restent. Sa prison
 * remonte au-dessus d'eux.
 */
const OBSTACLES = "[data-compagnon-obstacle], .vestiaire-envoi[data-colle], [data-testid='appels-popups']";

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

function init(): void {
  const racine = document.documentElement;
  // La Carte tient dans l'écran, sans pied de page : il n'y vient pas, et attend à la page suivante. Une déconnexion faite
  // là (fenêtre « Alliance ») efface quand même ce qui reste du membre dans l'onglet.
  if (document.body.dataset.route === "/carte") {
    // Sans session, ce qui reste du membre dans l'onglet s'efface aussi ici, comme sur les autres pages.
    besoinDeCettePage();
    void surveillerLeCompte(() => undefined);
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
  const auVillage = chemin.replace(/\/$/, "") === "/village";
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
    // Le bas de l'écran d'un téléphone à encoche : `scroll-margin-bottom` porte `env(safe-area-inset-bottom)` (global.css).
    const sol = Number.parseFloat(getComputedStyle(boite!).scrollMarginBottom) || 0;
    bornes = { gauche: marge, droite: largeurFenetre() - largeur - marge, haut: plafond() + 4, bas: hauteurFenetre() - hauteur - sol };
    boite!.style.setProperty("--case", `${cote}px`);
    prison!.style.setProperty("--case", `${echelleDeLaPrison(window.devicePixelRatio).cote}px`);
    if (parts !== null) marcheur = { ...marcheur, x: depuisPart(parts.x, bornes.gauche, bornes.droite), y: depuisPart(parts.y, bornes.haut, bornes.bas) };
  }

  /** La dernière place écrite : un mouvement de souris qui ne le fait pas bouger n'écrit rien. */
  let placeEcrite = "";
  function garderLaPlace(): void {
    if (!pret) return;
    const place = JSON.stringify({ part: enPart(marcheur.x, bornes.gauche, bornes.droite), partY: enPart(marcheur.y, bornes.haut, bornes.bas), vers: marcheur.vers });
    if (place === placeEcrite) return;
    placeEcrite = place;
    ecrire("sessionStorage", CLE_PLACE, place);
  }

  /** Sa place gardée dans l'onglet (d'une page à l'autre, et au retour arrière) ; sinon sa place de départ. */
  function reprendreLaPlace(): void {
    const debut = placeDeDepart(bornes);
    let depart = marcheurA(debut.x, debut.y);
    try {
      const garde = JSON.parse(lire("sessionStorage", CLE_PLACE) ?? "null") as { part?: unknown; partY?: unknown; vers?: unknown } | null;
      if (garde && typeof garde.part === "number") {
        // Une place gardée avant qu'il ne marche sur toute la fenêtre : au bas, comme alors.
        const partY = typeof garde.partY === "number" ? garde.partY : 1;
        depart = marcheurA(depuisPart(garde.part, bornes.gauche, bornes.droite), depuisPart(partY, bornes.haut, bornes.bas), garde.vers === -1 ? -1 : 1);
      }
    } catch {
      // Place illisible : il repart de sa place de départ.
    }
    marcheur = depart;
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
   * fenêtre la place gardée sous le pied de page (global.css) la laisse au-dessus de lui, et s'il se tient ailleurs sur
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

  function placerLaBulle(): void {
    // Trop haut pour elle au-dessus de lui (sous l'en-tête), elle passe dessous, s'il y a plus de place.
    const verticale = { hauteur: bulle!.offsetHeight, dessus: marcheur.y + 3 * cote - (bornes.haut - 4), dessous: hauteurFenetre() - (marcheur.y + hauteur - cote) };
    const place = placeDeLaBulle(marcheur.x + largeur / 2, bulle!.offsetWidth, largeurFenetre(), verticale);
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
    // Au doigt : le coin bas du côté touché. À la souris : à côté du curseur, où qu'il soit.
    const voulue = auDoigt ? coinDuCote(visiteur.x, largeurFenetre(), bornes) : placeAcoteDuCurseur(visiteur, marcheur, largeur, hauteur, bornes);
    const laMention = zoneDeLaMention();
    const aEviter = laMention ? [...zones(), laMention] : zones();
    const libre = aEviter.length > 0 ? (horsDesZones(voulue, largeur, hauteur, aEviter, bornes) ?? voulue) : voulue;
    return { place: libre, allure: auDoigt ? "rejoindre" : "suivre" };
  }

  function pasDeTemps(maintenant: number): void {
    const dt = maintenant - image0;
    image0 = maintenant;
    const but = cible();
    const precis = but.allure === "ecarter";
    marcheur = avancer(marcheur, but.place, dt, bornes, but.allure);
    if (marcheur.enMarche) reveiller(maintenant);
    if (precis && !marcheur.enMarche) ecart = null;
    dessiner();
    let attend = false;
    if (but.place !== null && !precis) {
      const voulue = bornerLaPlace(but.place, bornes);
      attend = Math.hypot(voulue.x - marcheur.x, voulue.y - marcheur.y) > seuilDeDepart(but.allure);
    }
    boucle = marcheur.enMarche || attend || (precis && ecart !== null) ? requestAnimationFrame(pasDeTemps) : 0;
    if (!boucle) garderLaPlace();
  }

  function relancer(): void {
    if (boucle || !pret || range || document.hidden) return;
    image0 = performance.now();
    boucle = requestAnimationFrame(pasDeTemps);
  }

  function arreter(): void {
    if (boucle) cancelAnimationFrame(boucle);
    boucle = 0;
    marcheur = avancer(marcheur, null, 0, bornes);
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
      if (marcheur.enMarche || bulleOuverte || glisse) return;
      const maintenant = performance.now();
      const suite = reposApres(maintenant - dernierGeste);
      if (suite === "dort" && repos !== "dort") dortDepuis = maintenant;
      if (suite !== repos || suite === "dort") {
        repos = suite;
        dessiner();
      }
    }, 1_250);
  }

  /* ---------- Bulle ---------- */

  function dire(texte: string, lien: boolean): void {
    if (efface()) return;
    window.clearTimeout(fermeture);
    reveiller();
    arreter();
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
    delete boite!.dataset.bulle;
    gaulois!.setAttribute("aria-expanded", "false");
    if ((rendreLeFocus || dedans) && !efface()) gaulois!.focus({ preventScroll: true });
    dernierGeste = performance.now();
    relancer();
  }

  function parler(geste?: Geste): void {
    const invite = deDepart && !auVillage;
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

  /** La prison remonte au-dessus de ce qui est fixé au coin bas gauche de la fenêtre (la barre du vestiaire, un appel). */
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
    // En marche vers une place libre, il ne fait que passer dessus : il n'est écarté qu'une fois arrêté.
    if (barre || toutes.length === 0 || (marcheur.enMarche && ecart === null)) return;
    const libre = horsDesZones(marcheur, largeur, hauteur, toutes, bornes);
    if (libre) allerA(libre);
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
   * Un clic sur la prison : il en sort, en bas à gauche, à côté d'elle (ou à la place libre la plus proche, si quelque
   * chose y est fixé), prend le focus et remercie. La prison ne se montre qu'une fois ses images posées : il est prêt.
   */
  function liberer(): void {
    if (!pret) return;
    range = false;
    ecrire("localStorage", CLE_RANGE, null);
    mesurer();
    const depart = placeDeDepart(bornes);
    const sortie = horsDesZones(depart, largeur, hauteur, zonesFixees, bornes) ?? depart;
    marcheur = marcheurA(sortie.x, sortie.y);
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
    garderLaPlace();
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
    garderLaPlace();
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
    const but = horsDesZones(marcheur, largeur, hauteur, zones(), bornes);
    if (but !== null) allerA(but);
  }
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
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    mesurer();
    if (pret) dessiner();
    planifierLeRegard();
    regarderLaFenetre();
  });
  window.visualViewport?.addEventListener("resize", regarderLaFenetre);
  // Une barre qui se colle au bas de la page, une fenêtre d'appel qui s'ouvre (posée dans <body>) : il regarde de nouveau.
  new MutationObserver(planifierLeRegard).observe(document.body, { childList: true });
  new MutationObserver(planifierLeRegard).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-colle", "data-compagnon-obstacle"] });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) arreter();
    else {
      dernierGeste = performance.now();
      relancer();
    }
  });
  window.addEventListener("pagehide", () => {
    garderLaPlace();
    // En quittant le village, où la tenue a pu changer (vestiaire, marché) : la page suivante la relira, une fois.
    if (auVillage) marquerUnPassageAuVillage();
  });

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

  // Le vestiaire vient d'enregistrer une tenue : il la met aussitôt (sinon, à la page suivante), en prison comme dehors.
  window.addEventListener(
    EVENEMENT_ENREGISTRE,
    (e) => {
      const tenue = recevoirLaTenue((e as CustomEvent<unknown>).detail, auVillage);
      if (tenue !== undefined) void habiller(tenue);
    },
    true,
  );

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
    montrer();
    dessiner();
    veiller();
    regarderLesObstacles();
    regarderLaFenetre();
    // Son salut, une seule fois par onglet, et seulement si les animations sont permises : rien ne change tout seul en pause.
    if (!range && !calme() && lire("sessionStorage", CLE_SALUE) !== "1") {
      ecrire("sessionStorage", CLE_SALUE, "1");
      window.setTimeout(() => {
        if (!range && !bulleOuverte && !glisse && !calme() && !document.hidden) dire(REPLIQUES[suivante()] ?? "", false);
      }, 1_600);
    }
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
    const lecture = (enLecture ??= lireLaTenue(auVillage)
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
