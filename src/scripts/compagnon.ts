/**
 * Le Gaulois compagnon : le Gaulois du village, en pixels, qui suit le visiteur au bas de la fenêtre, de page en page
 * (demande du pilote, 14 novembre 2026). Balisage : `src/components/GauloisCompagnon.astro`. Calculs, testés :
 * `src/lib/compagnon/` (mouvement, répliques, tenue). Style : la dernière section de `global.css`.
 *
 * Léger sur chaque page : ce script ne contient ni Supabase ni le dessin du Gaulois. Le dessin (`gaulois.ts`, lourd) est
 * dans `src/lib/compagnon/dessin.ts`, chargé à la demande une seule fois par onglet : ses images, une fois peintes,
 * sont gardées dans l'onglet (`sessionStorage`), et les pages suivantes le montrent tout de suite, sans rien charger.
 * La tenue d'un membre connecté est lue au serveur une fois par onglet (`src/lib/compagnon/tenue.ts`) ; Supabase n'est
 * chargé que s'il y a une session, comme pour l'en-tête.
 *
 * Décoratif : il n'affiche aucune donnée. Pause de l'en-tête (`fx-off`) ou « réduire les animations » : il ne suit plus
 * et ne marche plus, il reste debout à sa place ; on peut toujours lui parler, le déplacer et le ranger.
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
  depuisPart,
  ecarterDuChamp,
  echelleDuCompagnon,
  enPart,
  fenetreGenee,
  imageDeMarche,
  marcheurA,
  margeDuBord,
  placeDeDepart,
  placeDeLaBulle,
  reposApres,
  solLibre,
  souffleA,
  coinDuCote,
  seuilDeDepart,
  type Allure,
  type Marcheur,
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

/** Dans ce navigateur : rangé, et posé à la main (il ne suit plus). */
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
 * Ce qui est fixé au bas de la fenêtre et qu'il ne couvre jamais : tout élément marqué `data-compagnon-obstacle`, la barre
 * « Enregistrer » du vestiaire quand elle reste collée en bas (`Vestiaire.tsx`), les fenêtres des appels du QG
 * (`AppelsGaulois.tsx`). Il se tient à côté ; s'il ne tient nulle part, il s'efface le temps qu'ils restent.
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

