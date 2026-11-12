/**
 * Le guerrier de l'accueil en relief : ses caractères deviennent un nuage de points, chacun à sa profondeur, sur une
 * toile posée sur le dessin. Il tourne la tête vers le curseur, le suit du regard, et parle dans une petite bulle.
 * Chargé par `fx.ts` sur la seule page d'accueil, et mené par sa boucle : décoratif, comme tous les effets. Sans ce
 * script, avec « réduire les animations » ou avec le bouton pause, le dessin à plat reste, et la bulle ne paraît pas.
 *
 * Rien n'est écrit deux fois dans la page : la grille, les couleurs et la police se lisent sur le dessin lui-même
 * (`LogoMatrice.tsx`). Les calculs sont dans `src/lib/fx/holo.ts`, les répliques dans `src/lib/fx/repliques.ts`.
 */
import { damp } from "../lib/fx/camera";
import { HOLO, OEIL, decalageTranche, eclat, eclatTranche, flanc, flaner, nuageDe, oeilLibre, orienter, placer, projectionDe, projeter, projeterPoint, regard, reliefDe, tourComplet, viser, type Pose } from "../lib/fx/holo";
import { FRAPPE_MS, PREMIERE_MS, REACTIONS, decouper, dureeReplique, pauseAvant, repliquesPour, tirage, type Reaction } from "../lib/fx/repliques";

export interface Holo {
  /** Le curseur est à cet endroit de la fenêtre : la tête se tourne vers lui. */
  viser(x: number, y: number): void;
  /** Le curseur a quitté la page : la tête regarde de nouveau autour d'elle. */
  lacher(): void;
  /** Une image de la boucle des effets, `dt` secondes après la précédente. */
  image(dt: number): void;
  /** Le tour complet du clic droit. Faux tant que le relief n'a pas pris le relais du dessin. */
  tour(): boolean;
  /** Une réplique en réponse à un geste. */
  reagir(geste: Reaction): void;
  /** Le bouton pause : le dessin à plat revient, la bulle se tait. */
  veille(): void;
  reveil(): void;
}

/** Ce que les tests lisent sur la toile : la pose dessinée, en degrés, et si un tour complet est en cours. */
export interface ToileHolo extends HTMLCanvasElement {
  pose?: { lacet: number; tangage: number; roulis: number; tour: boolean };
}

const TEINTES = ["w", "b", "r"] as const;
/** La toile dépasse du dessin de cette part de sa largeur, de chaque côté : rien n'est coupé quand la tête tourne. */
const MARGE = 0.1;
/** Les caractères sont préparés deux fois plus grands que dessinés : ils restent nets entre deux pixels. */
const SUR = 2;
const BORD = 2;
/** La tête suit sa cible comme un ressort amorti, sans à-coup ; le regard la précède. */
const SUIVI_MS = 300;
const REGARD_MS = 110;
const TOUR_MS = 1_600;
/** Le temps que prend la chute des colonnes à l'ouverture de la page, retards compris, avec un peu de marge. */
const CHUTE_MS = 3_000;
/** Au toucher, la tête regarde l'endroit touché pendant ce temps, puis reprend sa flânerie. */
const TOUCHER_MS = 3_500;
/**
 * Sans curseur, la tête flâne si lentement (moins d'un tiers de pixel par image) qu'une image sur trois lui suffit :
 * vingt par seconde sur un écran à 60 images. Le seuil est un peu sous les 50 ms de trois images, pour ne pas en
 * attendre une quatrième à cause d'un arrondi.
 */
const FLANERIE_IMAGE_MS = 45;
/** L'aura est dessinée six fois plus petite que la toile : elle n'est qu'une lueur floue. */
const AURA_REDUIT = 6;
/**
 * Une machine lente : si dessiner la tête lui prend plus de 7 ms en moyenne, elle passe pour de bon au régime
 * économe, sans flancs et à une image sur quatre (quinze par seconde), même quand la tête suit le curseur.
 */
const LOURD_MS = 7;
const ECONOME_IMAGE_MS = 60;
/** Au réveil, la toile remplace le dessin en fondu (même durée dans global.css, `.holo-toile`), puis le regard s'allume en douceur. */
const FONDU_S = 0.4;
const ALLUMAGE_S = 0.9;
/** Le curseur sur le casque : à moins de cette part de la largeur du centre, une fois, et pas dès le réveil. */
const SURVOL = 0.3;
const SURVOL_APRES_S = 2.5;
const REACTION_ECART_MS = 5_000;

