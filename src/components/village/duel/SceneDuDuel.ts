/**
 * La scène du duel « Coup pour coup » (22 novembre 2026), reprise de la maquette validée par le pilote (« j'aime
 * beaucoup », Claude Fable 5.2) : les deux Gaulois devant la bannière du lieu, leurs familiers, la vie en cœur et en barre,
 * l'énergie en pierres, la main de cinq cartes qui vit (repos, survol, inclinaison, saisie, lâcher), l'aperçu avant de
 * poser, la carte d'en face posée face cachée, la révélation, les coups qui portent (le Gaulois recule, le chiffre saute, le
 * son claque), les mots-clés qui s'allument l'un après l'autre, le saignement, la fatigue, la chute, la fin ; le premier
 * duel guidé en quatre bulles. Tout tient dans un écran de téléphone.
 *
 * La scène ne décide d'aucune règle : chaque manche est jouée par le moteur partagé (`moteur.ts`), la machine choisit sa
 * carte avant le joueur, sans voir la sienne. Elle n'envoie rien au serveur : un duel d'entraînement se joue dans la page.
 *
 * Mouvement coupé (bouton pause du jeu, `fx-off`, ou « réduire les animations ») : rien ne bouge, les coups se lisent sans
 * mouvement, le duel se joue pareil. Les sons (`sons-du-duel.ts`) suivent le réglage du son du jeu. Un lecteur d'écran
 * entend chaque manche racontée (`aria-live`), et chaque carte est un bouton nommé.
 */
import { motionAllowed } from "../../../lib/fx/motion";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, changerObjet, type Tenue } from "../../../lib/gaulois";
import { texteEnPixels, urlDeLaPlanche, type CouleurDEcriture, type ReliefDEcriture } from "../../../lib/jeu/dans-la-page";
import { ecrire, enCapitales, largeurDuTexte } from "../../../lib/jeu/ecriture";
import { PAL } from "../../../lib/jeu/palette";
import {
  IMAGE_DU_GESTE,
  MARGES,
  MILIEU_DU_GAULOIS,
  POSE_DE_REPOS,
  contactEntre,
  departDuProjectile,
  dessinsDuGaulois,
  distanceDElan,
  distancesDElanFaceAFace,
  dureeDuGeste,
  gesteDeLaCarte,
  imageDeLaPose,
  imageDuProjectile,
  instantDeLImpact,
  placeDuProjectile,
  poseDuGeste,
  type DessinsDuGaulois,
  type Geste,
  type ImageDuGeste,
  type Point,
  type Pose,
} from "../../../lib/jeu/gestes-armes";
import { Planche, R, cerne, grille, lireCouleur, rr } from "../../../lib/jeu/planche";
import { familierAPoser, type Familier } from "../../../lib/village/familiers";
import { CLE_DU_GUIDE, NOMS_DES_RANGS, type Role } from "../../../lib/village/ecran-duel";
import {
  AURAS,
  COEUR,
  MOTS_IC,
  ROLES,
  TONS_DU_THEME,
  coeurPlein,
  coeurVide,
  couleurDuMot,
  dosDeCarte,
  epeesCroisees,
  faceDeCarte,
  faceDePoche,
  goutte,
  iconeDeMot,
  iconeDeRole,
  puceDeCarte,
  tuileDeRole,
  type EtatDeCarte,
  type TonsDuTheme,
} from "./dessins-des-cartes";
import { dessinDeLaCarte, ficheDe, phraseDeLaCarte, type CampDuMoteur, type CarteDuMoteur, type FaitDuMoteur, type Fiche, type MancheDuMoteur, type MoteurDuDuel, type OptionsDUnCamp } from "./moteur";
import { SON, reveillerLeSon } from "./sons-du-duel";

/* ---------- Ce que la scène reçoit ---------- */

export interface CampAPoser {
  /** Le mot de son ruban : « TOI », « MACHINE », le nom d'un boss. */
  ruban: string;
  bleu: boolean;
  /** Son nom pour un lecteur d'écran : « Ton Gaulois ». */
  dit: string;
  main: readonly string[];
  tenue: Tenue;
  familier: Familier | null;
  options: OptionsDUnCamp;
  /** Des lignes de plus sous ses atouts (le pouvoir d'un boss). */
  plus?: readonly { gras: string; texte: string }[];
}

export interface LieuDuDuel {
  nom: string;
  /** L'effet du lieu, qui vaut pour les deux ; `null` s'il n'en a pas. */
  phrase: string | null;
  /** La bannière, en cases (124 sur 80), et la rangée des pieds. */
  banniere: { cases: readonly (string | null)[]; largeur: number; hauteur: number; pieds: number } | null;
}

export interface FinDuDuel {
  /** 1 : victoire ; -1 : défaite ; 0 : égalité. */
  verdict: number;
  manches: number;
  vieMoi: number;
  vieLui: number;
}

export interface OptionsDeLaScene {
  moteur: MoteurDuDuel;
  moi: CampAPoser;
  lui: CampAPoser;
  lieu: LieuDuDuel;
  /**
   * La machine du navigateur (duel d'entraînement) : elle choisit sa carte au début de la manche, avant le joueur, sans voir
   * la sienne. L'indice de sa carte.
   */
  choisir?: (moi: CampDuMoteur, lui: CampDuMoteur, m: number) => number;
  /**
   * Ou le serveur (duel compté, boss) : le joueur pose sa carte `ia` à la manche `m`, le serveur choisit celle de la machine
   * sans voir la sienne et rend son indice. Un refus rend la carte à la main.
   */
  jouer?: (ia: number, m: number) => Promise<number>;
  /** Les manches déjà jouées d'une partie reprise, [la mienne, la sienne] : la scène les rejoue sans les montrer. */
  reprise?: readonly (readonly [number, number])[];
  /** Un envoi au serveur a échoué : son message. */
  onErreur?: (e: unknown) => void;
  /** Avant le duel, une carte de la main se change : la fenêtre du choix s'ouvre (`changerCarte` y répond). `null` : main fixe. */
  changerUneCarte: ((i: number, main: readonly string[]) => void) | null;
  /** Le premier duel guidé, s'il n'a pas encore été vu sur l'appareil. */
  guide: boolean;
  /**
   * Un défi d'entraînement : les deux camps posés au départ (vie, énergie, repos…) et le numéro de la première manche ; la
   * carte d'en face, annoncée, se montre face visible ; `issue` dit après chaque manche si le défi est réussi, raté ou en
   * cours (la fin tombe dès qu'il n'est plus en cours). Sans bourse : la main du défi ne se change pas.
   */
  defi?: {
    depart: () => { a: CampDuMoteur; b: CampDuMoteur; m: number };
    annonce: boolean;
    issue: (a: CampDuMoteur, b: CampDuMoteur, fini: boolean, jouees: number) => "en-cours" | "reussi" | "rate";
  };
  /** Ce qu'on écrit sous le bilan de la fin (l'état d'un défi, d'un boss). */
  motDeFin?: (f: FinDuDuel) => string | null;
  onDebut?: () => void;
  onFin: (f: FinDuDuel) => void;
  onRejouer: () => void;
  onQuitter: () => void;
  /** La scène part sans le panneau « Entrer dans l'arène » : la main est fixée d'avance (un duel en salle). */
  entreeDirecte?: boolean;
  /** Les mots des deux boutons de la fin, s'ils en veulent d'autres que « Retour au duel » et « Rejouer ». */
  libelles?: { quitter?: string; rejouer?: string };
}

export interface SceneDuDuel {
  /** Pose une carte choisie dans la main, avant le duel. */
  changerCarte: (i: number, id: string) => void;
  /** La main du joueur, telle qu'elle est maintenant. */
  main: () => readonly string[];
  arreter: () => void;
  /**
   * Finit le duel tout de suite, avec le panneau de fin (en salle : l'autre n'a pas posé à temps, ou il est parti), même
   * pendant qu'une carte attend le serveur. `mot` remplace le mot de la fin ; `onFin` est appelé comme à toute fin.
   */
  interrompre: (verdict: -1 | 0 | 1, mot: string | null) => void;
}

/* ---------- Petits outils ---------- */

type Camp = "a" | "b";
const borne = (v: number, x = 0, y = 1): number => (v < x ? x : v > y ? y : v);
const entre = (x: number, y: number, t: number): number => x + (y - x) * t;

/** Une planche posée dans une toile, case pour case. */
function peindre(cv: HTMLCanvasElement, p: Planche): HTMLCanvasElement {
  if (cv.width !== p.width) cv.width = p.width;
  if (cv.height !== p.height) cv.height = p.height;
  const g = cv.getContext("2d");
  if (g) g.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return cv;
}
const toileDe = (p: Planche): HTMLCanvasElement => peindre(document.createElement("canvas"), p);
/** Les couleurs déjà lues, en un mot de 32 bits (rouge d'abord, comme les octets d'une `ImageData`). */
const MOTS_DES_COULEURS = new Map<string, number>();
/** Des cases posées dans une toile d'un coup : les images d'un geste changent à chaque instant. */
function peindreLesCases(cv: HTMLCanvasElement, cases: readonly (string | null)[], largeur: number, hauteur: number): void {
  if (cv.width !== largeur) cv.width = largeur;
  if (cv.height !== hauteur) cv.height = hauteur;
  const image = new ImageData(largeur, hauteur);
  const mots = new Uint32Array(image.data.buffer);
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!c) continue;
    let mot = MOTS_DES_COULEURS.get(c);
    if (mot === undefined) {
      const [r, v, b, a] = lireCouleur(c);
      mot = ((Math.round(a * 255) << 24) | (b << 16) | (v << 8) | r) >>> 0;
      MOTS_DES_COULEURS.set(c, mot);
    }
    mots[i] = mot;
  }
  cv.getContext("2d")?.putImageData(image, 0, 0);
}
/** Une part en pour cent, pour poser la toile d'un geste autour du Gaulois. */
const enPourCent = (n: number, sur: number): string => `${((n / sur) * 100).toFixed(4)}%`;
const cree = <K extends keyof HTMLElementTagNameMap>(tag: K, classe = "", parent?: HTMLElement): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  parent?.append(el);
  return el;
};

/** Un texte en pixels du kit, un mot par image, son texte pour les lecteurs d'écran (sauf `muet`). */
function ecrireEnPixels(el: HTMLElement, texte: string, couleur: CouleurDEcriture, o: { relief?: ReliefDEcriture; plie?: boolean; muet?: boolean } = {}): HTMLElement {
  el.textContent = "";
  el.classList.add("jeu-px");
  el.classList.toggle("jeu-px-plie", !!o.plie);
  el.classList.toggle("jeu-px-cerne", o.relief === "cerne");
  for (const m of texteEnPixels(texte, couleur, o.relief ?? "plat", o.plie)) {
    const i = cree("i", "", el);
    i.setAttribute("aria-hidden", "true");
    i.style.cssText = `--i:${m.clair};--i-sombre:${m.sombre};--w:${m.largeur};--h:${m.hauteur}`;
  }
  if (!o.muet) {
    const s = cree("span", "sr-only", el);
    s.textContent = texte.charAt(0) + texte.slice(1).toLowerCase();
  } else el.setAttribute("aria-hidden", "true");
  return el;
}

/** Les petites icônes blanches des boutons de la scène, sur 16 cases. */
const IC = {
  coche: ["................", "................", "................", ".............ww.", "............www.", "...........www..", "..........www...", ".ww......www....", ".www....www.....", "..www..www......", "...wwwwww.......", "....wwww........", ".....ww.........", "................", "................", "................"],
  rejouer: ["................", "................", "......wwww..ww..", "....wwwwwwwwww..", "...www....wwww..", "...ww....wwwww..", "..ww............", "..ww............", "..ww............", "..ww.........w..", "...ww.......ww..", "...www....www...", "....wwwwwwww....", "......wwww......", "................", "................"],
  retour: ["................", "................", ".......wwwwww...", ".......w....w...", "....w..w....w...", "...ww.......w...", "..wwwwwwww..w...", "..wwwwwwww..w...", "...ww.......w...", "....w..w....w...", ".......w....w...", ".......WWWWWW...", "................", "................", "................", "................"],
} as const;
const urlDIcone = (nom: keyof typeof IC, encre: boolean): string =>
  urlDeLaPlanche(`duel-ic|${nom}|${encre}`, () => grille(IC[nom], encre ? { w: "#231503", W: "#231503" } : { w: PAL.w, W: PAL.W }));

/** Un bouton du kit à icône seule : son mot au survol et pour les lecteurs d'écran. */
function boutonIcone(classe: string, mot: string, ic: string): HTMLButtonElement {
  const b = cree("button", `jeu-btn jeu-n9 jeu-btn-ic dl-btn ${classe}`);
  b.type = "button";
  b.setAttribute("aria-label", mot);
  b.dataset["mot"] = mot;
  const i = cree("i", "jeu-pic", b);
  i.setAttribute("aria-hidden", "true");
  i.style.setProperty("--i", ic);
  return b;
}

/* ---------- La scène ---------- */

