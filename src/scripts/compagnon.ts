/**
 * Le Gaulois compagnon : le Gaulois du village, en pixels, qui suit le visiteur au bas de la fenêtre, de page en page
 * (demande du pilote, 14 novembre 2026). Balisage : `src/components/GauloisCompagnon.astro`. Calculs, testés :
 * `src/lib/compagnon/` (mouvement, répliques). Style : la dernière section de `global.css`.
 *
 * Léger sur chaque page : ce script ne contient ni Supabase ni le dessin du Gaulois. Le dessin (`gaulois.ts`, lourd) est
 * dans `src/lib/compagnon/dessin.ts`, chargé à la demande une seule fois par onglet : ses images, une fois peintes,
 * sont gardées dans l'onglet (`sessionStorage`), et les pages suivantes le montrent tout de suite, sans rien charger.
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
  imageDeMarche,
  marcheurA,
  margeDuBord,
  placeDeDepart,
  placeDeLaBulle,
  reposApres,
  souffleA,
  DEPART,
  type Marcheur,
  type Repos,
} from "../lib/compagnon/mouvement";
import { REPLIQUES, REPLIQUES_DES_GESTES, dureeDeLaBulle, ponctuer, repliqueDuClic, rubriqueDe, type Geste } from "../lib/compagnon/repliques";
import { tenueBruteDuCompagnon } from "../lib/compagnon/tenue";

/** Dans ce navigateur : rangé, et posé à la main (il ne suit plus). */
const CLE_RANGE = "gal-compagnon-range";
const CLE_POSE = "gal-compagnon-pose";
/** Dans cet onglet : où il était, ses images peintes, et s'il a déjà salué. */
const CLE_PLACE = "gal-compagnon-place";
const CLE_IMAGES = "gal-compagnon-images";
const CLE_SALUE = "gal-compagnon-salue";
/** À changer quand la forme des images gardées change. */
const VERSION_DES_IMAGES = 1;

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