interface Logo {
  colonnes: number;
  lignes: number;
  /** Le numéro de case de chaque caractère, et son image dans la planche : caractère × 3 + teinte. */
  cases: number[];
  signes: number[];
  /** Où le navigateur a posé chaque caractère dans sa case, depuis son bord gauche, en parts de case. */
  ecarts: number[];
  glyphes: string[];
  couleurs: string[];
  plein: Uint8Array;
  /** La police du dessin : sa taille et sa ligne de base en parts de case. */
  police: { poids: string; famille: string; taille: number; base: number };
}

/**
 * Lit la grille du guerrier sur son dessin : une case par caractère, sa teinte par sa classe. Et la vraie place de
 * chaque caractère : le dessin étale chaque suite sur sa longueur (`textLength`), et le navigateur ne pose pas les
 * caractères au bord gauche de leur case (jusqu'à 0,22 case d'écart, mesuré). La toile les repose où ils sont.
 */
function lireLogo(svg: SVGSVGElement): Logo | null {
  const vue = svg.viewBox.baseVal;
  const colonnes = svg.querySelectorAll(".console-goutte").length;
  const textes = [...svg.querySelectorAll<SVGTextElement>("text")];
  const premier = textes[0];
  if (!colonnes || !vue.width || !premier) return null;
  const pas = vue.width / colonnes;
  const lignes = Math.round(vue.height / pas);
  const plein = new Uint8Array(colonnes * lignes);
  const cases: number[] = [];
  const signes: number[] = [];
  const ecarts: number[] = [];
  const glyphes: string[] = [];
  const couleurs = ["", "", ""];
  let base = 0;
  for (const texte of textes) {
    const teinte = TEINTES.findIndex((t) => texte.classList.contains(`console-logo-${t}`));
    const y = Number(texte.getAttribute("y"));
    const colonne = Math.round(Number(texte.getAttribute("x")) / pas);
    const ligne = Math.floor(y / pas);
    if (teinte < 0 || !Number.isFinite(y) || ligne < 0 || ligne >= lignes) continue;
    base = y / pas - ligne;
    if (!couleurs[teinte]) couleurs[teinte] = getComputedStyle(texte).fill;
    [...(texte.textContent ?? "")].forEach((caractere, i) => {
      const x = colonne + i;
      if (x < 0 || x >= colonnes) return;
      let glyphe = glyphes.indexOf(caractere);
      if (glyphe < 0) glyphe = glyphes.push(caractere) - 1;
      // Un navigateur qui ne sait pas dire où est un caractère : au bord gauche de sa case. Jamais hors d'elle.
      let ecart = 0;
      try {
        ecart = texte.getStartPositionOfChar(i).x / pas - x;
      } catch {
        ecart = 0;
      }
      plein[ligne * colonnes + x] = 1;
      cases.push(ligne * colonnes + x);
      signes.push(glyphe * 3 + teinte);
      ecarts.push(Number.isFinite(ecart) ? Math.min(0.5, Math.max(-0.5, ecart)) : 0);
    });
  }
  if (cases.length === 0) return null;
  const style = getComputedStyle(premier);
  return { colonnes, lignes, cases, signes, ecarts, glyphes, couleurs, plein, police: { poids: style.fontWeight, famille: style.fontFamily, taille: parseFloat(style.fontSize) / pas, base } };
}

/** Le relief autour de l'œil : la moyenne des cases pleines voisines. La pupille est posée là, au creux de la fente. */
function reliefOeil(relief: Float32Array, colonnes: number, lignes: number): number {
  const cx = Math.floor(OEIL.x * colonnes);
  const cy = Math.floor(OEIL.y * colonnes);
  let somme = 0;
  let nombre = 0;
  for (let y = Math.max(0, cy - 3); y <= Math.min(lignes - 1, cy + 3); y++) {
    for (let x = Math.max(0, cx - 3); x <= Math.min(colonnes - 1, cx + 3); x++) {
      const z = relief[y * colonnes + x] ?? 0;
      if (z > 0) {
        somme += z;
        nombre++;
      }
    }
  }
  return nombre ? (somme / nombre) * 0.9 : 0;
}