export function lancerLeDuel(racine: HTMLElement, o: OptionsDeLaScene): SceneDuDuel {
  const M_ = o.moteur;
  const P = M_.P;
  let detruit = false;
  let pause = false;
  const fige = (): boolean => pause || !motionAllowed();
  const estSombre = (): boolean => document.documentElement.dataset["mode"] === "sombre";
  let tons: TonsDuTheme = TONS_DU_THEME[estSombre() ? "sombre" : "clair"];

  racine.textContent = "";
  const scene = cree("div", "dl-scene", racine);
  scene.dataset["phase"] = "avant";
  // un groupe nommé : un `div` sans rôle ne peut pas porter d'étiquette
  scene.setAttribute("role", "group");
  scene.setAttribute("aria-label", "Le duel");
  const fx = cree("canvas", "dl-fx", scene);
  fx.setAttribute("aria-hidden", "true");
  const banniere = cree("canvas", "dl-banniere", scene);
  banniere.setAttribute("role", "img");
  banniere.setAttribute("aria-label", `Le lieu du duel : ${o.lieu.nom}`);

  // Les deux camps : le ruban et la vie, la barre de vie, l'énergie ; la manche et la fatigue chez moi, ses puces chez lui.
  const campEl = (k: Camp, c: CampAPoser): HTMLElement => {
    const el = cree("div", `dl-camp dl-camp-${k}`, scene);
    const nom = cree("div", "dl-ligne dl-nom", el);
    const ruban = cree("span", `jeu-ruban jeu-n9 ${c.bleu ? "jeu-ruban-bleu" : ""}`, nom);
    ecrireEnPixels(cree("span", "", ruban), c.ruban, "creme", { relief: "ombre", muet: true });
    const sr = cree("span", "sr-only", ruban);
    sr.textContent = c.dit;
    const coeurs = cree("canvas", "dl-coeurs", nom);
    coeurs.setAttribute("role", "img");
    cree("canvas", "dl-barre-vie", cree("div", "dl-ligne", el)).setAttribute("aria-hidden", "true");
    cree("canvas", "dl-eclairs", cree("div", "dl-ligne", el)).setAttribute("role", "img");
    if (k === "a") {
      const manches = cree("div", "dl-manches", el);
      manches.setAttribute("role", "img");
      manches.hidden = true;
    } else {
      const puces = cree("div", "dl-puces", el);
      puces.setAttribute("role", "list");
      puces.setAttribute("aria-label", "Sa main");
    }
    cree("div", "dl-atouts", el);
    return el;
  };
  const elCampA = campEl("a", o.moi);
  const elCampB = campEl("b", o.lui);

  const pieceDeCamp = (k: Camp, c: CampAPoser) => {
    const ombre = cree("div", "dl-sol-ombre", scene);
    const fam = cree("div", `dl-familier dl-familier-${k}`, scene);
    fam.setAttribute("role", "img");
    const famCv = cree("canvas", "", fam);
    const g = cree("div", `dl-gaulois dl-gaulois-${k}`, scene);
    g.setAttribute("role", "img");
    g.setAttribute("aria-label", c.dit);
    // La toile tient l'image d'un geste (`gestes-armes.ts`) : elle déborde du Gaulois de MARGES cases, pour que l'objet tourne
    // sans sortir ; celle de droite se retourne autour du milieu du Gaulois.
    const gCv = cree("canvas", "", g);
    gCv.width = IMAGE_DU_GESTE.largeur;
    gCv.height = IMAGE_DU_GESTE.hauteur;
    gCv.style.left = enPourCent(-MARGES.gauche, GAULOIS_LARGEUR);
    gCv.style.top = enPourCent(-MARGES.haut, GAULOIS_HAUTEUR);
    gCv.style.width = enPourCent(IMAGE_DU_GESTE.largeur, GAULOIS_LARGEUR);
    gCv.style.height = enPourCent(IMAGE_DU_GESTE.hauteur, GAULOIS_HAUTEUR);
    if (k === "b") gCv.style.transformOrigin = `${enPourCent(MILIEU_DU_GAULOIS, IMAGE_DU_GESTE.largeur)} 50%`;
    const tir = cree("canvas", "dl-tir", scene);
    tir.setAttribute("aria-hidden", "true");
    tir.hidden = true;
    const jeton = cree("div", "dl-jeton", scene);
    jeton.setAttribute("aria-hidden", "true");
    const fente = cree("div", `dl-fente dl-fente-${k}`, scene);
    fente.setAttribute("aria-hidden", "true");
    return { ombre, fam, famCv, g, gCv, tir, jeton, fente };
  };
  const pa = pieceDeCamp("a", o.moi);
  const pb = pieceDeCamp("b", o.lui);

  interface Ressort {
    v: number;
    c: number;
    vit: number;
    k: number;
    d: number;
  }
  const res = (k = 170, d = 18, v = 0): Ressort => ({ v, c: v, vit: 0, k, d });
  const pasRes = (r: Ressort, dt: number): void => {
    if (fige()) {
      r.v = r.c;
      r.vit = 0;
      return;
    }
    r.vit += (r.k * (r.c - r.v) - r.d * r.vit) * dt;
    r.v += r.vit * dt;
  };
  const vers = (x: number, y: number, k: number, dt: number): number => (fige() ? y : x + (y - x) * (1 - Math.exp(-dt * k)));

  interface Vu {
    vie: number;
    vieMax: number;
    energie: number;
    elan: number;
    saigne: number;
  }
  interface EtatDuCamp {
    el: HTMLElement;
    p: ReturnType<typeof pieceDeCamp>;
    sens: number;
    x: number;
    cx: number;
    gx: number;
    gy: number;
    famX: number;
    famYBase: number;
    famL: number;
    famH: number;
    famY: Ressort;
    eclat: number;
    eclatVu: number;
    ox: Ressort;
    oy: Ressort;
    rot: Ressort;
    sx: Ressort;
    sy: Ressort;
    tombe: boolean;
    dec: number;
    vu: Vu;
    /** Les dessins du Gaulois pour ses gestes, refaits quand sa main change. */
    dessins: DessinsDuGaulois | null;
    /** L'arme de sa main : il la tient pour tous ses gestes. */
    arme: string | null;
    geste: GesteEnCours | null;
    /** La dernière pose peinte (sa clé), son image, et l'élan qu'elle donne, en pixels. */
    poseVue: string;
    imageVue: ImageDuGeste | null;
    elanVu: number;
  }
  /**
   * Un geste qui se joue : il a commencé à `debut` (horloge du jeu, en secondes) et avance de `distance` cases au plus. Le
   * court arrêt d'un impact ne l'arrête pas : sa chorégraphie a le sien, et le coup touche à l'instant prévu.
   */
  interface GesteEnCours {
    g: Geste;
    arme: string | null;
    debut: number;
    distance: number;
    /** D'où part le projectile, dans la scène, relevé au lâcher. */
    depart: Point | null;
  }
  const nouveauCamp = (el: HTMLElement, p: ReturnType<typeof pieceDeCamp>, sens: number, dec: number): EtatDuCamp => ({
    el,
    p,
    sens,
    x: 0,
    cx: 0,
    gx: 0,
    gy: 0,
    famX: 0,
    famYBase: 0,
    famL: 18,
    famH: 15,
    famY: res(260, 13),
    eclat: 0,
    eclatVu: 0,
    ox: res(150, 15),
    oy: res(190, 16),
    rot: res(130, 13),
    sx: res(240, 14, 1),
    sy: res(240, 14, 1),
    tombe: false,
    dec,
    vu: { vie: 0, vieMax: 0, energie: 0, elan: 0, saigne: 0 },
    dessins: null,
    arme: null,
    geste: null,
    poseVue: "",
    imageVue: null,
    elanVu: 0,
  });
  const camps: Record<Camp, EtatDuCamp> = { a: nouveauCamp(elCampA, pa, 1, 0), b: nouveauCamp(elCampB, pb, -1, 2.1) };

  // Le milieu : la bourse avant le duel et le bouton d'entrée ; le bouton pour poser ; la fin.
  const avant = cree("div", "dl-milieu dl-avant", scene);
  const bourse = cree("div", "dl-bourse jeu-panneau jeu-n9", avant);
  bourse.setAttribute("role", "img");
  const bourseLigne = cree("div", "dl-bourse-ligne", bourse);
  ecrireEnPixels(cree("span", "", bourseLigne), "BOURSE", "doux", { muet: true });
  const bourseN = cree("span", "", bourseLigne);
  const boursePions = cree("canvas", "dl-pions", bourse);
  const bourseVie = cree("span", "", bourse);
  const bEntrer = cree("button", "jeu-btn jeu-n9 dl-btn dl-grand", avant);
  bEntrer.type = "button";
  bEntrer.setAttribute("aria-label", "Entrer dans l'arène");
  bEntrer.dataset["mot"] = "Entrer dans l'arène";
  const icEntrer = cree("i", "dl-epees", bEntrer);
  icEntrer.setAttribute("aria-hidden", "true");

  const bPoser = cree("button", "jeu-btn jeu-n9 jeu-btn-ic dl-btn dl-grand dl-poser", scene);
  bPoser.type = "button";
  bPoser.setAttribute("aria-label", "Poser cette carte");
  bPoser.dataset["mot"] = "Poser cette carte";
  cree("i", "jeu-pic", bPoser).style.setProperty("--i", urlDIcone("coche", true));
  bPoser.hidden = true;

  const fin = cree("div", "dl-milieu dl-fin", scene);
  fin.hidden = true;
  const finPanneau = cree("div", "dl-fin-panneau jeu-panneau jeu-n9", fin);
  finPanneau.setAttribute("role", "dialog");
  const finRuban = cree("span", "jeu-ruban jeu-n9 dl-fin-ruban", finPanneau);
  const finTitre = cree("span", "", finRuban);
  finTitre.id = `dl-fin-titre-${Math.random().toString(36).slice(2, 8)}`;
  finPanneau.setAttribute("aria-labelledby", finTitre.id);
  // le bilan est un dessin en pixels (noms, cœurs, vie) : une image, dite par son étiquette
  const finBilan = cree("div", "dl-fin-bilan", finPanneau);
  finBilan.setAttribute("role", "img");
  const finChute = cree("span", "dl-fin-chute", finPanneau);
  const finMot = cree("p", "dl-fin-mot", finPanneau);
  const finBoutons = cree("div", "dl-fin-boutons", finPanneau);
  const bRejouer = boutonIcone("dl-grand", o.libelles?.rejouer ?? "Rejouer", urlDIcone("rejouer", true));
  const bQuitter = boutonIcone("jeu-btn-bleu", o.libelles?.quitter ?? "Retour au duel", urlDIcone("retour", false));
  finBoutons.append(bQuitter, bRejouer);

  const indice = cree("div", "dl-indice", scene);
  indice.setAttribute("aria-hidden", "true");
  const rangee = cree("div", "dl-rangee", scene);
  const lieu = cree("div", "dl-lieu", scene);
  const apercu = cree("div", "dl-apercu", scene);
  apercu.setAttribute("aria-hidden", "true");
  apercu.hidden = true;
  const fiche = cree("div", "dl-fiche", scene);
  fiche.setAttribute("role", "status");
  fiche.hidden = true;
  const bulle = cree("div", "dl-guide", scene);
  bulle.hidden = true;
  const bulleP = cree("p", "", bulle);
  const bulleBas = cree("span", "dl-guide-bas", bulle);
  const bullePas = cree("span", "", bulleBas);
  const bullePasser = cree("button", "", bulleBas);
  bullePasser.type = "button";
  bullePasser.textContent = "Passer le guide";
  const journal = cree("p", "sr-only", scene);
  journal.setAttribute("aria-live", "polite");

  /* ---------- La boucle unique et son horloge ---------- */
  let T = 0;
  let raf = 0;
  let avantT = 0;
  let visible = true;
  const tremble = res(420, 16);
  let trembleVu = 0;
  const minuteurs: { t: number; fn: () => void }[] = [];
  const grains: Grain[] = [];
  const nombres: Nombre[] = [];
  let agite = 0;
  let arret = 0;
  /** Une suite dans le déroulé : elle attend l'horloge du jeu, que la pause arrête. */
  const apres = (ms: number, fn: () => void): void => {
    minuteurs.push({ t: T + ms / 1000, fn });
    relancer();
  };
  const occupe = (): boolean => minuteurs.length > 0 || grains.length > 0 || nombres.length > 0 || agite > 0 || !!camps.a.geste || !!camps.b.geste;
  const marquerUnArret = (s: number): void => {
    if (!fige()) arret = Math.max(arret, s);
  };
  const doitTourner = (): boolean => !detruit && !pause && visible && !document.hidden && (motionAllowed() || occupe());
  function boucle(t: number): void {
    raf = 0;
    const dt = Math.min(0.05, (t - avantT) / 1000);
    avantT = t;
    T += dt;
    agite = Math.max(0, agite - dt);
    for (let i = 0; i < minuteurs.length; i++)
      if (minuteurs[i]!.t <= T) {
        const m = minuteurs.splice(i--, 1)[0]!;
        m.fn();
      }
    const dj = arret > 0 ? 0 : dt;
    arret = Math.max(0, arret - dt);
    pasCartes(dj);
    pasGaulois(dj);
    pasNombres(dt);
    pasGrains(dj);
    pasTremble(dj);
    if (doitTourner()) raf = requestAnimationFrame(boucle);
  }
  function relancer(): void {
    if (!motionAllowed()) agite = Math.max(agite, 0.2);
    if (!raf && doitTourner()) {
      avantT = performance.now();
      raf = requestAnimationFrame(boucle);
    }
  }
  function pasTremble(dt: number): void {
    pasRes(tremble, dt);
    const v = Math.abs(tremble.v) < 0.05 && Math.abs(tremble.vit) < 1 ? 0 : Math.round(tremble.v * 2) / 2;
    if (v !== trembleVu) {
      trembleVu = v;
      scene.style.transform = v ? `translate3d(${v}px,${(-v * 0.4).toFixed(1)}px,0)` : "";
    }
  }

  /* ---------- La mise en page : tout en pixels entiers, refaite à chaque changement de taille ---------- */
  const BL = 124;
  const BH = 80;
  const PIEDS = o.lieu.banniere?.pieds ?? 72;
  const Lay = {
    L: 0,
    tel: false,
    grandTel: false,
    court: false,
    cotes: false,
    bs: 4,
    gs: 3,
    xc: 0,
    D: 0,
    gw: 0,
    gh: 0,
    yG: 0,
    yF: 0,
    bx: 0,
    bw: 0,
    yBan: 0,
    yBas: 0,
    sT: 1,
    xT: 78,
    s0: 1,
    yT: 0,
    yM: 0,
    yI: 0,
    H: 0,
    pas: 0,
    yZ: 0,
    ficheACote: false,
  };
  /** La hauteur que la scène peut prendre : de son haut au menu du bas (téléphone) ou au bas de la fenêtre. */
  function hauteurVisible(): number {
    const menu = document.querySelector<HTMLElement>(".jeu-menu");
    const bas = menu && getComputedStyle(menu).position === "fixed" ? menu.offsetHeight : 0;
    const haut = racine.getBoundingClientRect().top + window.scrollY;
    // La maquette comptait sa barre de 52 pixels dans la hauteur de la fenêtre : la scène garde ses mesures.
    return Math.max(560, window.innerHeight - haut - bas - 8 + 52);
  }
  function mesurer(): void {
    const L = scene.clientWidth;
    const hv = hauteurVisible();
    const tel = L < 760;
    const xc = Math.round(L / 2);
    const hCamp = 56 + 4 + 10 + 4 + 16 + 4;
    let bs = 4;
    let cotes = false;
    let court = false;
    if (tel) bs = 3;
    else {
      const b = [8, 7, 6, 5, 4].find((x) => L >= x * BL + 2 * 252 && hv >= 72 + x * BH + 52 + 176 + 28);
      if (b) {
        bs = b;
        cotes = true;
      } else court = hv < 52 + 8 + hCamp + 82 + 4 * BH + 46 + 176 + 28;
    }
    // Un téléphone bas (sous la barre et au-dessus du menu du jeu, moins de 620 pixels) : la bannière à l'échelle 2 et le
    // milieu posé sur elle, pour que tout tienne dans l'écran.
    const basTel = tel && hv < 672;
    if (tel) bs = basTel ? 2 : Math.max(2, Math.min(3, Math.floor((L - 8) / BL)));
    const grandTel = tel && hv >= 800;
    const gs = tel ? (grandTel ? 3 : 2) : bs >= 8 ? 5 : bs >= 6 ? 4 : 3;
    const gw = 48 * gs;
    const gh = 64 * gs;
    const bw = BL * bs;
    const bh = BH * bs;
    const bx = xc - bw / 2;
    const D = tel ? (grandTel ? bw / 2 - 78 : bw / 2 - 57) : ({ 8: 300, 7: 270, 6: 236, 5: 215, 4: 165 } as Record<number, number>)[bs]!;
    const sT = (tel && !grandTel) || bs === 4 ? 0.5 : 1;
    const xT = sT === 0.5 ? 40 : grandTel || bs === 6 || bs === 5 ? 72 : 78;
    const yCamp = 8;
    const yBan = cotes ? 8 : tel ? yCamp + hCamp + 52 : yCamp + hCamp + 82;
    const yBas = yBan + bh;
    const yF = yBan + PIEDS * bs;
    const yG = yF - gh;
    Object.assign(Lay, { L, tel, grandTel, court, cotes, bs, gs, xc, D, gw, gh, yG, yF, bx, bw, yBan, yBas, sT, xT });
    Lay.s0 = tel ? 0.5 : 1;
    Lay.yT = yG + Math.round(gh / 2) + (sT === 1 ? 4 : 8);
    if (tel) {
      const zone = grandTel ? 8 + 176 + 12 : basTel ? 24 : 96;
      const bas = grandTel ? 96 : basTel ? 30 : 44;
      const extra = Math.max(0, Math.min(60, hv - 52 - (yBas + zone + 88 + 10 + bas + 4)));
      const mainHaut = yBas + zone + Math.round(extra * 0.5);
      if (grandTel) Lay.yT = yBas + 8 + 88 + Math.round(extra * 0.25);
      Lay.yM = mainHaut + 44;
      Lay.yI = mainHaut + 88 + 10;
      Lay.H = Lay.yI + bas + Math.round(extra * 0.5);
      Lay.pas = Math.min(72, (L - 68 - 8) / 4);
      Lay.yZ = basTel ? yBas - 56 : Math.round((yBas + mainHaut) / 2);
    } else {
      Lay.yI = yBas + 10;
      Lay.yM = yBas + 52 + 88;
      Lay.H = Lay.yM + 88 + 18;
      Lay.pas = Math.min(150, (L - 136 - 40) / 4);
      if (court) Lay.H = Lay.yM - 88 + 124;
    }
    scene.classList.toggle("dl-court", court);
    scene.classList.toggle("dl-tel", tel);
    scene.classList.toggle("dl-cotes", cotes);
    scene.style.height = `${Lay.H}px`;
    const b = banniere.style;
    b.left = `${bx}px`;
    b.top = `${yBan}px`;
    b.width = `${bw}px`;
    b.height = `${bh}px`;
    for (const k of ["a", "b"] as const) {
      const c = camps[k];
      const x = xc - c.sens * D;
      c.x = x;
      c.cx = cotes ? Math.round(xc - c.sens * (xc - bx / 2)) : Math.round(xc - c.sens * Math.min(L / 4 - (tel ? 3 : 0), 250));
      // le camp reste dans la scène, même étroite (360 pixels) : son milieu recule s'il le faut
      const demi = Math.ceil(c.el.offsetWidth / 2) + 4;
      if (demi > 4 && L > 2 * demi) c.cx = Math.min(L - demi, Math.max(demi, c.cx));
      c.el.style.left = `${c.cx}px`;
      c.el.style.top = `${cotes ? yBan + 18 : yCamp}px`;
      c.p.g.style.width = `${gw}px`;
      c.p.g.style.height = `${gh}px`;
      c.gx = x - gw / 2;
      c.gy = yG;
      const om = c.p.ombre.style;
      om.left = `${x}px`;
      om.top = `${yF - gs}px`;
      om.width = `${Math.round(gw * 0.62)}px`;
      om.height = `${4 * gs}px`;
      c.p.jeton.style.left = `${x}px`;
      c.p.jeton.style.top = `${yF + 3}px`;
      const f = c.p.fente.style;
      f.left = `${xc - c.sens * xT}px`;
      f.top = `${Lay.yT}px`;
      f.width = `${136 * sT}px`;
      f.height = `${176 * sT}px`;
      f.margin = `${-88 * sT}px 0 0 ${-68 * sT}px`;
      // le familier se tient derrière son Gaulois, du côté du bord, les pieds sur la même ligne, sans sortir de la bannière
      const fw = c.famL * gs;
      const fh = c.famH * gs;
      const dehors = x - c.sens * (gw / 2 + gs) - (c.sens > 0 ? fw : 0);
      c.famX = Math.round(c.sens > 0 ? Math.max(bx + 2 * bs, dehors) : Math.min(bx + bw - 2 * bs - fw, dehors));
      c.famYBase = yF - fh;
      c.p.fam.style.width = `${fw}px`;
      c.p.fam.style.height = `${fh}px`;
    }
    indice.style.top = `${Lay.yI}px`;
    lieu.style.left = `${xc}px`;
    lieu.style.top = `${tel ? yBan + 16 : yBan + 8}px`;
    lieu.style.maxWidth = `${tel ? bw - 150 : bw - 16}px`;
    if (tel) lieu.style.left = `${bx + 8 + (bw - 150) / 2}px`;
    const cote = xc - (2 * Lay.pas + 68) - 16;
    Lay.ficheACote = !tel && cote >= 220;
    if (!tel) {
      const fs = fiche.style;
      fs.width = `${Lay.ficheACote ? Math.min(280, cote - 8) : 260}px`;
      fs.left = `${Lay.ficheACote ? Math.max(8, cote - Math.min(280, cote - 8)) : 12}px`;
      fs.top = Lay.ficheACote ? `${Lay.yM - 88}px` : "auto";
      fs.bottom = Lay.ficheACote ? "auto" : `${Lay.H - yBas + 8}px`;
      fs.maxHeight = "";
    }
    const hautRangee = tel ? yBas + 4 : Lay.yM - 88 - 34;
    rangee.style.top = `${hautRangee}px`;
    rangee.style.height = `${Lay.H - hautRangee}px`;
    for (const m of [avant, fin]) {
      m.style.left = `${xc}px`;
      m.style.top = `${tel ? (m === fin ? Lay.H - 150 : Lay.yZ) : Math.round(yBan + bh / 2)}px`;
    }
    bPoser.style.left = `${xc - xT}px`;
    bPoser.style.top = `${grandTel ? Lay.yT + 88 - 10 : Lay.yT}px`;
    fx.width = Math.ceil(L / 2);
    fx.height = Math.ceil(Lay.H / 2);
    poserGaulois();
    relancer();
  }

  /** La bannière du lieu, en cases ; sans bannière, un pré clair sous un ciel. */
  function peindreBanniere(): void {
    const ban = o.lieu.banniere;
    const p = new Planche(BL, BH);
    if (ban) {
      ban.cases.forEach((coul, i) => {
        if (!coul) return;
        p.fillStyle = coul;
        p.fillRect(i % ban.largeur, Math.floor(i / ban.largeur), 1, 1);
      });
    } else {
      R(p, 0, 0, BL, BH, "#cfe2ff");
      R(p, 0, 52, BL, BH - 52, "#7fcf6a");
      R(p, 0, 52, BL, 2, "#a8e08a");
    }
    peindre(banniere, p);
  }

  /* ---------- Les éclats : de petits carrés qui volent, tombent et s'éteignent ---------- */
  interface Grain {
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;
    vie: number;
    duree: number;
    c: string;
    t: number;
    img?: HTMLCanvasElement;
  }
  let grainsSales = false;
  function eclats(x: number, y: number, n: number, couls: readonly string[], op: { angle?: number; ouverture?: number; vit?: number; poids?: number; duree?: number; taille?: number; img?: Planche } = {}): void {
    if (!motionAllowed()) return;
    const img = op.img ? toileDe(op.img) : undefined;
    for (let i = 0; i < n; i++) {
      const a = (op.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (op.ouverture ?? Math.PI * 2);
      const v = (op.vit ?? 160) * (0.4 + Math.random() * 0.8);
      grains.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: op.poids ?? 520, vie: 0, duree: (op.duree ?? 0.6) * (0.6 + Math.random() * 0.7), c: couls[i % Math.max(1, couls.length)] ?? "#ffffff", t: op.taille ?? (Math.random() < 0.3 ? 2 : 1), img });
    }
    relancer();
  }
  function pasGrains(dt: number): void {
    const g = fx.getContext("2d");
    if (!g || (!grains.length && !grainsSales)) return;
    g.clearRect(0, 0, fx.width, fx.height);
    grainsSales = grains.length > 0;
    for (let i = grains.length - 1; i >= 0; i--) {
      const p = grains[i]!;
      p.vie += dt;
      if (p.vie >= p.duree) {
        grains.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.6);
      const x = Math.round(p.x / 2);
      const y = Math.round(p.y / 2);
      if (p.img) {
        g.globalAlpha = borne((p.duree - p.vie) / 0.25);
        g.drawImage(p.img, x - (p.img.width >> 1), y - (p.img.height >> 1));
        g.globalAlpha = 1;
      } else {
        g.fillStyle = p.c;
        g.fillRect(x, y, p.t, p.t);
      }
    }
  }

  /* ---------- Les chiffres qui sautent ---------- */
  interface Nombre {
    el: HTMLElement;
    x: number;
    y: number;
    t: number;
    sc: Ressort;
    duree: number;
    vx: number;
  }
  function nombre(x: number, y: number, texte: string, coul: string, k = 3, op: { duree?: number; vx?: number; ic?: Planche | null } = {}): void {
    const d = cree("div", "dl-nombre", scene);
    const t = ecrire(enCapitales(texte), coul, null, "#070b1f");
    const c = toileDe(t);
    c.style.width = `${t.width * k}px`;
    c.style.height = `${t.height * k}px`;
    d.append(c);
    if (op.ic) {
      const i = toileDe(op.ic);
      i.style.cssText = `position:absolute;right:100%;top:50%;margin:${(-op.ic.height * k) / 2}px ${k}px 0 0;width:${op.ic.width * k}px;height:${op.ic.height * k}px;image-rendering:pixelated`;
      d.append(i);
    }
    d.setAttribute("aria-hidden", "true");
    const n: Nombre = { el: d, x: x - (t.width * k) / 2, y: y - (t.height * k) / 2, t: 0, sc: res(300, 13, 0.3), duree: op.duree ?? 1.15, vx: op.vx ?? 0 };
    n.sc.c = 1;
    nombres.push(n);
    relancer();
  }
  function pasNombres(dt: number): void {
    for (let i = nombres.length - 1; i >= 0; i--) {
      const n = nombres[i]!;
      n.t += dt;
      pasRes(n.sc, dt);
      if (n.t >= n.duree) {
        n.el.remove();
        nombres.splice(i, 1);
        continue;
      }
      const u = n.t / n.duree;
      const monte = fige() ? 0 : (1 - Math.pow(1 - u, 2)) * 34;
      n.el.style.transform = `translate3d(${(n.x + n.vx * u).toFixed(1)}px,${(n.y - monte).toFixed(1)}px,0) scale(${n.sc.v.toFixed(3)})`;
      n.el.style.opacity = u > 0.78 ? ((1 - u) / 0.22).toFixed(2) : "1";
    }
  }

  /* ---------- Les Gaulois : le vrai dessin du site, habillé des cartes de la main ---------- */
  function habiller(k: Camp, main: readonly CarteDuMoteur[]): void {
    let t = (k === "a" ? o.moi : o.lui).tenue;
    for (const c of main) t = changerObjet(t, c.e, c.id);
    const c = camps[k];
    c.dessins = dessinsDuGaulois(t);
    const arme = t["arme"];
    c.arme = arme && arme !== "aucune" ? arme : null;
    c.geste = null;
    c.elanVu = 0;
    c.poseVue = "";
    c.p.tir.hidden = true;
    peindreLaPose(k, POSE_DE_REPOS, "repos");
  }
  /** Une pose du Gaulois dans sa toile ; rien ne se repeint si c'est la même. */
  function peindreLaPose(k: Camp, pose: Pose, cle: string): ImageDuGeste | null {
    const c = camps[k];
    if (!c.dessins) return null;
    if (cle === c.poseVue && c.imageVue) return c.imageVue;
    const image = imageDeLaPose(c.dessins, pose);
    peindreLesCases(c.p.gCv, image.cases, image.largeur, image.hauteur);
    c.poseVue = cle;
    c.imageVue = image;
    return image;
  }
  function poserFamilier(k: Camp, f: Familier | null): void {
    const c = camps[k];
    const pose = f ? familierAPoser(f) : null;
    c.p.fam.hidden = !pose;
    if (!f || !pose) return;
    const p = new Planche(pose.largeur, pose.hauteur);
    pose.cases.forEach((coul, i) => {
      if (!coul) return;
      p.fillStyle = coul;
      p.fillRect(i % pose.largeur, Math.floor(i / pose.largeur), 1, 1);
    });
    peindre(c.p.famCv, p);
    c.famL = pose.largeur;
    c.famH = pose.hauteur;
    c.p.fam.setAttribute("aria-label", `${k === "a" ? "Ton familier" : "Son familier"} : ${f.nom}`);
  }
  function poserGaulois(): void {
    for (const k of ["a", "b"] as const) {
      const c = camps[k];
      c.p.fam.style.transform = `translate3d(${c.famX}px,${(c.famYBase + Math.min(0, c.famY.v)).toFixed(1)}px,0)`;
      c.p.g.style.transform = `translate3d(${(c.gx + c.ox.v + c.sens * c.elanVu).toFixed(1)}px,${(c.gy + c.oy.v).toFixed(1)}px,0) rotate(${c.rot.v.toFixed(2)}deg) scale(${c.sx.v.toFixed(3)},${c.sy.v.toFixed(3)})`;
    }
  }
  function pasGaulois(dt: number): void {
    for (const k of ["a", "b"] as const) {
      const c = camps[k];
      pasRes(c.famY, dt);
      pasRes(c.ox, dt);
      pasRes(c.oy, dt);
      pasRes(c.rot, dt);
      pasRes(c.sx, dt);
      pasRes(c.sy, dt);
      if (!fige() && !c.tombe) {
        const resp = Math.sin(T * 1.7 + c.dec);
        c.sy.c = 1 + resp * 0.012;
        c.sx.c = 1 - resp * 0.006;
      }
      pasDuGeste(k);
      c.eclat = vers(c.eclat, 0, 7, dt);
      const e = c.eclat < 0.02 ? 0 : Math.round(c.eclat * 20) / 20;
      if (e !== c.eclatVu) {
        c.eclatVu = e;
        c.p.g.style.filter = e ? `brightness(${(1 + e * 0.4).toFixed(2)}) saturate(${(1 - e * 0.3).toFixed(2)})` : "";
      }
    }
    poserGaulois();
  }
  const centreDe = (k: Camp, h = 0.45): [number, number] => [camps[k].x, Lay.yG + Lay.gh * (1 - h)];
  const bondir = (k: Camp, v = 300): void => {
    if (!fige()) {
      camps[k].famY.vit = -v;
      relancer();
    }
  };
  function secouer(k: Camp, force = 1): void {
    const c = camps[k];
    if (fige()) return;
    bondir(k, 240 + 80 * force);
    c.eclat = Math.min(1, 0.55 * force);
    if (force > 0.85) tremble.vit += -c.sens * 150 * force;
    c.ox.vit -= c.sens * 420 * force;
    c.rot.vit -= c.sens * 160 * force;
    c.sx.vit -= 2.2 * force;
    c.sy.vit += 1.6 * force;
    relancer();
  }
  /* ---------- Les gestes : le Gaulois se sert de l'objet de sa carte (`gestes-armes.ts`, chorégraphies de Claude Fable 5.2) ---------- */
  /** Le geste d'un camp pour le rôle de sa carte : sa frappe suit la famille de son arme. */
  const gesteDe = (k: Camp, role: Role): Geste => gesteDeLaCarte(role, camps[k].arme);
  /**
   * Ce que chaque geste avance au plus, en cases : de quoi toucher juste l'adversaire resté chez lui, ou rejoindre son coup
   * quand les deux frappent ensemble.
   */
  function distancesDesGestes(gestes: Partial<Record<Camp, Geste>>): Record<Camp, number> {
    const A = camps.a.dessins;
    const B = camps.b.dessins;
    if (!A || !B) return { a: 0, b: 0 };
    const contact = contactEntre(A, B, Math.round((camps.b.x - camps.a.x) / Lay.gs));
    const ga = gestes.a;
    const gb = gestes.b;
    if (ga && gb) {
      const [da, db] = distancesDElanFaceAFace({ d: A, geste: ga, arme: camps.a.arme }, { d: B, geste: gb, arme: camps.b.arme }, contact);
      return { a: da, b: db };
    }
    return { a: ga ? distanceDElan(A, ga, contact, camps.a.arme) : 0, b: gb ? distanceDElan(B, gb, contact, camps.b.arme) : 0 };
  }
  function lancerLeGeste(k: Camp, g: Geste, distance: number): void {
    const c = camps[k];
    if (!c.dessins) return;
    c.geste = { g, arme: c.arme, debut: T, distance, depart: null };
    relancer();
  }
  /** Un point de l'image du geste d'un camp, en pixels de la scène (celui de droite est retourné autour de son milieu). */
  function versLaScene(k: Camp, p: Point): Point {
    const c = camps[k];
    const x = c.sens > 0 ? p.x - MARGES.gauche : 2 * MILIEU_DU_GAULOIS - p.x - MARGES.gauche;
    return { x: c.gx + c.ox.v + c.sens * c.elanVu + x * Lay.gs, y: c.gy + c.oy.v + (p.y - MARGES.haut) * Lay.gs };
  }
  /** Le Gaulois d'un camp au repos, son geste fini ou arrêté, derrière les cartes posées. */
  function reposer(k: Camp): void {
    const c = camps[k];
    c.geste = null;
    c.elanVu = 0;
    if (!c.p.tir.hidden) c.p.tir.hidden = true;
    if (c.p.g.style.zIndex) c.p.g.style.zIndex = "";
    peindreLaPose(k, POSE_DE_REPOS, "repos");
  }
  /** Le geste d'un camp à cet instant : sa pose, son élan, son projectile ; au repos quand il est fini. */
  function pasDuGeste(k: Camp): void {
    const c = camps[k];
    const g = c.geste;
    const t = g ? (T - g.debut) * 1000 : 0;
    if (!g || t >= dureeDuGeste(g.g, g.arme)) {
      reposer(k);
      return;
    }
    // Pendant son geste, le Gaulois passe devant les cartes posées au milieu : on le voit se servir de son objet.
    if (c.p.g.style.zIndex !== "23") c.p.g.style.zIndex = "23";
    const pose = poseDuGeste(g.g, t, { arme: g.arme, calme: fige() });
    // l'image ne dépend ni de l'élan (la scène déplace la toile) ni du projectile (sa propre toile)
    const image = peindreLaPose(k, pose, JSON.stringify({ ...pose, elan: 0, projectile: null }));
    c.elanVu = Math.round(pose.elan * g.distance) * Lay.gs;
    const tir = c.p.tir;
    if (!pose.projectile || !image) {
      if (!tir.hidden) tir.hidden = true;
      return;
    }
    g.depart ??= versLaScene(k, departDuProjectile(pose.projectile.sorte, image));
    const [cx, cy] = centreDe(k === "a" ? "b" : "a", 0.44);
    const place = placeDuProjectile(pose.projectile, g.depart, { x: cx, y: cy }, Lay.gs);
    const vu = imageDuProjectile(pose.projectile.sorte, place.angle, c.dessins ?? undefined);
    peindreLesCases(tir, vu.cases, vu.largeur, vu.hauteur);
    tir.style.width = `${vu.largeur * Lay.gs}px`;
    tir.style.height = `${vu.hauteur * Lay.gs}px`;
    tir.style.transform = `translate3d(${place.x - vu.centre.x * Lay.gs}px,${place.y - vu.centre.y * Lay.gs}px,0)`;
    tir.hidden = false;
  }
  function sauter(k: Camp): void {
    const c = camps[k];
    if (fige()) return;
    c.oy.vit = -620;
    c.sy.vit = 2.6;
    c.sx.vit = -1.6;
    relancer();
  }
  function tomber(k: Camp): void {
    const c = camps[k];
    c.tombe = true;
    c.rot.c = -c.sens * 86;
    c.oy.c = -Lay.gs * 3;
    c.ox.c = c.sens * Math.max(-Lay.gs * 8, 8 + Lay.gh - (c.sens > 0 ? c.x - Lay.bx : Lay.bx + Lay.bw - c.x));
    c.rot.k = 90;
    c.rot.d = 9;
    c.sy.c = 1;
    c.sx.c = 1;
    SON.terre();
    const [x] = centreDe(k);
    eclats(x, Lay.yF - 4, 26, ["#ffffff", "#cfd6ee", "#9db2e0"], { angle: -Math.PI / 2, ouverture: Math.PI * 0.9, vit: 190, duree: 0.7 });
    relancer();
  }
  function relever(k: Camp): void {
    const c = camps[k];
    c.tombe = false;
    for (const r of [c.ox, c.oy, c.rot]) r.c = 0;
    c.rot.k = 130;
    c.rot.d = 13;
  }

  /* ---------- Les tableaux : la vie en cœur, l'énergie en pierres, les puces de la main adverse ---------- */
  const saute = (el: HTMLElement, n: string): void => {
    if (el.dataset["n"] !== n) {
      if (el.dataset["n"] !== undefined && scene.dataset["phase"] !== "avant" && !fige()) {
        el.classList.remove("dl-saute");
        void el.offsetWidth;
        el.classList.add("dl-saute");
      }
      el.dataset["n"] = n;
    }
  };
  function peindreCoeurs(k: Camp): void {
    const c = camps[k];
    const cv = c.el.querySelector<HTMLCanvasElement>(".dl-coeurs")!;
    const n = c.vu.vie;
    const max = c.vu.vieMax || 1;
    const p = new Planche(28, 28);
    p.drawImage(n > 0 ? grille(COEUR, { k: "#070b1f", p: "#a8101f", R: "#a8101f", r: "#8f0f1e" }) : coeurVide(tons), 0, 0, 28, 28);
    const t = String(n);
    const w = largeurDuTexte(t) * 2;
    const x0 = Math.round(14 - w / 2);
    const ombre = ecrire(t, n > 0 ? "#3d0610" : "#070b1f");
    const blanc = ecrire(t, "#ffffff");
    p.drawImage(ombre, x0 + 1, 6, ombre.width * 2, ombre.height * 2);
    p.drawImage(blanc, x0, 5, blanc.width * 2, blanc.height * 2);
    peindre(cv, p);
    const b = c.el.querySelector<HTMLCanvasElement>(".dl-barre-vie")!;
    const h = new Planche(60, 5);
    rr(h, 0, 0, 60, 5, 1, PAL.k);
    R(h, 1, 1, 58, 3, tons.vide);
    const l = Math.round((58 * Math.max(0, n)) / max);
    R(h, 1, 1, l, 3, n * 3 <= max ? "#e0263a" : "#3fce6a");
    R(h, 1, 1, l, 1, n * 3 <= max ? "#ff8a8f" : "#c4f9cb");
    peindre(b, h);
    saute(cv, t);
    cv.setAttribute("aria-label", `Vie : ${n} sur ${max}`);
  }
  const lieuDuCoeur = (k: Camp): [number, number] => {
    const r = camps[k].el.querySelector(".dl-coeurs")!.getBoundingClientRect();
    const s = scene.getBoundingClientRect();
    return [r.left - s.left + r.width / 2 - tremble.v, r.top - s.top + r.height / 2];
  };
  /** L'énergie en pierres : pleines, à venir à la prochaine manche, vides jusqu'au plafond. `depense` : ce que la carte choisie coûterait. */
  function peindreEclairs(k: Camp, depense = 0): void {
    const c = camps[k];
    const cv = c.el.querySelector<HTMLCanvasElement>(".dl-eclairs")!;
    const n = c.vu.energie;
    const camp = E[k];
    const plafond = camp?.plafond ?? P.ENERGIE_PLAFOND;
    const aVenir = scene.dataset["phase"] === "choix" ? Math.min(P.ENERGIE_PAR_MANCHE, plafond - Math.max(0, n - depense)) : 0;
    const g = new Planche(plafond * 9 - 1, 10);
    for (let i = 0; i < plafond; i++) {
      const x = i * 9;
      const pleine = i < n;
      const part = pleine && i >= n - depense;
      rr(g, x, 0, 8, 10, 2, part ? "#c2182b" : pleine ? PAL.k : tons.doux);
      rr(g, x + 1, 1, 6, 8, 1, pleine ? (part ? "#ffd9de" : "#ffc61a") : tons.vide);
      if (pleine && !part) {
        R(g, x + 2, 1, 4, 1, "#fff2a8");
        R(g, x + 2, 8, 4, 1, "#d9981b");
      }
      if (pleine) g.drawImage(grille(["..w.", ".ww.", "wwww", ".ww.", ".w.."], { w: part ? "#c2182b" : "#8a5a00" }), x + 2, 2);
      else if (i < n + aVenir) {
        g.fillStyle = "rgba(255,198,26,.55)";
        g.fillRect(x + 2, 3, 4, 4);
      }
    }
    peindre(cv, g);
    cv.setAttribute("aria-label", `Énergie : ${n} sur ${plafond}`);
    saute(cv, String(n));
  }
  function peindrePuces(): void {
    const el = elCampB.querySelector<HTMLElement>(".dl-puces")!;
    el.textContent = "";
    const b = E.b;
    if (!b) return;
    b.main.forEach((carte, i) => {
      const choix = scene.dataset["phase"] === "choix";
      const repos = scene.dataset["phase"] === "avant" || M_.libres(b).includes(i) ? 0 : (b.repos[i] ?? 0);
      const ess = !repos && choix && b.energie < carte.c;
      const coup = M_.estCoup(carte.role);
      const f = repos || !choix || !E.a ? carte.f : M_.forceJouee(b, carte, E.a);
      const elan = !repos && choix && coup && b.elan > 0 ? b.elan : 0;
      const cv = toileDe(puceDeCarte(carte, { force: f, essouffle: ess, elan, repos }));
      cv.setAttribute("role", "listitem");
      cv.setAttribute("aria-label", `${dessinDeLaCarte(M_, carte).nom} : ${ROLES[carte.role].nom.toLowerCase()}, force ${f}, prix ${carte.c}${repos ? `, au repos encore ${repos} manche${repos > 1 ? "s" : ""}` : ess ? ", essoufflée" : ""}`);
      cv.tabIndex = 0;
      const voir = (): void => montrerFiche(carte, { force: f, essouffle: ess, repos }, mainLui, true);
      const cacher = (): void => montrerFiche(null);
      cv.addEventListener("pointerenter", voir);
      cv.addEventListener("pointerleave", cacher);
      cv.addEventListener("focus", voir);
      cv.addEventListener("blur", cacher);
      cv.addEventListener("click", voir);
      el.append(cv);
    });
  }
  /** La manche en cours, et la fatigue qui approche : un compte à rebours en gouttes, puis ce qu'elle coûte. */
  function peindreManches(): void {
    const el = elCampA.querySelector<HTMLElement>(".dl-manches")!;
    const f = M_.fatigueDe(E.m, E.a ?? undefined);
    const dans = f ? 0 : P.FATIGUE_DES + (E.a?.at["fatigueTard"] ?? 0) - E.m;
    el.textContent = "";
    ecrireEnPixels(cree("span", "", el), `MANCHE ${E.m}`, "texte", { muet: true });
    const l = cree("span", "dl-fatigue", el);
    ecrireEnPixels(cree("span", "", l), f ? `FATIGUE ${f}` : "FATIGUE", f ? "mystique" : "doux", { muet: true });
    const n = f ? Math.min(f, 6) : Math.max(0, dans);
    if (n > 0) {
      const g = new Planche(n * 8 - 1, 9);
      for (let i = 0; i < n; i++) g.drawImage(goutte(!!f), i * 8, 0);
      const cv = toileDe(g);
      cv.style.cssText = `width:${g.width * 2}px;height:18px`;
      l.append(cv);
    }
    el.setAttribute("aria-label", `Manche ${E.m}. ${f ? `Fatigue : chaque Gaulois perd ${f} de vie à la fin de cette manche` : `La fatigue commence dans ${dans} manche${dans > 1 ? "s" : ""}`}`);
  }
  /** Ce que le Gaulois porte sur lui : son élan en réserve, son saignement. */
  function peindreJeton(k: Camp): void {
    const c = camps[k];
    const n = c.vu.elan;
    const s = c.vu.saigne;
    c.p.jeton.classList.toggle("dl-la", n > 0 || s > 0);
    if (!n && !s) return;
    c.p.jeton.textContent = "";
    const pose = (p: Planche): void => {
      const cv = toileDe(p);
      cv.style.width = `${p.width * 2}px`;
      cv.style.height = `${p.height * 2}px`;
      c.p.jeton.append(cv);
    };
    if (n) {
      pose(iconeDeRole("elan", "#d8c9ff"));
      pose(ecrire(`+${n}`, "#ffffff"));
    }
    if (s) {
      pose(grille(MOTS_IC["saigne"]![1], { w: "#ff6b7a" }));
      pose(ecrire(String(s), "#ffffff"));
    }
  }
  function perdreVie(k: Camp, n: number): void {
    const c = camps[k];
    const m = Math.min(n, c.vu.vie);
    const pas = Math.min(55, 380 / Math.max(1, m));
    for (let i = 0; i < m; i++)
      apres(i * pas, () => {
        c.vu.vie--;
        const [x, y] = lieuDuCoeur(k);
        eclats(x, y, 4, ["#e0263a", "#ff8a8f", "#a8101f"], { vit: 90, duree: 0.45, poids: 420 });
        SON.coeur(0, i);
        peindreCoeurs(k);
      });
  }
  function gagnerVie(k: Camp, n: number): void {
    const c = camps[k];
    for (let i = 0; i < n; i++)
      apres(i * 70, () => {
        c.vu.vie = Math.min(c.vu.vieMax, c.vu.vie + 1);
        peindreCoeurs(k);
      });
  }

  /* ---------- Les cartes à l'écran ---------- */
  interface CarteVive {
    el: HTMLButtonElement;
    corps: HTMLElement;
    face: HTMLCanvasElement;
    petite: HTMLCanvasElement;
    carte: CarteDuMoteur;
    lieu: "main" | "table" | "part";
    camp?: EtatDuCamp;
    vers?: [number, number];
    dec: number;
    a: number;
    mx: number;
    my: number;
    hx: number;
    hy: number;
    z: number;
    op: number;
    poche?: boolean;
    retourne?: number;
    x: Ressort;
    y: Ressort;
    rz: Ressort;
    sc: Ressort;
    rx: Ressort;
    ry: Ressort;
    tour: Ressort;
  }
  const cartes: CarteVive[] = [];
  function creerCarte(carte: CarteDuMoteur, cachee: boolean): CarteVive {
    const b = cree("button", `dl-carte${cachee ? " dl-cachee" : ""}`, scene);
    b.type = "button";
    // une carte cachée ne trahit pas sa rareté
    if (!cachee) {
      b.dataset["r"] = carte.r;
      b.style.setProperty("--rc", AURAS[carte.r]);
    }
    cree("span", "dl-c-aura", b);
    cree("span", "dl-c-ombre", b);
    const corps = cree("span", "dl-c-corps", b);
    const face = cree("canvas", "dl-c-face", corps);
    const petite = cree("canvas", "dl-c-petite", corps);
    const dos = cree("canvas", "dl-c-dos", corps);
    peindre(dos, dosDeCarte());
    for (const cl of ["dl-c-reflet", "dl-c-fini", "dl-c-eclats", "dl-c-voile"]) cree("span", cl, corps);
    const c: CarteVive = {
      el: b,
      corps,
      face,
      petite,
      carte,
      lieu: "main",
      dec: Math.random() * 6.283,
      a: 0,
      mx: 0.5,
      my: 0.5,
      hx: 0,
      hy: 0,
      z: -1,
      op: 1,
      x: res(210, 20),
      y: res(210, 20),
      rz: res(160, 16),
      sc: res(230, 17, Lay.s0 || 1),
      rx: res(170, 14),
      ry: res(170, 14),
      tour: res(260, 22, 1),
    };
    dessinerCarte(c, {});
    cartes.push(c);
    return c;
  }
  function dessinerCarte(c: CarteVive, etat: EtatDeCarte): void {
    const d = dessinDeLaCarte(M_, c.carte);
    peindre(c.face, faceDeCarte(d, etat));
    peindre(c.petite, faceDePoche(d, etat));
  }
  function retirerCarte(c: CarteVive): void {
    c.el.remove();
    const i = cartes.indexOf(c);
    if (i >= 0) cartes.splice(i, 1);
  }
  const Mn = { cartes: [] as CarteVive[], survol: null as CarteVive | null, prise: null as Prise | null, sel: null as CarteVive | null };
  interface Prise {
    c: CarteVive;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    px: number;
    py: number;
    bouge: boolean;
    lx: number;
    vx: number;
  }
  const fente = (i: number, n: number): { x: number; y: number; rz: number } => {
    const k = i - (n - 1) / 2;
    return Lay.tel ? { x: Lay.xc + k * Lay.pas, y: Lay.yM + k * k * 0.8, rz: k * 1.1 } : { x: Lay.xc + k * Lay.pas, y: Lay.yM + k * k * 2.2, rz: k * 1.7 };
  };
  function libelle(c: CarteVive): void {
    const st = etatDe(c.carte);
    const d = dessinDeLaCarte(M_, c.carte);
    const ph = scene.dataset["phase"];
    const action = ph === "avant" ? (o.changerUneCarte ? "Changer cette carte" : "") : Mn.sel === c ? "Poser cette carte" : "Choisir cette carte";
    c.el.setAttribute("aria-label", `${d.nom}, ${NOMS_DES_RANGS[c.carte.r].toLowerCase()} : ${phraseDeLaCarte(M_, c.carte, st).toLowerCase()}.${action ? ` ${action}` : ""}`);
  }
  /** L'état d'une carte de ma main à cette manche : au repos, ou la force qu'elle aurait, l'élan qu'elle porte, l'énergie qui manque. */
  function etatDe(carte: CarteDuMoteur): EtatDeCarte {
    if (scene.dataset["phase"] === "avant" || !E.a || !E.b) return { force: carte.f };
    const i = mainMoi.indexOf(carte);
    const repos = M_.libres(E.a).includes(i) ? 0 : (E.a.repos[i] ?? 0);
    if (repos > 0) return { force: carte.f, repos };
    return { force: M_.forceJouee(E.a, carte, E.b), essouffle: E.a.energie < carte.c, elan: M_.estCoup(carte.role) ? E.a.elan : 0 };
  }
  // Au repos : une carte que le moteur ne laisse pas poser (quand toutes se reposent, celles qui reviennent le plus tôt restent jouables).
  const auRepos = (c: CarteVive): boolean => scene.dataset["phase"] !== "avant" && !!E.a && !M_.libres(E.a).includes(Mn.cartes.indexOf(c));
  let indiceVu: string | null = null;
  function montrerIndice(c: CarteVive | null, defaut = ""): void {
    const cle = c ? c.carte.id + JSON.stringify(etatDe(c.carte)) : `d:${defaut}`;
    if (cle === indiceVu) return;
    indiceVu = cle;
    indice.textContent = "";
    if (c && !Lay.tel) {
      const t = tuileDeRole(c.carte.role);
      const i = cree("i", "dl-etq", indice);
      i.style.cssText = `--i:${urlDeLaPlanche(`duel-role|${c.carte.role}`, () => t)};--w:15;--h:15`;
    }
    const t = c ? phraseDeLaCarte(M_, c.carte, etatDe(c.carte)) : defaut;
    if (!t) return;
    ecrireEnPixels(cree("span", "", indice), t, c ? "texte" : "doux", { plie: true, muet: true });
  }

  /** La fiche d'une carte, en phrases, dans un élément. */
  function remplirFiche(el: HTMLElement, f: Fiche): void {
    el.textContent = "";
    const nom = cree("p", "dl-f-nom", el);
    cree("b", "", nom).textContent = f.nom;
    nom.append(" ");
    cree("span", "", nom).textContent = f.sous;
    for (const l of f.lignes) {
      const p = cree("p", `dl-f-ligne${l.ton ? ` dl-f-${l.ton}` : ""}`, el);
      if (l.icone) {
        const i = cree("i", "", p);
        const ic = l.icone;
        i.style.backgroundImage = "role" in ic ? urlDeLaPlanche(`duel-role|${ic.role}`, () => tuileDeRole(ic.role)) : urlDeLaPlanche(`duel-mot|${ic.mot}|${ic.unique}`, () => iconeDeMot(ic.mot, ic.unique));
      }
      const s = cree("span", "", p);
      cree("b", "", s).textContent = l.gras;
      s.append(` ${l.texte}`);
    }
  }
  let ficheDePuce = false;
  /** La fiche : la carte regardée, en phrases. `puce` : une carte d'en face, regardée sur sa puce. */
  function montrerFiche(carte: CarteDuMoteur | null, etat: EtatDeCarte = {}, main: readonly CarteDuMoteur[] | null = null, puce = false): void {
    ficheDePuce = puce && !!carte;
    if (!carte) {
      fiche.hidden = true;
      return;
    }
    remplirFiche(fiche, ficheDe(M_, carte, etat, main));
    fiche.hidden = false;
    if (Lay.tel) {
      const fs = fiche.style;
      const c = Mn.sel;
      if (Lay.grandTel) {
        fs.left = "8px";
        fs.width = `${Lay.L - 16}px`;
        fs.top = `${Lay.yI - 2}px`;
        fs.maxHeight = "96px";
      } else if (puce || !c) {
        fs.left = "8px";
        fs.width = `${Lay.L - 16}px`;
        fs.top = `${Lay.yBas + 6}px`;
        fs.maxHeight = "150px";
      } else {
        const gauche = Mn.cartes.indexOf(c) <= 2;
        fs.width = `${Lay.L - 136 - 26}px`;
        fs.left = `${gauche ? 148 + 6 : 12}px`;
        fs.top = `${Lay.yM - 44 - 8 - 176}px`;
        fs.maxHeight = "176px";
      }
      fs.bottom = "auto";
    }
  }
  function majIndice(): void {
    const c = Mn.survol ?? Mn.sel;
    const ph = scene.dataset["phase"];
    if (c && (ph === "avant" || ph === "choix")) montrerFiche(c.carte, etatDe(c.carte), mainMoi);
    else if (!ficheDePuce) montrerFiche(null);
    montrerIndice(ph === "avant" || ph === "choix" ? c : null, ph === "avant" ? (o.changerUneCarte ? "TOUCHE UNE CARTE POUR LA CHANGER" : "") : ph === "choix" && E.m === 1 ? "CHOISIS UNE CARTE, PUIS POSE-LA" : "");
  }
  function repeindreMain(): void {
    for (const c of Mn.cartes) {
      dessinerCarte(c, etatDe(c.carte));
      libelle(c);
    }
    indiceVu = null;
    majIndice();
  }
  const carteSous = (px: number, py: number): CarteVive | null => {
    const dans = (c: CarteVive): boolean => Math.abs(px - c.x.v) < 68 * c.sc.v + 2 && Math.abs(py - c.y.v) < 88 * c.sc.v + (Lay.tel ? 8 : 24);
    if (Mn.sel && dans(Mn.sel)) return Mn.sel;
    let mieux: CarteVive | null = null;
    let dm = 1e9;
    for (const c of Mn.cartes) {
      const dx = Math.abs(px - c.x.v);
      if (dans(c) && dx < dm) {
        dm = dx;
        mieux = c;
      }
    }
    return mieux;
  };
  const dansScene = (e: PointerEvent): [number, number] => {
    const r = scene.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  rangee.addEventListener("pointermove", (e) => {
    if (pause) return;
    const [px, py] = dansScene(e);
    const p = Mn.prise;
    if (p) {
      if (!p.bouge && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.bouge = true;
      p.px = px;
      p.py = py;
      p.vx = entre(p.vx, e.clientX - p.lx, 0.5);
      p.lx = e.clientX;
    } else if (e.pointerType === "mouse") {
      const c = carteSous(px, py);
      if (c !== Mn.survol) {
        Mn.survol = c;
        if (c) SON.survol();
        majIndice();
      }
    }
    const c = Mn.survol;
    if (c) {
      c.hx = borne((px - c.x.v) / 68, -1, 1);
      c.hy = borne((py - c.y.v) / 88, -1, 1);
    }
    relancer();
  });
  rangee.addEventListener("pointerdown", (e) => {
    if (pause || e.button > 0) return;
    const ph = scene.dataset["phase"];
    if (ph !== "avant" && ph !== "choix") return;
    const [px, py] = dansScene(e);
    const c = carteSous(px, py);
    if (!c) {
      if (Mn.sel && ph === "choix") {
        Mn.sel = null;
        majSel();
      }
      return;
    }
    Mn.prise = { c, x0: e.clientX, y0: e.clientY, dx: px - c.x.v, dy: py - c.y.v, px, py, bouge: false, lx: e.clientX, vx: 0 };
    Mn.survol = c;
    rangee.classList.add("dl-prise");
    try {
      rangee.setPointerCapture(e.pointerId);
    } catch {
      // Sans capture, la carte suit tant que le doigt reste sur la rangée.
    }
    SON.prise();
    majIndice();
    relancer();
  });
  const finDePrise = (e: PointerEvent): void => {
    const p = Mn.prise;
    if (!p) return;
    Mn.prise = null;
    rangee.classList.remove("dl-prise");
    const ph = scene.dataset["phase"];
    const haut = p.py - p.dy < Lay.yM - (Lay.tel ? 70 : 96);
    if (e.type === "pointerup" && !p.bouge) toucher(p.c);
    else if (e.type === "pointerup" && p.bouge && haut && ph === "choix" && !auRepos(p.c)) poser(p.c);
    else SON.retour();
    if (e.pointerType !== "mouse" || e.type === "pointercancel") Mn.survol = null;
    majIndice();
    relancer();
  };
  rangee.addEventListener("pointerup", finDePrise);
  rangee.addEventListener("pointercancel", finDePrise);
  rangee.addEventListener("pointerleave", () => {
    if (!Mn.prise && Mn.survol) {
      Mn.survol = null;
      majIndice();
    }
  });
  /** Un appui sur une carte de la main : avant le duel, on la change ; pendant, on la choisit, puis on la pose. */
  function toucher(c: CarteVive): void {
    const ph = scene.dataset["phase"];
    if (ph === "avant") {
      if (o.changerUneCarte) {
        SON.clic();
        o.changerUneCarte(Mn.cartes.indexOf(c), mainMoi.map((x) => x.id));
      }
    } else if (ph === "choix") {
      if (auRepos(c)) {
        SON.vide();
        c.rz.vit = 90;
        return;
      }
      if (Mn.sel === c) poser(c);
      else {
        Mn.sel = c;
        SON.clic();
        majSel();
      }
    }
  }
  function majSel(): void {
    for (const c of Mn.cartes) {
      c.el.classList.toggle("dl-choisie", Mn.sel === c);
      libelle(c);
    }
    bPoser.hidden = !(Mn.sel && scene.dataset["phase"] === "choix");
    camps.a.p.fente.classList.toggle("dl-appel", !!Mn.sel);
    majApercu();
    if (Mn.sel) guide(2);
    majIndice();
    relancer();
  }
  const A_REPOS: Record<string, number> = { base: 0, commun: 0.08, "peu-commun": 0.2, epique: 0.34, mystique: 0.46, legendaire: 0.56, saison: 0.56, divin: 0.64 };
  function pasCartes(dt: number): void {
    const n = Mn.cartes.length;
    const p = Mn.prise;
    const h = Mn.survol ?? (p ? p.c : null);
    const hi = h ? Mn.cartes.indexOf(h) : -1;
    const tire = !!p && p.bouge;
    const calmeIci = fige();
    const ph = scene.dataset["phase"];
    for (const c of cartes) {
      let zoom = false;
      let x = 0;
      let y = 0;
      let rz = 0;
      let sc = 1;
      let rx = 0;
      let ry = 0;
      let a = A_REPOS[c.carte.r] ?? 0;
      let h2 = 0;
      let mx = 0.5 + 0.45 * Math.sin(T * 0.55 + c.dec);
      let my = 0.5 + 0.3 * Math.cos(T * 0.4 + c.dec);
      let z = 5;
      const i = Mn.cartes.indexOf(c);
      if (c.lieu === "main" && i >= 0) {
        const f = fente(i, n);
        const phx = T * 0.9 + c.dec;
        x = f.x;
        y = f.y;
        rz = f.rz;
        z = 10 + i;
        if (!calmeIci) {
          y += Math.sin(phx * 1.2) * 1.6;
          rz += Math.sin(phx) * 0.7;
          ry = Math.sin(phx * 0.6) * 2.5;
        }
        if (hi >= 0 && i !== hi && !tire && !Lay.tel) x += (Math.sign(i - hi) * 30) / Math.abs(i - hi);
        const dort = auRepos(c);
        const leve = c === Mn.sel && !dort;
        const vu = c === h && !(tire && p!.c === c) && !dort;
        if (dort) {
          y += Lay.tel ? 4 : 10;
          a = 0;
        }
        if (Lay.tel && leve && !(tire && p!.c === c)) {
          zoom = true;
          x = Lay.grandTel ? Lay.xc - Lay.xT : i <= 2 ? 74 : Lay.L - 74;
          y = Lay.grandTel ? Lay.yT - 6 : Lay.yM - 44 - 8 - 88;
          rz = 0;
          sc = 1;
          a = 1;
          h2 = 30;
          z = 40;
          if (vu) {
            rx = -c.hy * 8;
            ry = c.hx * 10;
          }
        } else if (Lay.tel && vu) {
          y = f.y - 10;
          rz = 0;
          sc = 1.06;
          a = 1;
          h2 = 12;
          z = 40;
        } else if (leve || vu) {
          y = f.y - 20;
          rz = 0;
          sc = p && p.c === c ? 1.03 : 1.05;
          a = 1;
          h2 = 26;
          z = leve && !vu ? 38 : 40;
          if (vu) {
            rx = -c.hy * 11;
            ry = c.hx * 14;
            mx = 0.5 + c.hx * 0.5;
            my = 0.5 + c.hy * 0.5;
          }
        }
        if (tire && p!.c === c && !dort) {
          x = p!.px - p!.dx;
          y = p!.py - p!.dy;
          sc = 1.12;
          rz = borne(p!.vx * 0.9, -14, 14);
          ry = borne(p!.vx * 1.3, -20, 20);
          rx = 0;
          a = 1;
          h2 = 44;
          mx = 0.5 + ry / 40;
          p!.vx *= Math.exp(-dt * 6);
          z = 45;
          c.x.k = c.y.k = 520;
          c.x.d = c.y.d = 34;
        } else {
          c.x.k = c.y.k = 210;
          c.x.d = c.y.d = 20;
        }
        if (ph === "resolution" || ph === "fin") {
          y += Lay.tel ? 0 : 12;
          a = 0;
        }
      } else if (c.lieu === "table") {
        x = Lay.xc - c.camp!.sens * Lay.xT;
        y = Lay.yT;
        z = 22;
        a = 0.5;
        rz = -c.camp!.sens * 2;
        zoom = Lay.sT === 1;
        if (!calmeIci) {
          rz += Math.sin(T * 0.8 + c.dec) * 0.6;
          ry = Math.sin(T * 0.6 + c.dec) * 3;
        }
        c.x.k = c.y.k = 170;
        c.x.d = c.y.d = 19;
      } else {
        x = c.vers?.[0] ?? 0;
        y = c.vers?.[1] ?? 0;
        sc = 0.35;
        z = 6;
        c.op = vers(c.op, 0, 9, dt);
        c.x.k = c.y.k = 120;
        c.x.d = c.y.d = 20;
      }
      c.x.c = x;
      c.y.c = y;
      c.rz.c = rz;
      c.sc.c = c.lieu === "table" ? Lay.sT : zoom ? 1 : sc * Lay.s0;
      c.rx.c = rx;
      c.ry.c = ry;
      pasRes(c.x, dt);
      pasRes(c.y, dt);
      pasRes(c.rz, dt);
      pasRes(c.sc, dt);
      pasRes(c.rx, dt);
      pasRes(c.ry, dt);
      pasRes(c.tour, dt);
      if (c.retourne === 1) {
        c.tour.c = 0;
        if (c.tour.v < 0.07 || calmeIci) {
          c.el.classList.remove("dl-cachee");
          c.retourne = 0;
          c.tour.c = 1;
          if (calmeIci) c.tour.v = 1;
        }
      }
      c.a = vers(c.a, a, 10, dt);
      c.mx = vers(c.mx, mx, 10, dt);
      c.my = vers(c.my, my, 10, dt);
      c.el.style.transform = `translate3d(${c.x.v.toFixed(1)}px,${c.y.v.toFixed(1)}px,0) rotate(${c.rz.v.toFixed(2)}deg) scale(${(c.sc.v * Math.max(0.02, c.tour.v)).toFixed(3)},${c.sc.v.toFixed(3)})`;
      c.corps.style.transform = `rotateX(${c.rx.v.toFixed(2)}deg) rotateY(${c.ry.v.toFixed(2)}deg)`;
      const st = c.el.style;
      st.setProperty("--a", c.a.toFixed(3));
      st.setProperty("--dl-mx", c.mx.toFixed(3));
      st.setProperty("--dl-my", c.my.toFixed(3));
      st.setProperty("--h", h2.toFixed(0));
      const poche = Lay.tel && !zoom && c.lieu !== "part" && !(tire && p!.c === c) && (c.lieu === "main" || Lay.sT === 0.5);
      if (poche !== c.poche) {
        c.poche = poche;
        c.el.classList.toggle("dl-poche", poche);
      }
      if (c.carte.r === "divin") st.setProperty("--dl-ang", ((T * 26 + c.dec * 57) % 360).toFixed(1));
      if (c.lieu === "part") st.opacity = c.op.toFixed(2);
      if (z !== c.z) {
        c.z = z;
        st.zIndex = String(z);
      }
    }
  }

  /* ---------- Les mains ---------- */
  const mainMoi: CarteDuMoteur[] = o.moi.main.map((id) => M_.carte(id));
  const mainLui: CarteDuMoteur[] = o.lui.main.map((id) => M_.carte(id));
  // `r` : la manche qui se montre, dont les camps ne deviennent `a` et `b` qu'à la fin de ce qu'elle montre.
  const E: { m: number; debut: number; a: CampDuMoteur | null; b: CampDuMoteur | null; r: MancheDuMoteur | null; choixB: number; cb: CarteVive | null; suite: Record<Camp, number> } = { m: 1, debut: 1, a: null, b: null, r: null, choixB: -1, cb: null, suite: { a: 0, b: 0 } };

  /* ---------- Avant le duel : la bourse, la vie ---------- */
  function peindreBourse(): void {
    const pris = M_.prixDeLaMain(mainMoi);
    const garde = P.BOURSE - pris;
    const g = new Planche(P.BOURSE * 9 - 1, 10);
    for (let i = 0; i < P.BOURSE; i++) {
      const x = i * 9;
      const plein = i < pris;
      rr(g, x, 0, 8, 10, 2, plein ? PAL.k : "#a8101f");
      rr(g, x + 1, 1, 6, 8, 1, plein ? "#ffc61a" : "#ffd9de");
      if (plein) {
        R(g, x + 2, 1, 4, 1, "#fff2a8");
        g.drawImage(grille(["..w.", ".ww.", "wwww", ".ww.", ".w.."], { w: "#8a5a00" }), x + 2, 2);
      } else g.drawImage(grille(["w.w", "www", ".w."], { w: "#e0263a" }), x + 2, 3);
    }
    peindre(boursePions, g);
    boursePions.style.width = `${g.width * 2}px`;
    boursePions.style.height = `${g.height * 2}px`;
    ecrireEnPixels(bourseN, `${pris} SUR ${P.BOURSE}`, "texte", { muet: true });
    ecrireEnPixels(bourseVie, garde ? `${garde} GARDÉ${garde > 1 ? "S" : ""} : ${Math.floor((garde * P.VIE_PAR_POINT) / P.POINTS_POUR_UNE_VIE)} DE VIE EN PLUS` : "TOUT EST DÉPENSÉ", "doux", { muet: true });
    bourse.setAttribute("aria-label", `Bourse de duel : ${pris} points sur ${P.BOURSE}. Vie : ${M_.vieDeLaMain(mainMoi, o.moi.options)}`);
  }
  /** Les atouts d'un camp, en une ou deux lignes : ses panoplies, son compagnon, son pouvoir. */
  function peindreAtouts(k: Camp): void {
    const c = k === "a" ? o.moi : o.lui;
    const main = k === "a" ? mainMoi : mainLui;
    const el = camps[k].el.querySelector<HTMLElement>(".dl-atouts")!;
    el.textContent = "";
    const ligne = (gras: string, texte: string): void => {
      const p = cree("p", "", el);
      cree("b", "", p).textContent = gras;
      p.append(` ${texte}`);
    };
    for (const id of M_.panopliesDe(main)) {
      const pa = M_.panoplies[id];
      if (pa) ligne(`Panoplie « ${pa.nom} ».`, pa.phrase);
    }
    const comp = c.options.compagnon ? M_.compagnons[c.options.compagnon] : null;
    if (c.familier && comp) ligne(`${c.familier.nom}.`, comp.phrase);
    for (const l of c.plus ?? []) ligne(l.gras, l.texte);
  }
  function preparer(entree: boolean): void {
    scene.dataset["phase"] = "avant";
    const depart = o.defi?.depart() ?? null;
    E.a = null;
    E.b = depart ? depart.b : M_.camp(mainLui, o.lui.options);
    E.m = depart ? depart.m : 1;
    E.suite = { a: 0, b: 0 };
    Mn.sel = null;
    Mn.survol = null;
    lieu.textContent = "";
    cree("b", "", lieu).textContent = `${o.lieu.nom}.`;
    if (o.lieu.phrase) lieu.append(` ${o.lieu.phrase}`);
    lieu.hidden = !o.lieu.nom;
    poserFamilier("a", o.moi.familier);
    poserFamilier("b", o.lui.familier);
    for (const k of ["a", "b"] as const) {
      relever(k);
      const main = k === "a" ? mainMoi : mainLui;
      const opts = k === "a" ? o.moi.options : o.lui.options;
      const ex = depart ? depart[k] : M_.camp(main, opts);
      camps[k].vu = { vie: ex.vie, vieMax: ex.vieMax, energie: ex.energie, elan: ex.elan, saigne: ex.saignes.reduce((n, x) => n + x.t, 0) };
      habiller(k, main);
      peindreAtouts(k);
    }
    mesurer();
    for (const c of cartes.slice()) retirerCarte(c);
    Mn.cartes = [];
    mainMoi.forEach((carte, i) => {
      const c = creerCarte(carte, false);
      Mn.cartes.push(c);
      const f = fente(i, mainMoi.length);
      c.x.v = f.x;
      c.y.v = entree ? Lay.H + 120 : f.y;
      c.rz.v = f.rz;
    });
    for (const k of ["a", "b"] as const) {
      peindreCoeurs(k);
      peindreEclairs(k);
      peindreJeton(k);
    }
    majApercu();
    montrerFiche(null);
    peindrePuces();
    peindreBourse();
    bourse.hidden = !!o.defi;
    avant.hidden = false;
    fin.hidden = true;
    bPoser.hidden = true;
    elCampA.querySelector<HTMLElement>(".dl-manches")!.hidden = true;
    repeindreMain();
    majSel();
    relancer();
  }
  function changerCarte(i: number, id: string): void {
    const c = Mn.cartes[i];
    if (!c || scene.dataset["phase"] !== "avant") return;
    const carte = M_.carte(id);
    mainMoi[i] = carte;
    c.carte = carte;
    c.el.dataset["r"] = carte.r;
    c.el.style.setProperty("--rc", AURAS[carte.r]);
    dessinerCarte(c, {});
    libelle(c);
    c.sc.vit = 5;
    c.y.vit = -260;
    const ex = M_.camp(mainMoi, o.moi.options);
    camps.a.vu = { vie: ex.vie, vieMax: ex.vieMax, energie: ex.energie, elan: ex.elan, saigne: 0 };
    habiller("a", mainMoi);
    const g = camps.a;
    if (!fige()) {
      g.sy.vit = 2.4;
      g.sx.vit = -1.5;
    }
    peindreCoeurs("a");
    peindreEclairs("a");
    peindreJeton("a");
    peindreAtouts("a");
    peindreBourse();
    SON.enfile();
    indiceVu = null;
    repeindreMain();
    relancer();
    c.el.focus({ preventScroll: true });
  }

  /* ---------- Le duel ---------- */
  const annoncer = (t: string): void => {
    journal.textContent = t;
  };
  let dernierRecit = "";
  function entrer(): void {
    if (scene.dataset["phase"] !== "avant") return;
    const depart = o.defi?.depart() ?? null;
    E.a = depart ? depart.a : M_.camp(mainMoi, o.moi.options);
    E.b = depart ? depart.b : M_.camp(mainLui, o.lui.options);
    E.m = depart ? depart.m : 1;
    E.debut = E.m;
    E.suite = { a: 0, b: 0 };
    avant.hidden = true;
    elCampA.querySelector<HTMLElement>(".dl-manches")!.hidden = false;
    SON.entree();
    for (const k of ["a", "b"] as const) {
      sauter(k);
      bondir(k, 380);
    }
    o.onDebut?.();
    for (const [ia, ib] of o.reprise ?? []) {
      const r = M_.manche(E.a, E.b, ia, ib, E.m);
      E.a = r.a;
      E.b = r.b;
      if (r.fini) break;
      E.m++;
    }
    nouvelleManche();
  }
  function nouvelleManche(): void {
    const a = E.a!;
    const b = E.b!;
    scene.dataset["phase"] = "choix";
    Mn.sel = null;
    // La machine choisit maintenant, avant toi : elle ne peut pas voir ta carte. Contre le serveur, elle choisit quand tu
    // poses la tienne, sans la voir non plus : sa carte cachée est un dos, qui ne dit rien.
    E.choixB = o.choisir ? o.choisir(b, a, E.m) : -1;
    const carteB = b.main[E.choixB >= 0 ? E.choixB : (M_.libres(b)[0] ?? 0)]!;
    const cb = creerCarte(carteB, !(o.defi?.annonce && E.choixB >= 0));
    cb.lieu = "table";
    cb.camp = camps.b;
    cb.el.tabIndex = -1;
    cb.el.setAttribute("aria-hidden", "true");
    [cb.x.v, cb.y.v] = centreDe("b");
    cb.sc.v = 0.3;
    dessinerCarte(cb, { force: M_.forceJouee(b, carteB, a), essouffle: b.energie < carteB.c, elan: M_.estCoup(carteB.role) ? b.elan : 0 });
    E.cb = cb;
    SON.pose(0.1);
    for (const k of ["a", "b"] as const) {
      const s = E[k]!;
      camps[k].vu = { vie: Math.max(0, s.vie), vieMax: s.vieMax, energie: s.energie, elan: s.elan, saigne: s.saignes.reduce((n, x) => n + x.t, 0) };
      peindreCoeurs(k);
      peindreEclairs(k);
      peindreJeton(k);
    }
    peindreManches();
    peindrePuces();
    repeindreMain();
    majSel();
    guide(E.m === 1 ? 1 : E.m === 2 ? 3 : E.m === 3 ? 4 : 0);
    const f = M_.fatigueDe(E.m, a);
    annoncer(`${E.m > 1 ? `${dernierRecit} ` : ""}Manche ${E.m}. Tu as ${a.vie} de vie et ${a.energie} d'énergie. En face : ${b.vie} de vie, ${b.energie} d'énergie.${f ? ` Fatigue : ${f} de vie perdu par chacun à la fin de la manche.` : ""}`);
  }
  function poser(c: CarteVive): void {
    if (scene.dataset["phase"] !== "choix" || auRepos(c) || !E.a || !E.b || !E.cb) return;
    const ia = Mn.cartes.indexOf(c);
    if (E.choixB >= 0 || !o.jouer) {
      resoudre(c, ia);
      return;
    }
    // Le serveur joue la manche : la carte part, on attend la sienne.
    scene.dataset["phase"] = "attente";
    Mn.sel = null;
    Mn.survol = null;
    bPoser.hidden = true;
    c.lieu = "table";
    c.camp = camps.a;
    SON.pose();
    montrerFiche(null);
    majApercu();
    guide(0);
    o.jouer(ia, E.m).then(
      (ib) => {
        if (detruit || scene.dataset["phase"] !== "attente") return;
        const b = E.b!;
        const carteB = b.main[ib];
        const cb = E.cb;
        if (!carteB || !cb) throw new Error("duel : carte de la machine inconnue");
        E.choixB = ib;
        cb.carte = carteB;
        dessinerCarte(cb, { force: M_.forceJouee(b, carteB, E.a!), essouffle: b.energie < carteB.c, elan: M_.estCoup(carteB.role) ? b.elan : 0 });
        scene.dataset["phase"] = "choix";
        resoudre(c, ia);
      },
      (e: unknown) => {
        if (detruit || scene.dataset["phase"] !== "attente") return;
        c.lieu = "main";
        scene.dataset["phase"] = "choix";
        SON.retour();
        repeindreMain();
        majSel();
        o.onErreur?.(e);
      },
    );
    relancer();
  }
  function resoudre(c: CarteVive, ia: number): void {
    if (!E.a || !E.b || !E.cb) return;
    const r: MancheDuMoteur = M_.manche(E.a, E.b, ia, E.choixB, E.m);
    E.r = r;
    const fa = r.fa;
    const fb = r.fb;
    const cb = E.cb;
    scene.dataset["phase"] = "resolution";
    Mn.sel = null;
    Mn.survol = null;
    bPoser.hidden = true;
    camps.a.p.fente.classList.remove("dl-appel");
    c.el.classList.remove("dl-choisie");
    c.lieu = "table";
    c.camp = camps.a;
    c.el.tabIndex = -1;
    c.sc.vit = 3;
    SON.pose();
    montrerIndice(null, "");
    montrerFiche(null);
    majApercu();
    guide(0);
    // le poids de la carte qui se pose : plus elle est rare, plus elle pèse
    apres(170, () => {
      if (!fige()) {
        tremble.vit += 60 + c.carte.c * 14;
        c.sc.vit = -1.6;
      }
    });
    const vu = { a: camps.a.vu, b: camps.b.vu };
    // elle se retourne, et chacun paie son prix en énergie
    apres(480, () => {
      cb.retourne = 1;
      cb.el.dataset["r"] = fb.carte.r;
      cb.el.style.setProperty("--rc", AURAS[fb.carte.r]);
      SON.revele();
      for (const [k, f] of [["a", fa], ["b", fb]] as const) {
        vu[k].energie -= f.paye;
        vu[k].elan = 0;
        peindreEclairs(k);
        peindreJeton(k);
        for (let i = 0; i < f.paye; i++) SON.paye(i * 0.04);
      }
    });
    let t = 1150;
    type Coup = [Camp, Camp, FaitDuMoteur, FaitDuMoteur, CarteVive, CarteVive];
    const coups: Coup[] = [];
    if (M_.estCoup(fa.role)) coups.push(["a", "b", fa, fb, c, cb]);
    if (M_.estCoup(fb.role)) coups.push(["b", "a", fb, fa, cb, c]);
    if (coups.length) {
      // Les gestes : celui qui frappe se sert de son arme (ou cogne de la tête), celui qui garde encaisse ; chacun part pour
      // que son coup touche à l'instant de l'impact, `impact`.
      const gestes: Partial<Record<Camp, Geste>> = {};
      for (const [qui, , f] of coups) gestes[qui] = gesteDe(qui, f.role);
      for (const [, cible, , fc] of coups) if (fc.role === "garde") gestes[cible] = "garde";
      const avantLImpact = (k: Camp): number => {
        const g = gestes[k];
        return g ? (instantDeLImpact(g, camps[k].arme) ?? 0) : 0;
      };
      const impact = t + Math.max(210, avantLImpact("a"), avantLImpact("b"));
      for (const k of ["a", "b"] as const) {
        const g = gestes[k];
        if (!g) continue;
        apres(impact - avantLImpact(k), () => {
          lancerLeGeste(k, g, distancesDesGestes(gestes)[k]);
          if (g !== "garde" && !fige()) SON.elance();
        });
      }
      apres(t, () => {
        for (const [qui, , , , carteQui] of coups) {
          carteQui.sc.vit = 4;
          carteQui.rz.vit = camps[qui].sens * 120;
        }
      });
      // la flèche de chaque coup, jusqu'à l'impact
      apres(Math.max(t, impact - 400), () => {
        for (const [qui, , f] of coups) fleche(qui, f.role);
      });
      // le court arrêt, au contact
      apres(impact - 10, () => {
        const gros = Math.max(...coups.map(([, , f]) => f.degats));
        if (gros > 0) {
          marquerUnArret(0.05 + Math.min(0.09, gros * 0.012));
          SON.arret();
        }
      });
      apres(impact, () => {
        for (const [, cible, f, fc, , carteCible] of coups) {
          const [x, y] = centreDe(cible, 0.55);
          if (fc.role === "garde") {
            SON.pare();
            bouclier(cible);
            nombre(x + camps[cible].sens * Lay.gw * (Lay.tel ? 0.2 : 0.62), y - Lay.gh * 0.34, "PARÉ", "#ffffff", Lay.tel ? 2 : 3, { duree: 0.9 });
            carteCible.sc.vit = 4;
            if (f.degats > 0) blesser(cible, f.degats, f.role, 0.5);
          } else blesser(cible, f.degats, f.role, 1);
          if (fc.coupe) {
            carteCible.el.classList.add("dl-coupee");
            carteCible.rz.vit = 260 * camps[cible].sens;
            SON.coupe();
            nombre(carteCible.x.v, carteCible.y.v, "COUPÉ", "#ffc08a", Lay.sT === 1 ? 3 : 2, { duree: 1 });
          }
        }
      });
      // ce qui revient à celui qui a cogné : les dégâts renvoyés par la garde, et le point que coûte un coup de tête
      const retours = coups.filter(([, , f, fc]) => fc.renvoi + f.recul > 0);
      if (retours.length)
        apres(impact + 350, () => {
          for (const [qui, , f, fc] of retours) blesser(qui, fc.renvoi + f.recul, fc.renvoi ? "renvoi" : "recul", fc.renvoi ? 0.9 : 0.35);
        });
      // un coup qui porte lance le suivant
      const lances = coups.filter(([, , f]) => f.enchaine);
      for (const k of ["a", "b"] as const) E.suite[k] = lances.some(([qui]) => qui === k) ? E.suite[k] + 1 : 0;
      if (lances.length && !r.fini)
        apres(impact + 490, () => {
          for (const [qui, , f] of lances) {
            vu[qui].elan += f.enchaine ?? 0;
            peindreJeton(qui);
            if (E.suite[qui] > 1) {
              const [x, y] = centreDe(qui, 0.95);
              nombre(x, y, `${E.suite[qui]} COUPS DE SUITE`, "#ffd84a", Lay.tel ? 2 : 3, { duree: 1 });
              eclats(x, y + 20, 6 + E.suite[qui] * 5, ["#ffd84a", "#fff2a8", "#ffffff"], { angle: -Math.PI / 2, ouverture: 2, vit: 200 + E.suite[qui] * 30, duree: 0.7 });
            }
          }
          SON.enchaine(Math.max(E.suite.a, E.suite.b));
        });
      t = impact - 210 + (retours.length ? 1250 : 950);
    } else if (fa.role === "garde" || fb.role === "garde") {
      apres(t, () => {
        const gestes: Partial<Record<Camp, Geste>> = {};
        for (const [k, f] of [["a", fa], ["b", fb]] as const) if (f.role === "garde") gestes[k] = "garde";
        const d = distancesDesGestes(gestes);
        for (const [k, f] of [["a", fa], ["b", fb]] as const)
          if (f.role === "garde") {
            bouclier(k);
            lancerLeGeste(k, "garde", d[k]);
          }
        SON.vide();
      });
      t += 500;
    }
    const suites = r.fini ? [] : ([["a", fa, c], ["b", fb, cb]] as const).filter(([, f]) => (f.role === "souffle" || f.role === "elan") && !f.coupe);
    if (suites.length) {
      apres(t, () => {
        const gestes: Partial<Record<Camp, Geste>> = {};
        for (const [k, f] of suites) gestes[k] = gesteDe(k, f.role);
        const d = distancesDesGestes(gestes);
        for (const [k, f, carteEl] of suites) {
          const [x, y] = centreDe(k, 0.6);
          const g = camps[k];
          lancerLeGeste(k, gesteDe(k, f.role), d[k]);
          if (f.role === "souffle") {
            if (f.soin > 0) SON.soin(f.soin);
            else SON.vide();
            gagnerVie(k, f.soin);
            nombre(x + g.sens * Lay.gw * (Lay.tel ? 0.15 : 0.3), y - Lay.gh * (Lay.tel ? 0.1 : 0.36), f.soin > 0 ? `+${f.soin}` : "PLEIN", "#7df0a0", Lay.tel ? 3 : 4, { ic: coeurPlein() });
            eclats(x, y, 9, [], { img: coeurPlein(), vit: 70, poids: -160, duree: 1, ouverture: Math.PI * 0.8 });
          } else {
            SON.elan();
            vu[k].elan += f.elan;
            peindreJeton(k);
            const ic = new Planche(13, 13);
            ic.drawImage(iconeDeRole("elan", "#d8c9ff"), 1, 1);
            nombre(x + g.sens * Lay.gw * (Lay.tel ? 0.15 : 0.3), y - Lay.gh * (Lay.tel ? 0.1 : 0.36), `+${f.elan}`, "#d8c9ff", Lay.tel ? 3 : 4, { ic: cerne(ic) });
            eclats(x, Lay.yF - 6, 12, ["#d8c9ff", "#8b5cf6", "#ffffff"], { angle: -Math.PI / 2, ouverture: 1.2, vit: 200, duree: 0.6 });
          }
          carteEl.sc.vit = 3;
        }
      });
      t += 800;
    }
    // les mots-clés se voient jouer, l'un après l'autre : l'icône s'allume sur la carte, le mot saute, le son suit
    const evts = [...fa.evts.map((e) => [fa, c, e] as const), ...fb.evts.map((e) => [fb, cb, e] as const)];
    evts.forEach(([f, carteEl, e], n) =>
      apres(t + n * 300, () => {
        const sur: Camp = e.sur ?? f.qui;
        const [x, y] = centreDe(sur, 0.62);
        const g = camps[sur];
        const def = M_.mots[e.mot];
        const unique = !!def?.unique;
        const mot = e.mot === "survie" ? "TIENT BON" : enCapitales(def?.nom ?? e.mot);
        carteEl.sc.vit = 3.4;
        allumer(carteEl, e.mot);
        SON.mot(e.mot, n);
        const suite = e.vie ? ` ${e.vie > 0 ? "+" : ""}${e.vie}` : e.energie ? ` ${e.energie > 0 ? "+" : ""}${e.energie}` : "";
        nombre(x + g.sens * Lay.gw * (Lay.tel ? 0.05 : 0.2), y - Lay.gh * (0.3 + (n % 2) * 0.14), mot + suite, couleurDuMot(e.mot, unique), Lay.tel ? 2 : 3, { duree: 1.1, ic: e.mot === "survie" ? null : iconeDeMot(e.mot, unique).copie() });
        if ((e.vie ?? 0) < 0) {
          perdreVie(sur, -(e.vie ?? 0));
          secouer(sur, 0.3);
        }
        if ((e.vie ?? 0) > 0) gagnerVie(sur, e.vie ?? 0);
        if (e.energie) {
          vu[sur].energie = Math.max(0, vu[sur].energie + e.energie);
          peindreEclairs(sur);
        }
        if (e.mot === "elan" || e.mot === "voleElan") {
          vu[sur].elan += e.n ?? 0;
          if (e.mot === "voleElan") vu[sur === "a" ? "b" : "a"].elan = 0;
          peindreJeton("a");
          peindreJeton("b");
        }
        if (e.mot === "saigne") {
          vu[sur].saigne += e.n ?? 0;
          peindreJeton(sur);
        }
        if (e.mot === "purge") {
          vu[sur].saigne = 0;
          peindreJeton(sur);
        }
      }),
    );
    if (evts.length) t += evts.length * 300 + 350;
    // le saignement, puis la fatigue : dès qu'elle a commencé, chaque manche coûte un point de plus
    const saignent = r.fini ? [] : ([["a", fa], ["b", fb]] as const).filter(([, f]) => f.saignement);
    if (saignent.length) {
      apres(t, () => {
        SON.mot("saigne");
        for (const [k, f] of saignent) {
          const [x, y] = centreDe(k, 0.55);
          const g = camps[k];
          perdreVie(k, f.saignement ?? 0);
          vu[k].saigne = Math.max(0, vu[k].saigne - (f.saignement ?? 0));
          peindreJeton(k);
          nombre(x + g.sens * Lay.gw * (Lay.tel ? 0.15 : 0.3), y - Lay.gh * 0.2, `-${f.saignement}`, "#ff6b7a", Lay.tel ? 3 : 4, { ic: iconeDeMot("saigne", false).copie() });
        }
      });
      t += 650;
    }
    if (r.fatigue.a + r.fatigue.b > 0) {
      apres(t, () => {
        SON.fatigue(Math.max(r.fatigue.a, r.fatigue.b));
        nombre(Lay.xc, Lay.yBan + (Lay.tel ? 52 : 44), "FATIGUE", "#e8c46a", Lay.tel ? 2 : 3, { duree: 1.2 });
        for (const k of ["a", "b"] as const) {
          const [x, y] = centreDe(k, 0.55);
          const g = camps[k];
          const fat = r.fatigue[k];
          if (!fat) continue;
          perdreVie(k, fat);
          if (!fige()) {
            g.sy.vit = -1.8;
            g.sx.vit = 1.2;
          }
          nombre(x + g.sens * Lay.gw * (Lay.tel ? 0.15 : 0.3), y - Lay.gh * (Lay.tel ? 0.1 : 0.36), `-${fat}`, "#e8c46a", Lay.tel ? 3 : 4);
          eclats(x, y - Lay.gh * 0.25, 7, [], { img: goutte(false), vit: 60, poids: 260, duree: 0.8, angle: -Math.PI / 2, ouverture: 2.4 });
        }
      });
      t += 900;
    }
    dernierRecit = recit(fa, fb, r);
    annoncer(dernierRecit);
    apres(t, () => {
      // ma carte revient dans la main, au repos
      c.lieu = "main";
      c.el.tabIndex = 0;
      c.el.classList.remove("dl-coupee");
      cb.lieu = "part";
      cb.vers = [camps.b.x, Lay.yG + Lay.gh * 0.5];
      apres(520, () => retirerCarte(cb));
      E.a = r.a;
      E.b = r.b;
      E.r = null;
      for (const k of ["a", "b"] as const) {
        vu[k].vie = Math.max(0, E[k]!.vie);
        peindreCoeurs(k);
      }
      const issue = o.defi ? o.defi.issue(r.a, r.b, r.fini, E.m - E.debut + 1) : null;
      if (r.fini || (issue && issue !== "en-cours")) {
        if (r.a.vie <= 0) tomber("a");
        if (r.b.vie <= 0) tomber("b");
        repeindreMain();
        apres(1000, () => finir(issue ? (issue === "reussi" ? 1 : -1) : M_.verdict(r.a, r.b)));
        return;
      }
      E.m++;
      SON.manche();
      repeindreMain();
      peindrePuces();
      apres(380, () => {
        for (const k of ["a", "b"] as const) for (let i = 0; i < P.ENERGIE_PAR_MANCHE; i++) SON.energie(i * 0.09 + (k === "b" ? 0.05 : 0));
        nouvelleManche();
      });
    });
    relancer();
  }
  /** Le coup porte : le Gaulois recule, le chiffre saute, les cœurs tombent un à un. */
  function blesser(k: Camp, n: number, role: string, force: number): void {
    if (n <= 0) return;
    const [x, y] = centreDe(k, 0.55);
    secouer(k, force * Math.min(1.7, 0.6 + n * 0.12));
    SON.coup(n, role);
    perdreVie(k, n);
    if (n >= 7) {
      const [gx, gy] = centreDe(k, 0.5);
      eclats(gx, gy, 18, ["#ffffff", "#ffd84a"], { vit: 320, duree: 0.5, taille: 2 });
    }
    nombre(x + camps[k].sens * Lay.gw * (Lay.tel ? 0.15 : 0.3), y - Lay.gh * (Lay.tel ? 0.1 : 0.36), `-${n}`, role === "renvoi" ? "#7fa6ff" : role === "recul" ? "#ffc08a" : "#ff6b7a", (Lay.tel ? 3 : 4) + (n >= 9 ? 2 : n >= 6 ? 1 : 0), { vx: -camps[k].sens * 14 });
    eclats(x, y, 8 + n * 3, role === "tete" ? ["#ffc08a", "#f5760f", "#ffffff"] : role === "renvoi" ? ["#a9c6ff", "#2f6bff", "#ffffff"] : ["#ffd84a", "#ff8a8f", "#ffffff"], { angle: camps[k].sens > 0 ? Math.PI : 0, ouverture: Math.PI * 0.9, vit: 190 + n * 14, duree: 0.55 });
  }
  function bouclier(k: Camp): void {
    const [x, y] = centreDe(k, 0.5);
    const g = camps[k];
    if (!fige()) {
      g.sx.vit = 2.2;
      g.sy.vit = -1.2;
    }
    const ic = new Planche(13, 13);
    ic.drawImage(iconeDeRole("garde", "#a9c6ff"), 1, 1);
    eclats(x + g.sens * Lay.gw * 0.3, y, 1, [], { img: cerne(ic), vit: 0, poids: -30, duree: 0.7 });
    eclats(x + g.sens * Lay.gw * 0.3, y, 10, ["#a9c6ff", "#2f6bff", "#ffffff"], { vit: 150, duree: 0.4 });
  }
  const nomDe = (f: FaitDuMoteur): string => `${ROLES[f.role].nom.toLowerCase()} ${f.force}${f.essouffle ? " essoufflée" : ""}`;
  function recit(fa: FaitDuMoteur, fb: FaitDuMoteur, r: MancheDuMoteur): string {
    const nom = (f: FaitDuMoteur): string => dessinDeLaCarte(M_, f.carte).nom;
    let t = `Tu poses ${nom(fa)}, ${nomDe(fa)}. En face : ${nom(fb)}, ${nomDe(fb)}. `;
    if (fa.pare) t += `Tu arrêtes ${fa.pare} et les renvoies. `;
    if (fb.pare) t += `Il arrête ${fb.pare} et les renvoie. `;
    if (fa.subis) t += `Tu perds ${fa.subis} de vie. `;
    if (fb.subis) t += `Il perd ${fb.subis} de vie. `;
    if (fa.coupe) t += "Ta carte est coupée. ";
    if (fb.coupe) t += "Sa carte est coupée. ";
    if (fa.soin) t += `Tu reprends ${fa.soin} de vie. `;
    if (fb.soin) t += `Il reprend ${fb.soin} de vie. `;
    if (r.a.elan) t += `Ton prochain coup gagne ${r.a.elan}. `;
    if (r.b.elan) t += `Son prochain coup gagne ${r.b.elan}. `;
    for (const [f, moi] of [[fa, true], [fb, false]] as const)
      for (const e of f.evts) {
        const def = M_.mots[e.mot];
        if (def) t += `${moi ? "Ta carte" : "Sa carte"} : ${def.nom.toLowerCase()}${e.n ? ` ${e.n}` : ""}. `;
      }
    if (r.fatigue.a || r.fatigue.b) t += `La fatigue te coûte ${r.fatigue.a} de vie, à lui ${r.fatigue.b}. `;
    return `${t}Il te reste ${Math.max(0, r.a.vie)} de vie, à lui ${Math.max(0, r.b.vie)}.`;
  }
  /** Le mot de la fin donné par `interrompre`. */
  let motImpose: string | null | undefined;
  function interrompre(v: -1 | 0 | 1, mot: string | null): void {
    if (detruit || scene.dataset["phase"] === "fin") return;
    // ce qui restait à montrer de la manche ne se joue plus, mais son résultat compte, et ce qui devait se ranger se range
    minuteurs.length = 0;
    if (E.r) {
      E.a = E.r.a;
      E.b = E.r.b;
      E.r = null;
    }
    for (const el of scene.querySelectorAll(".dl-fleche")) el.remove();
    for (const c of cartes.slice()) if (c.lieu === "part") retirerCarte(c);
    for (const k of ["a", "b"] as const) reposer(k);
    if (!GUIDE.fini && GUIDE.etape >= 4) finirLeGuide();
    if (!E.a || !E.b) {
      E.a = M_.camp(mainMoi, o.moi.options);
      E.b = M_.camp(mainLui, o.lui.options);
      avant.hidden = true;
    }
    for (const c of Mn.cartes) if (c.lieu === "table") c.lieu = "main";
    // la carte d'en face s'en va, comme à la fin d'une manche
    const cb = E.cb;
    if (cb) {
      cb.lieu = "part";
      cb.vers = [camps.b.x, Lay.yG + Lay.gh * 0.5];
      apres(520, () => retirerCarte(cb));
      E.cb = null;
    }
    motImpose = mot;
    finir(v);
  }
  function finir(v: number): void {
    const a = E.a!;
    const b = E.b!;
    scene.dataset["phase"] = "fin";
    bPoser.hidden = true;
    montrerIndice(null, "");
    Mn.sel = null;
    // sur un téléphone, la main laisse la place au résultat
    if (Lay.tel) {
      for (const c of Mn.cartes) {
        c.lieu = "part";
        c.vers = [c.x.v, Lay.H + 80];
        apres(500, () => retirerCarte(c));
      }
      Mn.cartes = [];
    }
    for (const k of ["a", "b"] as const) {
      camps[k].vu.vie = Math.max(0, E[k]!.vie);
      peindreCoeurs(k);
      peindreEclairs(k);
    }
    const titre = v > 0 ? "VICTOIRE" : v < 0 ? "DÉFAITE" : "ÉGALITÉ";
    ecrireEnPixels(finTitre, titre, "creme", { relief: "ombre" });
    finRuban.classList.toggle("jeu-ruban-bleu", v <= 0);
    finBilan.textContent = "";
    for (const [k, nom] of [["a", o.moi.ruban], ["b", o.lui.ruban]] as const) {
      const s = cree("span", "", finBilan);
      const vie = Math.max(0, E[k]!.vie);
      ecrireEnPixels(cree("span", "", s), nom, "doux", { muet: true });
      const i = cree("i", "dl-etq", s);
      i.style.cssText = `--i:${urlDeLaPlanche(`duel-coeur|${vie > 0}|${estSombre()}`, () => (vie > 0 ? coeurPlein() : coeurVide(tons)))};--w:7;--h:7`;
      ecrireEnPixels(cree("span", "", s), String(vie), "texte", { muet: true });
    }
    finBilan.setAttribute("aria-label", `${o.moi.dit} : ${Math.max(0, a.vie)} de vie. En face : ${Math.max(0, b.vie)}.`);
    const deux = a.vie <= 0 && b.vie <= 0;
    finChute.hidden = !deux;
    if (deux) ecrireEnPixels(finChute, v !== 0 ? `LES DEUX TOMBENT : IL TE MANQUAIT ${-a.vie} DE VIE, À LUI ${-b.vie}` : "LES DEUX TOMBENT D'AUSSI HAUT", "texte", { plie: true });
    const resultat: FinDuDuel = { verdict: v, manches: E.m, vieMoi: Math.max(0, a.vie), vieLui: Math.max(0, b.vie) };
    const mot = motImpose !== undefined ? motImpose : (o.motDeFin?.(resultat) ?? null);
    finMot.hidden = !mot;
    finMot.textContent = mot ?? "";
    majApercu();
    montrerFiche(null);
    guide(0);
    if (v > 0) {
      SON.victoire();
      for (const d of [900, 1300, 1700])
        apres(d, () => {
          const x = Lay.bx + 40 + Math.random() * (Lay.bw - 80);
          eclats(x, Lay.yBan + 30, 16, ["#ffd84a", "#e0263a", "#2f6bff", "#f6f1e3", "#3fce6a"], { angle: Math.PI / 2, ouverture: 2.6, vit: 160, duree: 1.4, poids: 260 });
        });
      for (const d of [0, 420]) apres(d, () => sauter("a"));
      for (const d of [0, 330, 660, 990]) apres(d, () => bondir("a", 430));
      for (const [d, n, couls] of [
        [0, 40, ["#ffd84a", "#2f6bff", "#f6f1e3", "#e0263a"]],
        [500, 26, ["#ffd84a", "#fff2a8", "#f6f1e3"]],
      ] as const)
        apres(d, () => {
          const [x, y] = centreDe("a", 0.9);
          eclats(x, y, n, couls, { angle: -Math.PI / 2, ouverture: 1.8, vit: 300, duree: 1.2, poids: 360 });
        });
    } else if (v < 0) {
      SON.defaite();
      sauter("b");
      for (const d of [0, 330, 660]) apres(d, () => bondir("b", 430));
    } else SON.egalite();
    annoncer(`${v > 0 ? "Victoire" : v < 0 ? "Défaite" : "Égalité"} à la manche ${E.m}. Il te reste ${Math.max(0, a.vie)} de vie, à ton adversaire ${Math.max(0, b.vie)}.${mot ? ` ${mot}` : ""}`);
    fin.hidden = false;
    apres(60, () => bRejouer.focus({ preventScroll: true }));
    o.onFin(resultat);
    relancer();
  }

  /* ---------- Ce qui va se passer, avant de poser : le coup et sa flèche, la garde, la vie qui reviendrait, l'énergie dépensée ---------- */
  function majApercu(): void {
    const c = Mn.sel;
    apercu.textContent = "";
    apercu.hidden = !(c && scene.dataset["phase"] === "choix");
    if (scene.dataset["phase"] === "choix" && E.a) peindreEclairs("a", c ? Math.min(E.a.energie, c.carte.c) : 0);
    if (apercu.hidden || !c || !E.a) return;
    const st = etatDe(c.carte);
    const r = ROLES[c.carte.role];
    const k = Lay.tel ? 2 : 3;
    const A = camps.a;
    const B = camps.b;
    const coup = M_.estCoup(c.carte.role);
    const plus = c.carte.role === "souffle" || c.carte.role === "elan";
    const texte = `${plus ? "+" : ""}${st.force}`;
    const ecrit = ecrire(texte, "#ffffff");
    const pastille = new Planche(15 + String(st.force).length * 12 + 6, 19);
    rr(pastille, 0, 0, pastille.width, 19, 3, PAL.k);
    rr(pastille, 1, 1, pastille.width - 2, 17, 2, r.coul);
    pastille.drawImage(iconeDeRole(c.carte.role, "#ffffff"), 3, 4);
    pastille.drawImage(ecrit, plus ? 13 : 17, 3, ecrit.width * 2, ecrit.height * 2);
    const y = Lay.yG + Math.round(Lay.gh * (Lay.tel ? 0.1 : 0.2));
    const x0 = A.x + Math.round(Lay.gw * 0.3);
    const cvP = toileDe(pastille);
    cvP.style.cssText = `position:absolute;left:${x0}px;top:${y}px;width:${pastille.width * (k - 1)}px;height:${19 * (k - 1)}px`;
    apercu.append(cvP);
    if (c.carte.role === "garde") {
      const b = new Planche(13, 13);
      b.drawImage(iconeDeRole("garde", "#a9c6ff"), 1, 1);
      cerne(b, "#070b1f");
      const kb = Lay.gs + 1;
      const cv = toileDe(b);
      cv.style.cssText = `position:absolute;left:${A.x + Math.round(Lay.gw * 0.22)}px;top:${Lay.yG + Math.round(Lay.gh * 0.45)}px;width:${13 * kb}px;height:${13 * kb}px`;
      apercu.append(cv);
    }
    if (c.carte.role === "souffle") {
      const rend = Math.min(st.force ?? 0, E.a.vieMax - E.a.vie);
      const t = ecrire(rend > 0 ? `+${rend}` : "PLEIN", rend > 0 ? "#3fce6a" : "#f6f1e3", null, "#070b1f");
      const [ex, ey] = lieuDuCoeur("a");
      const cv = toileDe(t);
      cv.style.cssText = `position:absolute;left:${Math.round(ex - t.width)}px;top:${Math.round(ey + 26)}px;width:${t.width * 2}px;height:${t.height * 2}px`;
      apercu.append(cv);
    }
    if (coup) {
      const x1 = x0 + pastille.width * (k - 1) + 4;
      const x2 = B.x - Math.round(Lay.gw * 0.3);
      const n = Math.max(1, Math.floor((x2 - x1) / 16));
      const fl = new Planche(n * 8, 7);
      for (let i = 0; i < n; i++) fl.drawImage(grille(["ww....", ".ww...", "..ww..", "...ww.", "..ww..", ".ww...", "ww...."], { w: i === n - 1 ? "#ffffff" : r.coul }), i * 8, 0);
      const cv = toileDe(fl);
      cv.style.cssText = `position:absolute;left:${x1}px;top:${y + (19 * (k - 1)) / 2 - 7}px;width:${n * 16}px;height:14px`;
      apercu.append(cv);
    }
  }
  /** La flèche d'un coup pendant qu'il part : de celui qui cogne à sa cible, jusqu'à l'impact. */
  function fleche(qui: Camp, role: Role): void {
    if (fige()) return;
    const A = camps[qui];
    const B = camps[qui === "a" ? "b" : "a"];
    const r = ROLES[role];
    const x1 = Math.min(A.x, B.x) + Math.round(Lay.gw * 0.4);
    const x2 = Math.max(A.x, B.x) - Math.round(Lay.gw * 0.4);
    const n = Math.max(1, Math.floor((x2 - x1) / 16));
    const fl = new Planche(n * 8, 7);
    for (let i = 0; i < n; i++) fl.drawImage(grille(["ww....", ".ww...", "..ww..", "...ww.", "..ww..", ".ww...", "ww...."], { w: r.coul }), i * 8, 0);
    const cv = toileDe(fl);
    cv.className = "dl-fleche";
    cv.style.cssText = `left:${x1}px;top:${Lay.yG + Math.round(Lay.gh * (qui === "a" ? 0.3 : 0.42))}px;width:${n * 16}px;height:14px;${A.sens < 0 ? "transform:scaleX(-1)" : ""}`;
    scene.append(cv);
    apres(520, () => cv.remove());
  }
  /** L'icône d'un mot-clé s'allume sur la carte posée : un petit éclat à sa place, dans la colonne de droite. */
  function allumer(carteEl: CarteVive, mot: string): void {
    const i = carteEl.carte.liste.findIndex(([m]) => m === mot);
    if (i < 0 || fige()) return;
    const s = carteEl.sc.v * 2;
    const x = carteEl.x.v + (68 - 8.5 - 34) * s;
    const y = carteEl.y.v + (17 + i * 12 + 5.5 - 44) * s;
    eclats(x, y, 9, [couleurDuMot(mot, !!M_.mots[mot]?.unique), "#ffffff"], { vit: 120, duree: 0.5, poids: 80 });
  }

  /* ---------- Le premier duel guidé : quatre bulles, puis plus rien ---------- */
  const GUIDE = { fini: !o.guide, etape: 0 };
  const BULLES: Record<number, [string, () => Element | null | undefined, "haut" | "bas"]> = {
    1: ["Choisis une carte. Son badge dit ce qu'elle fait et sa force ; la pastille, son prix en énergie.", () => (Mn.cartes[2] ?? Mn.cartes[0])?.el, "haut"],
    2: ["Pose-la ici : glisse-la, ou appuie sur la coche. Sa carte à lui est déjà posée, cachée.", () => camps.a.p.fente, "haut"],
    3: ["Une carte jouée se repose : le sablier compte les manches. Voici ses cartes à lui.", () => elCampB.querySelector(".dl-puces"), "bas"],
    4: ["La fatigue approche. Quand le compte arrive à zéro, chacun perd de la vie à chaque manche.", () => elCampA.querySelector(".dl-manches"), "bas"],
  };
  function guide(n: number): void {
    if (GUIDE.fini || !n || n < GUIDE.etape) {
      if (!n || GUIDE.fini) bulle.hidden = true;
      return;
    }
    if (n === GUIDE.etape && !bulle.hidden) return;
    GUIDE.etape = n;
    const [texte, ancre, cote] = BULLES[n]!;
    const a = ancre();
    if (!a) return;
    bulleP.textContent = texte;
    bullePas.textContent = `${n} sur 4`;
    bulle.hidden = false;
    bulle.dataset["cote"] = cote;
    apres(60, () => {
      const r = a.getBoundingClientRect();
      const s = scene.getBoundingClientRect();
      const w = bulle.offsetWidth;
      const h = bulle.offsetHeight;
      const cx = r.left - s.left + r.width / 2;
      const x = borne(cx - w / 2, 6, Lay.L - w - 6);
      bulle.style.left = `${x}px`;
      bulle.style.top = `${cote === "haut" ? r.top - s.top - h - 12 : r.bottom - s.top + 12}px`;
      bulle.style.setProperty("--fx", `${borne(cx - x, 14, w - 14)}px`);
    });
    if (n === 4) apres(9000, () => finirLeGuide());
  }
  function finirLeGuide(): void {
    GUIDE.fini = true;
    bulle.hidden = true;
    try {
      localStorage.setItem(CLE_DU_GUIDE, "vu");
    } catch {
      // Sans stockage, le guide reviendra au prochain duel.
    }
  }
  bullePasser.addEventListener("click", finirLeGuide);

  /* ---------- Les gestes ---------- */
  bEntrer.addEventListener("click", entrer);
  bPoser.addEventListener("click", () => {
    if (Mn.sel) poser(Mn.sel);
  });
  bRejouer.addEventListener("click", () => {
    SON.clic();
    o.onRejouer();
  });
  bQuitter.addEventListener("click", () => {
    SON.clic();
    o.onQuitter();
  });
  // au clavier ; à la souris et au doigt, c'est la rangée qui décide
  scene.addEventListener("click", (e) => {
    const b = (e.target as Element).closest(".dl-carte");
    if (b && e.detail === 0) {
      const c = Mn.cartes.find((x) => x.el === b);
      if (c) toucher(c);
    }
  });
  scene.addEventListener("focusin", (e) => {
    const b = (e.target as Element).closest(".dl-carte");
    if (b && b.matches(":focus-visible")) {
      Mn.survol = Mn.cartes.find((x) => x.el === b) ?? null;
      majIndice();
      relancer();
    }
  });
  scene.addEventListener("focusout", (e) => {
    if ((e.target as Element).closest(".dl-carte") && !Mn.prise) {
      Mn.survol = null;
      majIndice();
      relancer();
    }
  });
  const surTouche = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && Mn.sel) {
      Mn.sel = null;
      majSel();
    }
  };
  document.addEventListener("keydown", surTouche);
  const surGeste = (): void => reveillerLeSon();
  scene.addEventListener("pointerdown", surGeste, true);
  scene.addEventListener("keydown", surGeste, true);

  // Le thème change : les cœurs vides, les pierres et la fin suivent. La pause du jeu (`fx-off`) : tout s'arrête.
  const reagir = (): void => {
    if (detruit) return;
    tons = TONS_DU_THEME[estSombre() ? "sombre" : "clair"];
    for (const k of ["a", "b"] as const) {
      peindreCoeurs(k);
      peindreEclairs(k);
    }
    if (!motionAllowed()) {
      for (const n of nombres) n.el.remove();
      nombres.length = 0;
      grains.length = 0;
    }
    relancer();
  };
  const veilleur = new MutationObserver(reagir);
  veilleur.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-mode"] });
  const reduit = matchMedia("(prefers-reduced-motion: reduce)");
  reduit.addEventListener("change", reagir);
  const vue = new IntersectionObserver((es) => {
    for (const e of es) visible = e.isIntersecting;
    relancer();
  });
  vue.observe(scene);
  let largeurVue = 0;
  let hauteurVue = 0;
  const taille = new ResizeObserver(() => {
    const w = racine.clientWidth;
    if (w < 200 || (w === largeurVue && Math.abs(window.innerHeight - hauteurVue) < 120)) return;
    largeurVue = w;
    hauteurVue = window.innerHeight;
    mesurer();
  });
  const surVisibilite = (): void => relancer();
  document.addEventListener("visibilitychange", surVisibilite);

  peindreBanniere();
  icEntrer.style.setProperty("--i", urlDeLaPlanche("duel-epees", () => epeesCroisees()));
  preparer(true);
  if (o.entreeDirecte) {
    avant.hidden = true;
    apres(450, entrer);
  }
  largeurVue = racine.clientWidth;
  hauteurVue = window.innerHeight;
  taille.observe(racine);
  relancer();

  return {
    changerCarte,
    main: () => mainMoi.map((c) => c.id),
    interrompre,
    arreter: () => {
      detruit = true;
      pause = true;
      cancelAnimationFrame(raf);
      raf = 0;
      veilleur.disconnect();
      vue.disconnect();
      taille.disconnect();
      reduit.removeEventListener("change", reagir);
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("visibilitychange", surVisibilite);
      racine.textContent = "";
    },
  };
}

