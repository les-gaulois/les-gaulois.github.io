/**
 * Les événements du monde d'OpenFront autour du village (demande du pilote, 14 novembre 2026 : « train ; missile »,
 * « tir et explosion, le missile monte exploser ») : un train qui vient au port et repart, un échange de tirs entre notre
 * navire et celui d'en face, un missile qui sort du silo et va exploser sur le camp d'en face, une fusée d'en face que la
 * batterie arrête en l'air. C'est un décor animé : rien ne vient d'une vraie partie, rien ne change une valeur, et aucun
 * texte ne les présente comme des parties.
 *
 * Tout est réglé sur l'horloge du monde (huit temps par seconde), dans un cycle de dix minutes : la même heure du cycle
 * donne la même scène. Dans l'ordre : un échange de tirs, le lancement, un autre échange de tirs, le train, l'interception. Les événements sont espacés d'une minute au moins, lents, sans éclair ni clignotement (les dessins
 * des tirs et des explosions n'ont jamais de blanc, `../openfront/`), sans sang ni victime : les explosions tombent sur
 * l'eau ou sur le pré devant les tentes. Figé (bouton pause, « réduire les animations »), il ne se passe rien.
 * Calculs purs : ce fichier ne dit que quoi dessiner et où. Design : Claude Fable 5.2.
 */
import { type Decor, Planche } from "../decor";
import type { Lumiere } from "../lumiere";
import type { PieceOpenFrontId } from "../openfront";
import { couleursDeLEau } from "./pieces";
import { type Emplacement, PIED, type Plan, RAIL, emplacementOpenFront, emplacementsDe, hautDansLeMonde } from "./plan";

/** La durée du cycle des événements, en temps (huitièmes de seconde) : dix minutes. */
export const CYCLE = 4800;
/**
 * Où commence chaque événement dans le cycle, et ce qu'il dure au plus (en temps) : passé ce temps, il ne montre plus rien.
 * L'almanach des petits moments (`almanach/programme.ts`) lit ces bornes pour ne jamais jouer en même temps qu'eux.
 */
export const DUELS = [700, 3100] as const;
export const DUREE_DU_DUEL = 240;
export const LANCEMENT = 1700;
export const DUREE_DU_LANCEMENT = 330;
const INTERCEPTION = 4000;
const DUREE_DE_L_INTERCEPTION = 200;
/** Le train : son départ dans le cycle, sa vitesse (en cases par temps) et le temps que dure son passage, au plus. */
const TRAIN = 3500;
const VITESSE_DU_TRAIN = { min: 8, max: 14 };
const PASSAGE_DU_TRAIN = 720;

/** Un dessin d'événement qui n'est pas une pièce d'OpenFront : la gerbe d'eau d'un obus, les deux petites fusées. */
export type DessinDEvenement = PieceOpenFrontId | "gerbe" | "fusee" | "fusee-d-en-face";

/** Ce que l'écran doit montrer à un instant : un dessin, son image, son coin haut gauche dans le monde. */
export interface Lutin {
  cle: string;
  dessin: DessinDEvenement;
  image: number;
  x: number;
  y: number;
  /** Retourné de gauche à droite. */
  miroir?: boolean;
  /** Tourné dans le sens des aiguilles d'une montre, en degrés (le missile : 0 quand il monte, 90 quand il file, 180 quand il tombe). */
  angle?: 0 | 45 | 90 | 135 | 180;
  /** La rangée du monde sous laquelle il ne se voit pas (le missile encore dans son silo). */
  coupe?: number;
  /** La colonne du monde à droite de laquelle il ne se voit pas (le train qui entre au dépôt du port). */
  coupeADroite?: number;
  /** La rangée de son pied : ce qui est plus bas à l'écran passe devant. */
  pied: number;
}

const borner = (v: number): number => Math.min(1, Math.max(0, v));
const entre = (a: number, b: number, part: number): number => a + (b - a) * part;
/** Un départ en douceur, une arrivée en douceur. */
const doux = (t: number): number => {
  const v = borner(t);
  return v * v * (3 - 2 * v);
};