/** Prépare le guerrier en relief. `null` si le dessin n'est pas là, ou pas affiché (contraste élevé). */
export function monterHolo(el: HTMLElement): Holo | null {
  const svg = el.querySelector<SVGSVGElement>("svg.holo-logo");
  if (!svg || el.clientWidth === 0 || svg.getBoundingClientRect().width === 0) return null;
  const logo = lireLogo(svg);
  if (!logo) return null;
  // Quatre toiles : celle qu'on voit ; la copie de sa face, pour en reposer les tranches du flanc ; la planche des
  // caractères ; la pupille. Et l'aura, fixe : la lueur large du dessin, qu'on ne recalcule pas à chaque image.
  const toile: ToileHolo = document.createElement("canvas");
  const aura = document.createElement("canvas");
  const face = document.createElement("canvas");
  const planche = document.createElement("canvas");
  const pupille = document.createElement("canvas");
  const ctx = toile.getContext("2d");
  const halo = aura.getContext("2d");
  const trait = face.getContext("2d");
  const encre = planche.getContext("2d");
  const lueur = pupille.getContext("2d");
  if (!ctx || !halo || !trait || !encre || !lueur) return null;
  toile.className = "holo-toile";
  aura.className = "holo-aura";
  toile.setAttribute("aria-hidden", "true");
  aura.setAttribute("aria-hidden", "true");
  el.append(aura, toile);

  const { colonnes, lignes, cases, signes, ecarts, glyphes, couleurs, police } = logo;
  const relief = reliefDe(logo.plein, colonnes, lignes);
  const nuage = nuageDe(cases, relief, colonnes);
  const vue = projectionDe(nuage.n);
  const m = new Float32Array(9);
  const aUnOeil = oeilLibre(logo.plein, colonnes, lignes);
  const creux = reliefOeil(relief, colonnes, lignes);
  // Les couleurs sont celles des jetons du site : le rouge du marqueur pour la pupille, le bleu du drapeau pour l'aura.
  const jeton = (nom: string): string => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
  const rouge = jeton("--color-red");
  const bleu = jeton("--color-flag-blue");
  // Le repère de la visée : la scène, qui ne flotte pas. Viser depuis le logo, qui flotte sans cesse, ferait
  // redessiner la tête à chaque image pour un curseur immobile.
  const scene = el.closest<HTMLElement>(".holo-scene") ?? el;

  /* ---------- La planche des caractères, et les toiles ---------- */

  let largeur = 0;
  let cote = 0;
  let unite = 0;
  let tuile = 0;

  function dresser(): void {
    largeur = el.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    unite = largeur * dpr;
    cote = Math.round(unite * (1 + 2 * MARGE));
    toile.width = cote;
    toile.height = cote;
    face.width = cote;
    face.height = cote;
    // L'aura : la silhouette du logo au repos, en bleu, à très basse résolution. Le flou est fait une fois, en CSS.
    const petit = Math.max(1, Math.round(cote / AURA_REDUIT));
    aura.width = petit;
    aura.height = petit;
    if (halo && bleu) {
      const case1 = (unite / colonnes / cote) * petit;
      const bord = ((cote - unite) / 2 / cote) * petit;
      halo.clearRect(0, 0, petit, petit);
      halo.fillStyle = bleu;
      for (const c of cases) halo.fillRect(bord + (c % colonnes) * case1, bord + Math.floor(c / colonnes) * case1, case1, case1);
    }
    const pas = (unite / colonnes) * SUR;
    tuile = Math.ceil(pas) + 2 * BORD;
    planche.width = tuile * glyphes.length;
    planche.height = tuile * 3;
    if (!encre || !lueur) return;
    encre.clearRect(0, 0, planche.width, planche.height);
    encre.font = `${police.poids} ${police.taille * pas}px ${police.famille}`;
    encre.textBaseline = "alphabetic";
    couleurs.forEach((couleur, teinte) => {
      encre.fillStyle = couleur || "#fff";
      glyphes.forEach((glyphe, i) => encre.fillText(glyphe, i * tuile + BORD, teinte * tuile + BORD + police.base * pas));
    });
    // La pupille : un point blanc au cœur, rouge autour, le marqueur du site, qui s'éteint vers son bord.
    const rayon = Math.max(4, Math.ceil(OEIL.rayon * unite));
    pupille.width = rayon * 2;
    pupille.height = rayon * 2;
    const eclatant = lueur.createRadialGradient(rayon, rayon, 0, rayon, rayon, rayon);
    eclatant.addColorStop(0, "#fff");
    eclatant.addColorStop(0.2, "#fff");
    eclatant.addColorStop(0.45, rouge || "#fff");
    eclatant.addColorStop(1, "transparent");
    lueur.clearRect(0, 0, rayon * 2, rayon * 2);
    lueur.fillStyle = eclatant;
    lueur.fillRect(0, 0, rayon * 2, rayon * 2);
  }

  /* ---------- L'état ---------- */

  const pose: Pose = { lacet: 0, tangage: 0, roulis: 0 };
  const elan: Pose = { lacet: 0, tangage: 0, roulis: 0 };
  /** La pupille : sa place sur le dessin, son élan, et sa lumière de 0 à 1. */
  const oeil: { u: number; v: number; eu: number; ev: number; allume: number } = { u: OEIL.x, v: OEIL.y, eu: 0, ev: 0, allume: 0 };
  const dessine = { lacet: NaN, tangage: NaN, roulis: NaN, u: NaN, v: NaN, allume: NaN };
  const curseur = { x: 0, y: 0, suivi: false, reste: Infinity, souris: false };
  let pret = false;
  let vif = false;
  let dort = false;
  let visible = true;
  let flanerie = 0;
  let depuisDessin = 0;
  /** Le temps moyen d'un dessin, en millisecondes, et le régime économe qu'il déclenche. */
  let cout = 0;
  let econome = false;
  let avancee = -1;
  let eveil = 0;
  let survole = false;

  function dessiner(lacet: number): void {
    if (!ctx || !trait) return;
    orienter({ lacet, tangage: pose.tangage, roulis: pose.roulis }, m);
    projeter(nuage, m, vue);
    const centre = cote / 2;
    const pas = unite / colonnes;
    const demi = pas / 2 + BORD / SUR;
    const taille = tuile / SUR;
    // La face du logo : chaque caractère à sa place dans sa case, celle du dessin, plus pâle s'il s'éloigne.
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, cote, cote);
    for (let i = 0; i < nuage.n; i++) {
      const e = vue.echelle[i] ?? 1;
      const signe = signes[i] ?? 0;
      ctx.globalAlpha = eclat(vue.avance[i] ?? 0);
      ctx.drawImage(planche, Math.floor(signe / 3) * tuile, (signe % 3) * tuile, tuile, tuile, centre + (vue.x[i] ?? 0) * unite + ((ecarts[i] ?? 0) * pas - demi) * e, centre + (vue.y[i] ?? 0) * unite - demi * e, taille * e, taille * e);
    }
    // Puis le flanc : la face, recopiée à part, est reposée en tranches décalées derrière elle ; devant elle quand on
    // voit le logo de dos. De face, les tranches sont exactement derrière leur caractère : on ne les dessine pas, et
    // la face n'est pas recopiée. Une machine lente s'en passe toujours.
    const cotes = econome ? 0 : flanc(m, largeur);
    if (cotes > 0) {
      trait.clearRect(0, 0, cote, cote);
      trait.drawImage(toile, 0, 0);
      ctx.globalCompositeOperation = (m[8] ?? 1) < 0 ? "source-over" : "destination-over";
      for (let k = 1; k <= HOLO.tranches; k++) {
        const [dx, dy] = decalageTranche(m, k);
        ctx.globalAlpha = cotes * eclatTranche(k);
        ctx.drawImage(face, dx * unite, dy * unite);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    if (aUnOeil && oeil.allume > 0) {
      const [x, y, z] = placer(oeil.u, oeil.v, creux);
      const [px, py, e, avance] = projeterPoint(x, y, z, m);
      const rayon = (pupille.width / 2) * e;
      // La lumière de la pupille s'ajoute à ce qu'elle touche, comme dans un hologramme.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = oeil.allume * eclat(avance);
      ctx.drawImage(pupille, centre + px * unite - rayon, centre + py * unite - rayon, rayon * 2, rayon * 2);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
    const degres = (angle: number): number => Math.round((angle * 1800) / Math.PI) / 10;
    toile.pose = { lacet: degres(lacet), tangage: degres(pose.tangage), roulis: degres(pose.roulis), tour: avancee >= 0 };
    Object.assign(dessine, pose, { lacet, u: oeil.u, v: oeil.v, allume: oeil.allume });
  }

  /* ---------- La bulle ---------- */

  const bulle = scene.querySelector<HTMLElement>("[data-holo-bulle]");
  // Sans souris, il ne dit pas qu'il suit le curseur.
  const repliques = repliquesPour(matchMedia("(hover: hover) and (pointer: fine)").matches);
  const suivante = tirage(repliques.length, Math.random);
  let parle = false;
  let horloge = PREMIERE_MS;
  let dites = 0;
  let derniereReaction: Reaction | null = null;
  let depuisReaction = 0;

  function dire(replique: string): void {
    if (!bulle) return;
    const { commande, parole } = decouper(replique);
    let rang = 0;
    const ecrire = (dans: HTMLElement, texte: string): void => {
      for (const caractere of texte) {
        const lettre = document.createElement("span");
        lettre.className = "holo-lettre";
        lettre.style.animationDelay = `${rang++ * FRAPPE_MS}ms`;
        lettre.textContent = caractere;
        dans.append(lettre);
      }
    };
    const lignes: HTMLSpanElement[] = [];
    if (commande) {
      const tapee = document.createElement("span");
      tapee.className = "holo-commande";
      ecrire(tapee, commande);
      lignes.push(tapee);
    }
    // Le curseur de la machine, un pavé fixe, se pose quand la réplique est écrite. Il tient à son dernier mot : il ne
    // passe jamais seul à la ligne.
    const dite = document.createElement("span");
    dite.className = "holo-parole";
    const coupe = parole.lastIndexOf(" ") + 1;
    const fin = document.createElement("span");
    fin.className = "holo-fin";
    ecrire(dite, parole.slice(0, coupe));
    ecrire(fin, parole.slice(coupe));
    const pave = document.createElement("span");
    pave.className = "holo-lettre holo-pave";
    pave.style.animationDelay = `${rang * FRAPPE_MS}ms`;
    fin.append(pave);
    dite.append(fin);
    lignes.push(dite);
    bulle.replaceChildren(...lignes);
    bulle.classList.add("parle");
    parle = true;
    horloge = dureeReplique(replique);
  }

  function taire(): void {
    bulle?.classList.remove("parle");
    if (parle) dites++;
    parle = false;
    horloge = pauseAvant(dites);
  }

  /* ---------- Le réveil et la veille ---------- */

  // Le relief prend le relais du dessin une fois ses colonnes tombées, et sa police chargée. Un navigateur qui ne
  // dit rien de cette chute : on lui laisse le temps qu'elle prend depuis l'ouverture de la page. Les colonnes
  // retombent quand le bouton pause relance les animations : on les guette de nouveau, et seule la dernière attente compte.
  let attente = 0;
  function guetter(): void {
    const tour = ++attente;
    pret = false;
    const chute = svg?.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)) ?? [];
    const delai = new Promise<void>((fini) => window.setTimeout(fini, chute.length ? 0 : Math.max(0, CHUTE_MS - performance.now())));
    void Promise.all([...chute, delai, document.fonts.load(`${police.poids} 13px ${police.famille}`).catch(() => undefined)]).then(() => {
      if (tour === attente) pret = true;
    });
  }
  guetter();

  new ResizeObserver(() => {
    if (vif && el.clientWidth !== largeur && el.clientWidth > 0) {
      dresser();
      dessiner(dessine.lacet || 0);
    }
  }).observe(el);
  new IntersectionObserver((entrees) => {
    visible = entrees[entrees.length - 1]?.isIntersecting ?? visible;
  }).observe(el);

  function eveiller(): void {
    dresser();
    dessiner(0);
    el.dataset.holo = "vif";
    vif = true;
    eveil = 0;
    // La bulle est prête dès le réveil, encore invisible : sa première réplique paraît ainsi en fondu, comme les autres.
    if (bulle) bulle.hidden = false;
  }

  function reagir(geste: Reaction): void {
    if (!vif || (geste === derniereReaction && depuisReaction < REACTION_ECART_MS)) return;
    // Une fois qu'on l'a touché, il ne prévient plus de ne pas toucher : sa réponse au clic ne serait plus lue.
    if (geste !== "survol") survole = true;
    derniereReaction = geste;
    depuisReaction = 0;
    dire(REACTIONS[geste]);
  }

  // Au toucher, pas de curseur à suivre : la tête regarde un moment l'endroit touché.
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!vif || e.pointerType === "mouse") return;
      Object.assign(curseur, { x: e.clientX, y: e.clientY, suivi: true, reste: TOUCHER_MS, souris: false });
    },
    { passive: true },
  );

  return {
    viser(x, y) {
      Object.assign(curseur, { x, y, suivi: true, reste: Infinity, souris: true });
    },
    lacher() {
      curseur.suivi = false;
    },
    tour() {
      if (!vif) return false;
      if (avancee < 0) avancee = 0;
      return true;
    },
    reagir,
    veille() {
      dort = true;
      vif = false;
      el.dataset.holo = "";
      ctx.clearRect(0, 0, cote, cote);
      Object.assign(pose, { lacet: 0, tangage: 0, roulis: 0 });
      Object.assign(elan, { lacet: 0, tangage: 0, roulis: 0 });
      Object.assign(oeil, { u: OEIL.x, v: OEIL.y, eu: 0, ev: 0, allume: 0 });
      avancee = -1;
      curseur.suivi = false;
      if (bulle) {
        bulle.classList.remove("parle");
        bulle.replaceChildren();
        bulle.hidden = true;
      }
      parle = false;
      horloge = PREMIERE_MS;
    },
    reveil() {
      if (!dort) return;
      dort = false;
      guetter();
    },
    image(dt) {
      if (dort || !pret || !visible) return;
      if (!vif) eveiller();
      const ms = dt * 1000;
      const cadre = scene.getBoundingClientRect();
      if (cadre.width === 0) return;
      eveil += dt;
      depuisReaction += ms;

      // Où regarder : le curseur s'il est là, sinon autour de soi.
      let cible: Pose;
      let versU: number;
      let versV: number;
      if (curseur.suivi && (curseur.reste -= ms) <= 0) curseur.suivi = false;
      if (eveil < FONDU_S) {
        // Le temps que la toile remplace le dessin, en fondu : la tête ne bouge pas, les deux se superposent.
        cible = { lacet: 0, tangage: 0, roulis: 0 };
        [versU, versV] = [OEIL.x, OEIL.y];
      } else if (curseur.suivi) {
        // La scène est aussi large que le logo, et un peu plus haute (son socle) : tout se compte en largeurs.
        const dx = (curseur.x - (cadre.left + cadre.width / 2)) / cadre.width;
        const dy = (curseur.y - (cadre.top + cadre.width / 2)) / cadre.width;
        cible = viser(dx, dy);
        [versU, versV] = regard((curseur.x - (cadre.left + OEIL.x * cadre.width)) / cadre.width, (curseur.y - (cadre.top + OEIL.y * cadre.width)) / cadre.width);
        if (curseur.souris && !survole && eveil > SURVOL_APRES_S && Math.hypot(dx, dy) < SURVOL) {
          survole = true;
          reagir("survol");
        }
      } else {
        flanerie += dt;
        cible = flaner(flanerie);
        [versU, versV] = regard(Math.sin(cible.lacet) * 2, -Math.sin(cible.tangage) * 2);
      }
      [pose.lacet, elan.lacet] = damp(pose.lacet, cible.lacet, elan.lacet, SUIVI_MS, ms);
      [pose.tangage, elan.tangage] = damp(pose.tangage, cible.tangage, elan.tangage, SUIVI_MS, ms);
      [pose.roulis, elan.roulis] = damp(pose.roulis, cible.roulis, elan.roulis, SUIVI_MS, ms);
      [oeil.u, oeil.eu] = damp(oeil.u, versU, oeil.eu, REGARD_MS, ms);
      [oeil.v, oeil.ev] = damp(oeil.v, versV, oeil.ev, REGARD_MS, ms);
      if (eveil >= FONDU_S) oeil.allume = Math.min(1, oeil.allume + dt / ALLUMAGE_S);
      if (avancee >= 0 && (avancee += ms / TOUR_MS) >= 1) avancee = -1;

      // On ne redessine que ce qui a bougé ; et la flânerie, très lente, une image sur trois : c'est elle qui tourne
      // sans fin sur un téléphone.
      const lacet = pose.lacet + (avancee >= 0 ? tourComplet(avancee) : 0);
      const bouge =
        Math.abs(lacet - dessine.lacet) > 2e-4 ||
        Math.abs(pose.tangage - dessine.tangage) > 2e-4 ||
        Math.abs(pose.roulis - dessine.roulis) > 2e-4 ||
        Math.abs(oeil.u - dessine.u) > 1e-4 ||
        Math.abs(oeil.v - dessine.v) > 1e-4 ||
        oeil.allume !== dessine.allume;
      depuisDessin += ms;
      const presse = econome ? depuisDessin >= ECONOME_IMAGE_MS : curseur.suivi || avancee >= 0 || oeil.allume < 1 || depuisDessin >= FLANERIE_IMAGE_MS;
      if (bouge && presse) {
        depuisDessin = 0;
        const debut = performance.now();
        dessiner(lacet);
        cout += (performance.now() - debut - cout) * 0.1;
        if (cout > LOURD_MS) econome = true;
      }

      if (bulle && (horloge -= ms) <= 0) {
        if (parle) taire();
        else dire(repliques[suivante()] ?? repliques[0] ?? "");
      }
    },
  };
}