function init(): void {
  const racine = document.documentElement;
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
  // La Carte tient dans l'écran, sans pied de page ni sol libre : il n'y vient pas, et attend à la page suivante.
  if (document.body.dataset.route === "/carte") return;
  const rubrique = rubriqueDe(chemin);
  const auVillage = chemin.replace(/\/$/, "") === "/village";
  const suivante = tirage(REPLIQUES.length, Math.random);

  let range = lire("localStorage", CLE_RANGE) === "1";
  let suit = lire("localStorage", CLE_POSE) !== "1";
  let pret = false;
  let deDepart = true;
  let cote = 2;
  let largeur = CASES_L * cote;
  let min = 0;
  let max = 0;
  let marcheur: Marcheur = marcheurA(0);
  /** Où est le visiteur : le curseur, ou le dernier endroit touché. `null` tant qu'il n'a pas bougé. */
  let visiteurX: number | null = null;
  /** Où aller pour dégager un champ de saisie. */
  let ecart: number | null = null;
  let champ: HTMLElement | null = null;
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

  const calme = (): boolean => racine.classList.contains("fx-off") || mouvementReduit.matches;

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

  function garderLaPlace(): void {
    if (pret) ecrire("sessionStorage", CLE_PLACE, JSON.stringify({ part: enPart(marcheur.x, min, max), vers: marcheur.vers }));
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

  /** Sa cible : dégager un champ d'abord ; sinon le visiteur, s'il le suit et que rien ne le retient. */
  function cible(): { x: number | null; precis: boolean } {
    if (ecart !== null) return { x: ecart, precis: true };
    if (calme() || !suit || glisse || bulleOuverte || visiteurX === null) return { x: null, precis: false };
    return { x: visiteurX - largeur / 2, precis: false };
  }

  function pasDeTemps(maintenant: number): void {
    const dt = maintenant - image0;
    image0 = maintenant;
    const but = cible();
    marcheur = avancer(marcheur, but.x, dt, min, max, but.precis);
    if (marcheur.enMarche) reveiller(maintenant);
    if (but.precis && !marcheur.enMarche) ecart = null;
    dessiner();
    const attend = but.x !== null && !but.precis && Math.abs(but.x - marcheur.x) > DEPART;
    boucle = marcheur.enMarche || attend || (but.precis && ecart !== null) ? requestAnimationFrame(pasDeTemps) : 0;
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
      if (document.hidden || marcheur.enMarche || bulleOuverte || glisse) return;
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
    if (rendreLeFocus || dedans) gaulois!.focus({ preventScroll: true });
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

  /* ---------- Ranger, revenir ---------- */

  function montrer(): void {
    boite!.hidden = range || !pret;
    rappel!.hidden = !range;
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
    if (!pret) return void preparer();
    montrer();
    veiller();
    dernierGeste = performance.now();
    dessiner();
    gaulois!.focus({ preventScroll: true });
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
    marcheur = { ...marcheurA(Math.min(Math.max(prise.depart + dx, min), max), dx < 0 ? -1 : 1) };
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
    marcheur = marcheurA(Math.min(Math.max(marcheur.x + vers * 24, min), max), vers);
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
  boutonRevenir.addEventListener("click", revenir);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bulleOuverte) fermer(boite.contains(document.activeElement));
  });
  document.addEventListener("pointerdown", (e) => {
    if (bulleOuverte && !boite.contains(e.target as Node)) fermer(false);
  });

  // Le visiteur : le curseur d'une souris, ou l'endroit touché.
  const suivre = (e: PointerEvent): void => {
    if (boite.contains(e.target as Node)) return;
    visiteurX = e.clientX;
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

  // Un champ en cours de saisie n'est jamais couvert : il s'écarte ; sur un écran tactile, où le clavier prend la place,
  // il s'efface le temps de la saisie.
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
    const but = ecarterDuChamp(marcheur.x, largeur, { gauche: cadre.left, droite: cadre.right }, min, max);
    if (but === null) return;
    fermer(false);
    if (calme()) {
      marcheur = marcheurA(but, marcheur.vers);
      dessiner();
      garderLaPlace();
    } else {
      ecart = but;
      relancer();
    }
  }
  document.addEventListener("focusin", (e) => {
    if (!estUnChamp(e.target) || boite.contains(e.target)) return;
    champ = e.target;
    if (matchMedia("(pointer: coarse)").matches) boite.dataset.efface = "1";
    degager();
  });
  document.addEventListener("focusout", (e) => {
    if (e.target !== champ) return;
    champ = null;
    delete boite.dataset.efface;
  });
  window.addEventListener("scroll", () => degager(), { passive: true });

  window.addEventListener("resize", () => {
    mesurer();
    if (pret) dessiner();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) arreter();
    else {
      dernierGeste = performance.now();
      relancer();
    }
  });
  window.addEventListener("pagehide", garderLaPlace);

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

  /* ---------- Démarrage ---------- */

  function poser(images: ImagesGardees): void {
    deDepart = images.deDepart;
    image!.style.backgroundImage = `url("${images.gaulois}")`;
    lit!.style.backgroundImage = `url("${images.lit}")`;
    mesurer();
    let depart = marcheurA(placeDeDepart(min, max));
    try {
      const garde = JSON.parse(lire("sessionStorage", CLE_PLACE) ?? "null") as { part?: unknown; vers?: unknown } | null;
      if (garde && typeof garde.part === "number") depart = marcheurA(depuisPart(garde.part, min, max), garde.vers === -1 ? -1 : 1);
    } catch {
      // Place illisible : il repart de sa place de départ.
    }
    marcheur = depart;
    pret = true;
    dernierGeste = performance.now();
    montrer();
    dessiner();
    veiller();
    // Son salut, une seule fois par onglet, et seulement si les animations sont permises : rien ne change tout seul en pause.
    if (!range && !calme() && lire("sessionStorage", CLE_SALUE) !== "1") {
      ecrire("sessionStorage", CLE_SALUE, "1");
      window.setTimeout(() => {
        if (!range && !bulleOuverte && !glisse && !calme() && !document.hidden) dire(REPLIQUES[0] ?? "", false);
      }, 1_600);
    }
  }

  async function preparer(): Promise<void> {
    const brute = tenueBruteDuCompagnon();
    const cle = `${VERSION_DES_IMAGES}:${JSON.stringify(brute)}`;
    try {
      const gardees = JSON.parse(lire("sessionStorage", CLE_IMAGES) ?? "null") as ImagesGardees | null;
      if (gardees && gardees.cle === cle && typeof gardees.gaulois === "string" && typeof gardees.lit === "string") return poser(gardees);
    } catch {
      // Images illisibles : elles sont refaites.
    }
    try {
      const { dessinDuCompagnon } = await import("../lib/compagnon/dessin");
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
      poser(images);
    } catch {
      // Le dessin ne s'est pas chargé : pas de compagnon sur cette page, le site reste entier.
    }
  }

  montrer();
  // Rangé : rien n'est chargé. Sinon, dès que la page est tranquille.
  if (range) return;
  if (lire("sessionStorage", CLE_IMAGES)) void preparer();
  else if ("requestIdleCallback" in window) window.requestIdleCallback(() => void preparer(), { timeout: 2_000 });
  else setTimeout(() => void preparer(), 300);
}

init();