/**
 * Le train : une fois par cycle, il arrive de l'ouest, traverse le bas et entre au dépôt du port, où il disparaît. Il ne
 * reste qu'une minute et demie au plus (le pilote, 14 novembre 2026 : « je peux l'espacer »), même quand le village est
 * grand : il va alors un peu plus vite, sans jamais se presser.
 */
function train(plan: Plan, tailles: (id: PieceOpenFrontId) => { largeur: number; hauteur: number }, dt: number, lutins: Lutin[]): void {
  const longueur = tailles("locomotive").largeur + tailles("wagon-voyageurs").largeur + tailles("wagon-citerne").largeur + tailles("wagon-marchandises").largeur;
  // L'avant de la locomotive part du bord ouest du monde (le train est encore caché) ; le dernier wagon finit dans le dépôt.
  const depot = plan.voie.a - 30;
  const course = depot + longueur;
  const vitesse = Math.min(VITESSE_DU_TRAIN.max, Math.max(VITESSE_DU_TRAIN.min, Math.ceil(course / PASSAGE_DU_TRAIN)));
  if (dt < 0 || dt * vitesse > course) return;
  const avance = dt * vitesse;
  const image = Math.floor(avance / 5);
  let x = Math.round(avance);
  for (const id of ["locomotive", "wagon-voyageurs", "wagon-citerne", "wagon-marchandises"] as const) {
    const taille = tailles(id);
    x -= taille.largeur;
    if (x >= depot) continue;
    lutins.push({ cle: `train-${id}`, dessin: id, image, x, y: plan.dyBas + RAIL - taille.hauteur, coupeADroite: depot, pied: plan.dyBas + RAIL + 6 });
  }
}

/** La bouche du canon avant de notre navire de guerre, dans son dessin ; celle du navire d'en face est son miroir. */
const BOUCHE = { x: 260, y: 96 };
const TIR = { largeur: 64, bouche: 22 };

/** Un coup de canon d'un navire vers l'autre : la bouffée, l'obus qui monte et retombe, la gerbe sur l'eau, près de la cible. */
function coup(plan: Plan, de: Emplacement, vers: Emplacement, versLaDroite: boolean, dt: number, nom: string, lutins: Lutin[]): void {
  if (dt < 0 || dt > 90) return;
  const bouche = { x: de.x + (versLaDroite ? BOUCHE.x : de.largeur - 1 - BOUCHE.x), y: hautDansLeMonde(de) + BOUCHE.y };
  const flottaison = vers.dy + vers.pied;
  // L'obus tombe à l'eau devant la cible, jamais dessus.
  const chute = { x: versLaDroite ? vers.x - 90 : vers.x + vers.largeur + 90, y: flottaison - 2 };
  const pied = Math.max(de.dy + de.pied, flottaison) + 4;
  if (dt < 15) lutins.push({ cle: `${nom}-tir`, dessin: "tir-canon", image: Math.floor(dt / 3), x: versLaDroite ? bouche.x : bouche.x - TIR.largeur + 1, y: bouche.y - TIR.bouche, miroir: !versLaDroite, pied });
  if (dt >= 3 && dt < 55) {
    const part = (dt - 3) / 52;
    lutins.push({ cle: `${nom}-obus`, dessin: "obus", image: Math.floor(dt / 4) % 2, x: Math.round(entre(bouche.x, chute.x, part)) - 7, y: Math.round(entre(bouche.y, chute.y, part) - 90 * 4 * part * (1 - part)) - 2, miroir: !versLaDroite, pied });
  }
  if (dt >= 55 && dt < 87) lutins.push({ cle: `${nom}-gerbe`, dessin: "gerbe", image: Math.floor((dt - 55) / 8), x: chute.x - 20, y: chute.y - 47, pied });
}