function init(): void {
  const racine = document.documentElement;
  // La Carte tient dans l'écran, sans pied de page ni sol libre : il n'y vient pas, et attend à la page suivante. Une
  // déconnexion faite là (fenêtre « Alliance ») efface quand même ce qui reste du membre dans l'onglet.
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
  const rappel = document.querySelector<HTMLElement>("[data-compagnon-rappel]");
  const boutonRevenir = rappel?.querySelector<HTMLButtonElement>("[data-compagnon-revenir]");
  if (!boite || !gaulois || !image || !lit || !bulle || !parole || !village || !boutonSuivre || !boutonRanger || !rappel || !boutonRevenir) return;

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

  // Sans session, ce qui reste du membre dans l'onglet s'efface dès l'ouverture de la page, même s'il est rangé.
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
  let min = 0;
  let max = 0;
  /** La part du sol libre quand quelque chose est fixé au bas de la fenêtre ; `null` : tout le sol. */
  let libre: { min: number; max: number } | null = null;
  let marcheur: Marcheur = marcheurA(0);
  /** Où est le visiteur : le curseur, ou le dernier endroit touché. `null` tant qu'il n'a pas bougé. */
  let visiteurX: number | null = null;
  let auDoigt = false;
  /** Où aller pour dégager un champ de saisie, ou ce qui est fixé au bas de la fenêtre. */
  let ecart: number | null = null;
  let champ: HTMLElement | null = null;
  /** Ce qui l'efface : une saisie sur écran tactile, le clavier du téléphone ou la page agrandie, une barre sur toute la largeur. */
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
  /** Rappelé depuis un bouton « Faire revenir le Gaulois » : le focus va sur lui dès qu'il est là. */
  let focusALArrivee = false;

  const calme = (): boolean => racine.classList.contains("fx-off") || mouvementReduit.matches;
  const efface = (): boolean => saisie || fenetrePetite || barre;
  /** Les bords du sol où il peut aller : toute la largeur, moins ce qui est fixé en bas. */
  const gauche = (): number => libre?.min ?? min;
  const droite = (): number => libre?.max ?? max;
  const borner = (x: number): number => Math.min(Math.max(x, gauche()), Math.max(gauche(), droite()));

  /* ---------- Taille et place ---------- */

  function mesurer(): void {
    const part = pret ? enPart(marcheur.x, min, max) : null;
    const echelle = echelleDuCompagnon(window.innerWidth, window.devicePixelRatio);
    cote = echelle.cote;
    largeur = CASES_L * cote;
    min = margeDuBord(cote);
    max = document.documentElement.clientWidth - largeur - min;
    boite!.style.setProperty("--case", `${cote}px`);
    if (part !== null) marcheur = { ...marcheur, x: depuisPart(part, min, max) };
  }

  /** La dernière place écrite : un mouvement de souris qui ne le fait pas bouger n'écrit rien. */
  let placeEcrite = "";
  function garderLaPlace(): void {
    if (!pret) return;
    const place = JSON.stringify({ part: enPart(marcheur.x, min, max), vers: marcheur.vers });
    if (place === placeEcrite) return;
    placeEcrite = place;
    ecrire("sessionStorage", CLE_PLACE, place);
  }

  /** Sa place gardée dans l'onglet (d'une page à l'autre, et au retour arrière) ; sinon sa place de départ. */
  function reprendreLaPlace(): void {
    let depart = marcheurA(placeDeDepart(min, max));
    try {
      const garde = JSON.parse(lire("sessionStorage", CLE_PLACE) ?? "null") as { part?: unknown; vers?: unknown } | null;
      if (garde && typeof garde.part === "number") depart = marcheurA(depuisPart(garde.part, min, max), garde.vers === -1 ? -1 : 1);
    } catch {
      // Place illisible : il repart de sa place de départ.
    }
    marcheur = depart;
  }

  /* ---------- Dessin ---------- */

  function dessiner(): void {
    // Sur un pixel entier de l'écran : le dessin reste net.
    const dpr = window.devicePixelRatio || 1;
    boite!.style.transform = `translate3d(${Math.round(marcheur.x * dpr) / dpr}px, 0, 0)`;
    boite!.dataset.vers = marcheur.vers === 1 ? "droite" : "gauche";
    let pose: { image: number; leve: boolean } = { image: IMAGES.debout, leve: false };
    if (marcheur.enMarche) pose = imageDeMarche(marcheur.pasMs);
    else if (repos === "somnole") pose = { image: IMAGES.yeuxFermes, leve: false };
    image!.style.setProperty("--image", String(pose.image));
    image!.dataset.leve = pose.leve ? "1" : "0";
    boite!.dataset.pose = marcheur.enMarche ? "marche" : repos;
    if (repos === "dort") lit!.style.setProperty("--image", String(souffleA(performance.now() - dortDepuis)));
    if (bulleOuverte) placerLaBulle();
  }

  function placerLaBulle(): void {
    const place = placeDeLaBulle(marcheur.x + largeur / 2, bulle!.offsetWidth, document.documentElement.clientWidth);
    bulle!.style.setProperty("--bulle-x", `${place.gauche - marcheur.x}px`);
    bulle!.style.setProperty("--queue", `${place.queue}px`);
  }

  /* ---------- Marche ---------- */

  /** Sa cible : dégager un champ ou le bas de la fenêtre d'abord ; sinon le visiteur, s'il le suit et que rien ne le retient. */
  function cible(): { x: number | null; allure: Allure } {
    if (efface()) return { x: null, allure: "suivre" };
    if (ecart !== null) return { x: ecart, allure: "ecarter" };
    if (calme() || !suit || glisse || bulleOuverte || visiteurX === null) return { x: null, allure: "suivre" };
    // Au doigt : le coin du côté touché. À la souris : à côté du curseur.
    if (auDoigt) return { x: coinDuCote(visiteurX, document.documentElement.clientWidth, gauche(), droite()), allure: "rejoindre" };
    return { x: visiteurX - largeur / 2, allure: "suivre" };
  }

  function pasDeTemps(maintenant: number): void {
    const dt = maintenant - image0;
    image0 = maintenant;
    const but = cible();
    // Pour s'écarter, il marche depuis là où il est, même sur ce qu'il quitte : jamais de saut d'une place à l'autre.
    const precis = but.allure === "ecarter";
    marcheur = precis ? avancer(marcheur, but.x, dt, min, max, but.allure) : avancer(marcheur, but.x, dt, gauche(), droite(), but.allure);
    if (marcheur.enMarche) reveiller(maintenant);
    if (precis && !marcheur.enMarche) ecart = null;
    dessiner();
    const attend = but.x !== null && !precis && Math.abs(borner(but.x) - marcheur.x) > seuilDeDepart(but.allure);
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
    marcheur = avancer(marcheur, null, 0, min, max);
  }

  /** Il va tout de suite à `but` : en marchant, ou d'un coup en pause et pendant un glisser. */
  function allerA(but: number): void {
    if (Math.abs(but - marcheur.x) < 0.5) return;
    fermer(false);
    if (calme() || glisse || efface()) {
      arreter();
      marcheur = marcheurA(but, marcheur.vers);
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
      // De temps en temps, il regarde aussi le bas de la fenêtre : une barre a pu y venir sans prévenir.
      regarderLeBas();
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

  /** Il s'efface (le temps d'une saisie au doigt, du clavier du téléphone, d'une barre sur toute la largeur), puis revient. */
  function effacement(): void {
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

  // Un élément fixé au bas de la fenêtre dont la taille change (une fenêtre d'appel qui s'allonge) : il regarde de nouveau.
  const tailles = typeof ResizeObserver === "function" ? new ResizeObserver(() => planifierLeRegard()) : null;
  const suivis = new WeakSet<Element>();

  /** Ce qui est fixé au bas de la fenêtre, à la hauteur de son corps : il se tient à côté, ou s'efface s'il n'y tient pas. */
  function regarderLeBas(): void {
    if (!pret || range) return;
    const hauteur = window.innerHeight;
    const haut = hauteur - CASES_H * cote - 12;
    const zones: { gauche: number; droite: number }[] = [];
    for (const obstacle of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
      if (boite!.contains(obstacle)) continue;
      if (tailles && !suivis.has(obstacle)) {
        suivis.add(obstacle);
        tailles.observe(obstacle);
      }
      const cadre = obstacle.getBoundingClientRect();
      if (cadre.width < 1 || cadre.height < 1 || cadre.bottom <= haut || cadre.top >= hauteur) continue;
      zones.push({ gauche: cadre.left, droite: cadre.right });
    }
    const sol = zones.length > 0 ? solLibre(marcheur.x, largeur, zones, min, max) : null;
    libre = sol;
    barre = zones.length > 0 && sol === null;
    effacement();
    if (sol && (marcheur.x < sol.min || marcheur.x > sol.max)) allerA(borner(marcheur.x));
  }

  function planifierLeRegard(): void {
    if (regard || !pret) return;
    regard = requestAnimationFrame(() => {
      regard = 0;
      regarderLeBas();
    });
  }

  /** Le clavier d'un téléphone ouvert, ou la page agrandie du bout des doigts : il s'efface (`fenetreGenee`). */
  function regarderLaFenetre(): void {
    fenetrePetite = fenetreGenee(window.innerHeight, window.visualViewport);
    effacement();
  }

  /* ---------- Ranger, revenir ---------- */

  /** Les rappels « Faire revenir le Gaulois » : au bas du pied de page, et au village, sous le titre. */
  function rappels(): NodeListOf<HTMLElement> {
    return document.querySelectorAll<HTMLElement>("[data-compagnon-rappel]");
  }

  function montrer(): void {
    boite!.hidden = range || !pret || montree === "";
    for (const ligne of rappels()) ligne.hidden = !range;
  }

  function ranger(): void {
    fermer(false);
    arreter();
    range = true;
    ecrire("localStorage", CLE_RANGE, "1");
    montrer();
    veiller();
    boutonRevenir!.focus({ preventScroll: true });
  }

  function revenir(): void {
    range = false;
    ecrire("localStorage", CLE_RANGE, null);
    focusALArrivee = true;
    if (!pret) return void preparer();
    montrer();
    veiller();
    dernierGeste = performance.now();
    dessiner();
    regarderLeBas();
    regarderLaFenetre();
    arriver();
  }

  /** Rappelé : le focus va sur lui, s'il est là et visible. */
  function arriver(): void {
    if (!focusALArrivee || boite!.hidden) return;
    focusALArrivee = false;
    if (!efface()) gaulois!.focus({ preventScroll: true });
  }

  function choisirDeSuivre(oui: boolean): void {
    suit = oui;
    ecrire("localStorage", CLE_POSE, oui ? null : "1");
  }

  /* ---------- Gestes du visiteur ---------- */

  // Glisser : il se déplace à la main, de gauche à droite, et reste où on le pose.
  let prise: { id: number; x0: number; depart: number; bouge: boolean } | null = null;
  let clicAvale = false;
  gaulois.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    prise = { id: e.pointerId, x0: e.clientX, depart: marcheur.x, bouge: false };
    gaulois.setPointerCapture(e.pointerId);
  });
  gaulois.addEventListener("pointermove", (e) => {
    if (!prise || e.pointerId !== prise.id) return;
    const dx = e.clientX - prise.x0;
    if (!prise.bouge && Math.abs(dx) < 6) return;
    if (!prise.bouge) {
      prise.bouge = true;
      glisse = true;
      fermer(false);
      arreter();
      reveiller();
      boite.dataset.glisse = "1";
    }
    marcheur = { ...marcheurA(borner(prise.depart + dx), dx < 0 ? -1 : 1) };
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

  // Au clavier : les flèches le déplacent, comme un glisser.
  gaulois.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    fermer(false);
    arreter();
    reveiller();
    const vers = e.key === "ArrowLeft" ? -1 : 1;
    marcheur = marcheurA(borner(marcheur.x + vers * 24), vers);
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
  // Tout bouton « Faire revenir le Gaulois » de la page, celui du pied de page comme celui du village.
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-compagnon-revenir]")) revenir();
  });

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
    visiteurX = e.clientX;
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
    const cadre = champ.getBoundingClientRect();
    const haut = window.innerHeight - CASES_H * cote - 12;
    if (cadre.bottom < haut || cadre.top > window.innerHeight) return;
    const but = ecarterDuChamp(marcheur.x, largeur, { gauche: cadre.left, droite: cadre.right }, gauche(), droite());
    if (but !== null) allerA(but);
  }
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof HTMLElement) || boite.contains(e.target)) return;
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
  // Une barre qui se colle au bas de la page, une fenêtre d'appel qui s'ouvre (posée dans <body>) : il regarde le bas.
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
  // foi : sa place, rangé ou non, suivre ou non, la tenue (une déconnexion, un passage au village).
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
    if (range) return veiller();
    if (pret) {
      mesurer();
      reprendreLaPlace();
      dernierGeste = performance.now();
      repos = "debout";
      dessiner();
      veiller();
      regarderLeBas();
      regarderLaFenetre();
    }
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

  // Le vestiaire vient d'enregistrer une tenue : il la met aussitôt (sinon, à la page suivante).
  window.addEventListener(
    EVENEMENT_ENREGISTRE,
    (e) => {
      const tenue = recevoirLaTenue((e as CustomEvent<unknown>).detail, auVillage);
      if (tenue !== undefined && !range) void habiller(tenue);
    },
    true,
  );

  // Déconnecté (ici ou ailleurs), ou un autre compte : rien du membre ne reste, ni tenue gardée ni image peinte.
  void surveillerLeCompte((changement) => {
    if (changement === "parti") {
      montree = "";
      image.style.backgroundImage = "";
      lit.style.backgroundImage = "";
      fermer(false);
      montrer();
    }
    if (!range) void preparer();
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
    regarderLeBas();
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
    lit!.style.backgroundImage = `url("${images.lit}")`;
    if (!pret) demarrer();
    else montrer();
    arriver();
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
        await Promise.all([departGaulois, departLit].map((adresse) => {
          const planche = new Image();
          planche.src = adresse;
          return planche.decode();
        }));
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

  // Au village, le rappel est aussi sous le titre : on y vient pour lui.
  if (auVillage) {
    const tete = document.querySelector("main .page-tete") ?? document.querySelector("main h1")?.closest("header");
    if (tete) {
      const ligne = document.createElement("div");
      ligne.className = "compagnon-rappel-village";
      ligne.dataset.compagnonRappel = "";
      ligne.hidden = true;
      ligne.append(boutonRevenir.cloneNode(true));
      tete.after(ligne);
    }
  }

  montrer();
  // Rangé : rien n'est chargé. Sinon, dès que la page est tranquille ; tout de suite si ses images sont déjà peintes.
  if (range) return;
  if (lire("sessionStorage", CLE_IMAGES)) void preparer();
  else if ("requestIdleCallback" in window) window.requestIdleCallback(() => void preparer(), { timeout: 2_000 });
  else setTimeout(() => void preparer(), 300);
}

init();