/** L'échange de tirs : notre navire tire, celui d'en face répond une quinzaine de secondes plus tard. */
function duel(plan: Plan, dt: number, lutins: Lutin[]): void {
  if (dt < 0 || dt > DUREE_DU_DUEL) return;
  const notre = emplacementOpenFront(plan, "navire-guerre");
  const enFace = emplacementOpenFront(plan, "navire-ennemi");
  coup(plan, notre, enFace, true, dt, "notre", lutins);
  coup(plan, enFace, notre, false, dt - 130, "leur", lutins);
}

/** Le lancement : la trappe du silo s'ouvre, le missile monte, file au-dessus du village, et tombe exploser devant le camp d'en face. */
function lancement(plan: Plan, tailles: (id: PieceOpenFrontId) => { largeur: number; hauteur: number }, dt: number, lutins: Lutin[]): void {
  if (dt < 0 || dt > DUREE_DU_LANCEMENT) return;
  const silo = emplacementOpenFront(plan, "silo");
  const camp = emplacementsDe(plan, "camp")[0]!;
  const bouche = { x: silo.x + 120, y: hautDansLeMonde(silo) + 78 };
  // La trappe : elle s'ouvre en cinq secondes, reste ouverte, puis se referme une fois le missile parti.
  const trappe = dt < 39 ? 1 + Math.floor(dt / 13) : dt < 170 ? 3 : dt < 209 ? 3 - Math.floor((dt - 170) / 13) : 0;
  if (trappe > 0) lutins.push({ cle: "silo-trappe", dessin: "silo", image: trappe, x: silo.x, y: hautDansLeMonde(silo), pied: silo.dy + silo.pied + 2 });
  const missile = tailles("missile");
  const altitude = plan.dy0 + 20;
  const cible = { x: camp.x - 70, y: plan.dy0 + PIED + 8 };
  const pied = plan.hauteur;
  const image = Math.floor(dt / 2) % 2;
  if (dt >= 40 && dt < 130) {
    // Il monte, de plus en plus vite ; tant qu'il est dans le silo, on ne voit que ce qui dépasse de la bouche.
    const part = (dt - 40) / 90;
    lutins.push({ cle: "missile", dessin: "missile", image, x: bouche.x - missile.largeur / 2, y: Math.round(entre(bouche.y, altitude, part * part)), coupe: bouche.y, pied: silo.dy + silo.pied + 1 });
  } else if (dt >= 130 && dt < 250) {
    // Il s'incline, file au-dessus du village, puis pique.
    const part = doux((dt - 130) / 120);
    const angle = dt < 138 ? 45 : dt >= 242 ? 135 : 90;
    lutins.push({ cle: "missile", dessin: "missile", image, x: Math.round(entre(bouche.x, cible.x - 30, part)) - missile.hauteur / 2, y: altitude - Math.round(30 * Math.sin(Math.PI * part)), angle, pied });
  } else if (dt >= 250 && dt < 285) {
    const part = (dt - 250) / 35;
    lutins.push({ cle: "missile", dessin: "missile", image, x: cible.x - missile.largeur / 2 - 30 + Math.round(30 * part), y: Math.round(entre(altitude, cible.y - missile.hauteur, part * part)), angle: 180, pied });
  } else if (dt >= 285 && dt < 325) {
    const explosion = tailles("explosion");
    lutins.push({ cle: "explosion", dessin: "explosion", image: Math.floor((dt - 285) / 5), x: cible.x - explosion.largeur / 2, y: cible.y - explosion.hauteur + 1, pied });
  }
}

/** Une fusée d'en face part de son navire vers le village ; la batterie tire, et l'arrête en l'air, au-dessus de la mer. */
function interception(plan: Plan, tailles: (id: PieceOpenFrontId) => { largeur: number; hauteur: number }, dt: number, lutins: Lutin[]): void {
  if (dt < 0 || dt > DUREE_DE_L_INTERCEPTION) return;
  const batterie = emplacementOpenFront(plan, "batterie");
  const enFace = emplacementOpenFront(plan, "navire-ennemi");
  const bouche = { x: batterie.x + 74, y: hautDansLeMonde(batterie) + 40 };
  // Le point de rencontre : en haut à gauche de la batterie, dans l'axe de son tube.
  const rencontre = { x: bouche.x - 300, y: bouche.y - 146 };
  const depart = { x: enFace.x + 150, y: hautDansLeMonde(enFace) + 40 };
  const pied = plan.hauteur;
  if (dt < 160) {
    const part = dt / 160;
    lutins.push({ cle: "fusee-d-en-face", dessin: "fusee-d-en-face", image: Math.floor(dt / 3) % 2, x: Math.round(entre(depart.x, rencontre.x, part)) - 15, y: Math.round(entre(depart.y, rencontre.y, part) - 120 * Math.sin(Math.PI * part)) - 4, pied });
  }
  // La batterie tire : ses quatre images de tir, une fois, puis sa fusée monte à la rencontre de l'autre.
  if (dt >= 96 && dt < 116) lutins.push({ cle: "batterie-tir", dessin: "batterie", image: 4 + Math.floor((dt - 96) / 5), x: batterie.x, y: hautDansLeMonde(batterie), pied: batterie.dy + batterie.pied + 2 });
  if (dt >= 104 && dt < 160) {
    const part = (dt - 104) / 56;
    lutins.push({ cle: "fusee", dessin: "fusee", image: Math.floor(dt / 3) % 2, x: Math.round(entre(bouche.x, rencontre.x, part)) - 9, y: Math.round(entre(bouche.y, rencontre.y, part)) - 3, pied });
  }
  if (dt >= 160 && dt < 190) {
    const boule = tailles("interception");
    lutins.push({ cle: "interception", dessin: "interception", image: Math.floor((dt - 160) / 6), x: rencontre.x - Math.floor(boule.largeur / 2), y: rencontre.y - 38, pied });
  }
}

/**
 * Ce que les événements montrent au temps `temps` de l'horloge du monde : rien la plupart du temps, puis un train, un
 * échange de tirs, un lancement ou une interception. `tailles` : la taille de chaque pièce d'OpenFront. `lancement` à
 * faux : ce cycle-ci, le missile reste dans son silo, la place est à un petit moment de l'almanach (`almanach/programme.ts`).
 */
export function lutinsDesEvenements(plan: Plan, tailles: (id: PieceOpenFrontId) => { largeur: number; hauteur: number }, temps: number, options: { lancement?: boolean } = {}): Lutin[] {
  const u = ((Math.floor(temps) % CYCLE) + CYCLE) % CYCLE;
  const lutins: Lutin[] = [];
  train(plan, tailles, u - TRAIN, lutins);
  for (const debut of DUELS) duel(plan, u - debut, lutins);
  if (options.lancement !== false) lancement(plan, tailles, u - LANCEMENT, lutins);
  interception(plan, tailles, u - INTERCEPTION, lutins);
  return lutins;
}

/* ---------- Les dessins propres aux événements ---------- */

/** La gerbe d'eau d'un obus tombé à la mer, en quatre images : elle jaillit, monte, s'ouvre, retombe en gouttes. 40 × 48 cases. */
export function gerbe(l: Lumiere, image: number): Decor {
  const eau = couleursDeLEau(l);
  const pl = new Planche(40, 48);
  const haut = [14, 34, 40, 22][Math.min(3, Math.max(0, image))]!;
  const demi = [5, 6, 9, 12][Math.min(3, Math.max(0, image))]!;
  for (let k = 0; k < haut; k++) {
    const y = 47 - k;
    const part = k / haut;
    const large = image < 3 ? Math.max(1, Math.round(demi * (1 - part * 0.7))) : Math.round(demi * (0.4 + part));
    for (let dx = -large; dx <= large; dx++) {
      // En retombant, la gerbe n'est plus qu'un semis de gouttes.
      if (image === 3 && (dx * 7 + k * 3) % 5 !== 0) continue;
      if (image === 2 && part > 0.6 && (dx + k) % 2 !== 0) continue;
      pl.poser(20 + dx, y, Math.abs(dx) === large ? eau.claire : part > 0.5 ? eau.ecume : (dx + k) % 3 === 0 ? eau.claire : eau.ecume);
    }
  }
  // Les ronds dans l'eau, au pied.
  pl.rect(20 - demi - 4, 47, demi * 2 + 9, 1, (i) => (i % 2 === 0 ? eau.ecume : null));
  return pl.decor();
}

/** Une petite fusée, pointe à gauche, en deux images de flamme : celle de la batterie (aux couleurs du clan) ou celle d'en face (prune). */
export function fusee(image: number, enFace: boolean): Decor {
  const corps = enFace ? { c: "#7a5a94", s: "#3a2848", p: "#c4b0d8" } : { c: "#e8e6e0", s: "#2456b8", p: "#c8283a" };
  const pl = new Planche(enFace ? 30 : 18, enFace ? 9 : 7);
  const long = enFace ? 20 : 11;
  const milieu = enFace ? 4 : 3;
  for (let x = 0; x < long; x++) {
    const demi = x < 3 ? Math.floor(x / 2) : enFace ? 2 : 1;
    for (let dy = -demi; dy <= demi; dy++) pl.poser(x, milieu + dy, x < 3 ? corps.p : dy === demi ? corps.s : corps.c);
  }
  pl.rect(long - 3, 0, 3, enFace ? 9 : 7, (_i, j) => (j === milieu ? null : corps.s));
  // La flamme : orange puis jaune pâle, jamais blanche ; elle s'allonge d'une image à l'autre.
  const flamme = (enFace ? 6 : 4) + (image % 2) * 2;
  for (let k = 0; k < flamme; k++) pl.poser(long + k, milieu, k < flamme / 2 ? "#ffd75a" : "#f58a1f");
  for (let k = 0; k < flamme - 2; k++) {
    pl.poser(long + k, milieu - 1, "#f58a1f");
    pl.poser(long + k, milieu + 1, "#f58a1f");
  }
  return pl.decor();
}

/** Le même dessin, retourné de gauche à droite. */
export function enMiroir(dessin: Decor): Decor {
  const cases = new Array<string | null>(dessin.cases.length).fill(null);
  for (let y = 0; y < dessin.hauteur; y++) for (let x = 0; x < dessin.largeur; x++) cases[y * dessin.largeur + (dessin.largeur - 1 - x)] = dessin.cases[y * dessin.largeur + x] ?? null;
  return { largeur: dessin.largeur, hauteur: dessin.hauteur, cases };
}

/**
 * Le même dessin, tourné autour de son milieu dans le sens des aiguilles d'une montre : un quart ou un demi-tour (sans
 * perte), ou un huitième de tour (au plus proche voisin). Le dessin rendu est un carré du plus grand côté quand il penche.
 */
export function tourne(dessin: Decor, angle: 0 | 45 | 90 | 135 | 180): Decor {
  if (angle === 0) return dessin;
  const { largeur: L, hauteur: H } = dessin;
  if (angle === 180) {
    const cases = new Array<string | null>(L * H).fill(null);
    for (let i = 0; i < L * H; i++) cases[L * H - 1 - i] = dessin.cases[i] ?? null;
    return { largeur: L, hauteur: H, cases };
  }
  if (angle === 90) {
    const cases = new Array<string | null>(L * H).fill(null);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) cases[x * H + (H - 1 - y)] = dessin.cases[y * L + x] ?? null;
    return { largeur: H, hauteur: L, cases };
  }
  const cote = Math.max(L, H);
  const cases = new Array<string | null>(cote * cote).fill(null);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      // La case d'origine de cette case d'arrivée : la rotation inverse.
      const dx = x - cote / 2 + 0.5;
      const dy = y - cote / 2 + 0.5;
      const sx = Math.floor(L / 2 + dx * cos + dy * sin);
      const sy = Math.floor(H / 2 - dx * sin + dy * cos);
      if (sx >= 0 && sx < L && sy >= 0 && sy < H) cases[y * cote + x] = dessin.cases[sy * L + sx] ?? null;
    }
  }
  return { largeur: cote, hauteur: cote, cases };
}
