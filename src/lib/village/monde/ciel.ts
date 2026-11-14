/**
 * Le ciel et les lointains du monde du village. Demande du pilote, le 14 novembre 2026 : « je veux un maximum de détail,
 * ça doit être immersif ». Tout est dessiné case par case, et tout suit l'heure de Paris (`lumiere.ts`) :
 * - le ciel, un dégradé fin et tramé (sans bandes visibles), rougi à l'aube et au crépuscule du côté du soleil ;
 * - le soleil et son halo ; la lune, son halo et sa vraie phase du jour (calculée sur la date) ;
 * - la nuit, des étoiles de trois tailles et de trois teintes, et une voie lactée discrète. Elles ne scintillent pas ;
 * - deux couches de nuages, que l'écran fait dériver très lentement ;
 * - quatre plans lointains qui glissent moins vite que le village (parallaxe) : des montagnes bleutées, des collines avec
 *   leurs champs et un lac, la forêt au loin, puis la lisière ; de la brume au pied des arbres au lever du jour.
 *
 * Rien n'est tiré au hasard à l'écran : la même taille, la même heure et la même date donnent le même dessin. Aucun de ces
 * dessins ne montre un chiffre : ils ne disent rien du clan. Design : Claude Fable 5.2.
 */
import { type Decor, type Palette, alea } from "../decor";
import { type Lumiere, cielDuVillage, couleurDuDehors, melanger } from "../lumiere";

/** La trame de Bayer 4 × 4 : elle mêle deux teintes voisines en damiers de plus en plus serrés, sans bande. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const trame = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

const borner = (v: number): number => Math.min(1, Math.max(0, v));

/* ---------- La lune ---------- */

/** La durée d'une lunaison, en jours, et une nouvelle lune de référence (le 6 janvier 2000 à 18 h 14 UTC). */
const LUNAISON = 29.530588853;
const NOUVELLE_LUNE = Date.UTC(2000, 0, 6, 18, 14);

/** La phase de la lune à cette date : 0 nouvelle lune, 0,25 premier quartier, 0,5 pleine lune, 0,75 dernier quartier. */
export function phaseDeLaLune(date: Date): number {
  const jours = (date.getTime() - NOUVELLE_LUNE) / 86_400_000;
  return (((jours / LUNAISON) % 1) + 1) % 1;
}

/** Cette case du disque de la lune (rayon `r`) est-elle éclairée ? Vue de France : le croissant qui grandit est à droite. */
export function luneEclairee(dx: number, dy: number, r: number, phase: number): boolean {
  const demi = Math.sqrt(Math.max(0, r * r - dy * dy));
  const bord = demi * Math.cos(2 * Math.PI * phase);
  return phase < 0.5 ? dx >= bord : dx <= -bord;
}

/* ---------- Le ciel ---------- */

/** Les degrés du dégradé entre deux des cinq teintes du ciel : assez pour qu'aucune marche ne se voie. */
const DEGRES = 6;

/** Où est l'astre dans un ciel de cette taille : le milieu de son disque, en cases. `horizon` : la rangée de la ligne du fond. */
export function placeDeLAstre(l: Lumiere, largeur: number, horizon: number): { x: number; y: number } | null {
  if (!l.astre) return null;
  return { x: Math.round(40 + l.astre.course * (largeur - 80)), y: Math.round(horizon * (0.84 - 0.62 * l.astre.hauteur)) };
}

/**
 * Le ciel, pour une toile de `largeur` × `hauteur` cases dont la rangée `horizon` est la ligne du fond du village. Le
 * dégradé, la lueur du lever et du coucher, les étoiles et la voie lactée, puis le soleil ou la lune.
 */
export function composerCiel(largeur: number, hauteur: number, horizon: number, l: Lumiere, date: Date): Decor {
  const cases: (string | null)[] = new Array<string | null>(largeur * hauteur).fill(null);
  const ciel = cielDuVillage(l);
  // Le nuancier : chaque teinte du ciel et ses degrés vers la suivante.
  const nuancier: string[] = [];
  for (let i = 0; i + 1 < ciel.length; i++) for (let k = 0; k < DEGRES; k++) nuancier.push(melanger(ciel[i]!, ciel[i + 1]!, k / DEGRES));
  nuancier.push(ciel[ciel.length - 1]!);
  const dernier = nuancier.length - 1;
  const astre = placeDeLAstre(l, largeur, horizon);

  // La lueur du lever et du coucher : un grand halo chaud posé sur l'horizon, du côté du soleil.
  const lueurX = l.astre?.sorte === "soleil" ? astre!.x : l.astre && l.astre.course < 0.5 ? largeur + 40 : -40;
  const lueurs = [0, 1, 2, 3, 4, 5].map((k) => k / 5);
  const teinteDeLueur = melanger("#ffb35c", "#ff7a4a", borner(l.rougeur * 1.2 - 0.3));
  const fondu = new Map<string, string>();
  const meler = (a: string, b: string, part: number): string => {
    const cle = `${a}${b}${part}`;
    let couleur = fondu.get(cle);
    if (!couleur) {
      couleur = melanger(a, b, part);
      fondu.set(cle, couleur);
    }
    return couleur;
  };

  // Les étoiles pâlissent quand le jour vient, sans s'éteindre d'un coup.
  const eclat = borner(1 - l.jour * 2.4);
  for (let y = 0; y < hauteur; y++) {
    const rang = borner(y / Math.max(1, horizon)) * dernier;
    const bas = Math.floor(rang);
    const reste = rang - bas;
    for (let x = 0; x < largeur; x++) {
      let couleur = nuancier[Math.min(dernier, bas + (reste > trame(x, y) ? 1 : 0))]!;
      if (l.rougeur > 0.02) {
        const dx = (x - lueurX) / (largeur * 0.55);
        const dy = (y - horizon) / (horizon * 0.5);
        const force = borner(1 - Math.sqrt(dx * dx + dy * dy)) * l.rougeur * 5;
        const degre = Math.min(5, Math.floor(force) + (force - Math.floor(force) > trame(x + 2, y + 1) ? 1 : 0));
        if (degre > 0) couleur = meler(couleur, teinteDeLueur, lueurs[degre]! * 0.55);
      }
      if (eclat > 0.03 && y < horizon - 6) {
        // La voie lactée : une traînée qui traverse le ciel en biais, plus claire, plus riche en petites étoiles.
        const axe = horizon * (0.12 + 0.5 * (x / largeur));
        const ecart = (y - axe) / (horizon * 0.11);
        const lactee = Math.exp(-ecart * ecart);
        const bas2 = borner((horizon - y) / (horizon * 0.35));
        if (lactee > 0.2 && alea(x + 77, y + 311) < 0.42 * lactee) couleur = meler(couleur, "#5a6fb4", Math.round(eclat * bas2 * 4) / 16);
        const a = alea(x + 911, y + 57);
        const seuil = 0.011 * (1 + 2.2 * lactee) * bas2;
        if (a < seuil) {
          const sorte = alea(x + 5, y + 733);
          const teinte = sorte < 0.6 ? "#dfe6fa" : sorte < 0.82 ? "#a9c3ff" : "#ffe2b8";
          const force = a < seuil * 0.25 ? 1 : a < seuil * 0.6 ? 0.62 : 0.34;
          couleur = meler(couleur, teinte, Math.round(eclat * force * 8) / 8);
        }
      }
      cases[y * largeur + x] = couleur;
    }
  }
  const lire = (x: number, y: number): string | null => (x >= 0 && x < largeur && y >= 0 && y < hauteur ? (cases[y * largeur + x] ?? null) : null);
  const poser = (x: number, y: number, couleur: string): void => {
    if (x >= 0 && x < largeur && y >= 0 && y < hauteur) cases[y * largeur + x] = couleur;
  };

  // Les grandes étoiles : une croix de cinq cases, rares, dans le haut du ciel.
  if (eclat > 0.03) {
    for (let y = 3; y < horizon * 0.7; y++) {
      for (let x = 2; x < largeur - 2; x++) {
        if (alea(x + 4051, y + 97) >= 0.00045) continue;
        const teinte = alea(x, y + 9) < 0.5 ? "#ffffff" : "#cfe0ff";
        poser(x, y, meler(lire(x, y)!, teinte, Math.round(eclat * 8) / 8));
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) poser(x + dx, y + dy, meler(lire(x + dx, y + dy)!, teinte, Math.round(eclat * 3.5) / 8));
      }
    }
  }

  if (astre && l.astre) {
    if (l.astre.sorte === "soleil") {
      // Le soleil : blanc en haut, orangé près de l'horizon ; un halo en trois anneaux tramés.
      const haut = borner(l.astre.hauteur);
      const coeur = melanger("#ff9a3c", "#fff6c4", haut * 1.4);
      const bord = melanger("#f5722a", "#ffdc6a", haut * 1.4);
      const R = 11;
      for (let dy = -34; dy <= 34; dy++) {
        for (let dx = -34; dx <= 34; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          const fond = lire(astre.x + dx, astre.y + dy);
          if (!fond || d > 34) continue;
          if (d <= R - 2.5) poser(astre.x + dx, astre.y + dy, coeur);
          else if (d <= R) poser(astre.x + dx, astre.y + dy, bord);
          else {
            const force = (1 - (d - R) / (34 - R)) ** 2 * 0.62;
            const degre = Math.floor(force * 6) + (force * 6 - Math.floor(force * 6) > trame(astre.x + dx, astre.y + dy) ? 1 : 0);
            if (degre > 0) poser(astre.x + dx, astre.y + dy, meler(fond, bord, degre / 6));
          }
        }
      }
    } else {
      // La lune : sa phase du jour, ses mers en gris, la part d'ombre à peine visible, un halo pâle.
      const phase = phaseDeLaLune(date);
      const force = borner(1.3 - l.jour * 2);
      const R = 10;
      for (let dy = -24; dy <= 24; dy++) {
        for (let dx = -24; dx <= 24; dx++) {
          const d2 = dx * dx + dy * dy;
          const fond = lire(astre.x + dx, astre.y + dy);
          if (!fond || d2 > 24 * 24) continue;
          if (d2 <= R * R + 3) {
            if (luneEclairee(dx, dy, R, phase)) {
              const mer = (dx + 3) * (dx + 3) + (dy + 2) * (dy + 2) < 9 || (dx - 3) * (dx - 3) + (dy - 4) * (dy - 4) < 5 || (dx - 1) * (dx - 1) + (dy + 6) * (dy + 6) < 3;
              poser(astre.x + dx, astre.y + dy, meler(fond, mer ? "#cfc8a8" : dy > 5 ? "#e4dcb4" : "#f6f0d2", Math.round(force * 8) / 8));
            } else poser(astre.x + dx, astre.y + dy, meler(fond, "#8f9cc4", Math.round(force * 1.4) / 8));
          } else {
            const halo = (1 - (Math.sqrt(d2) - R) / (24 - R)) ** 2 * 0.3 * force * Math.sin(Math.PI * phase);
            const degre = Math.floor(halo * 8) + (halo * 8 - Math.floor(halo * 8) > trame(astre.x + dx, astre.y + dy) ? 1 : 0);
            if (degre > 0) poser(astre.x + dx, astre.y + dy, meler(fond, "#c9d4f4", degre / 8));
          }
        }
      }
    }
  }
  return { largeur, hauteur, cases };
}

/* ---------- Les nuages ---------- */

/** La hauteur d'une toile de nuages, en cases. */
export const NUAGES_HAUTEUR = 150;

/**
 * Une couche de nuages, sur une toile qui se répète : `periode` cases de large, dessinée deux fois bout à bout pour que
 * l'écran la fasse dériver sans raccord. `couche` 0 : de petits nuages hauts et lointains ; 1 : de plus gros, plus bas.
 * Blancs le jour, leur ventre gris-bleu ; roses et orangés au lever et au coucher ; sombres la nuit, ourlés de clair.
 */
export function composerNuages(periode: number, couche: 0 | 1, l: Lumiere): Decor {
  const largeur = periode * 2;
  const H = NUAGES_HAUTEUR;
  const cases: (string | null)[] = new Array<string | null>(largeur * H).fill(null);
  const c = (deJour: string, deNuit: string, rougi: string): string => melanger(melanger(deNuit, deJour, l.jour), rougi, l.rougeur * 0.8);
  const clair = c("#ffffff", "#3a4a80", "#ffe0b8");
  const fond = c("#eaf3fb", "#2a3868", "#f6b890");
  const ventre = c("#c3d6ea", "#1c2852", "#c87a8a");
  const creux = c("#a9c1dc", "#162046", "#a05c80");
  const nombre = Math.max(2, Math.round(periode / (couche === 0 ? 150 : 210)));
  for (let k = 0; k < nombre; k++) {
    const graine = k * 17 + couche * 101;
    const cx = Math.round(((k + 0.2 + 0.6 * alea(graine, 1)) * periode) / nombre);
    const base = couche === 0 ? 46 + Math.round(alea(graine, 2) * 44) : 58 + Math.round(alea(graine, 2) * 70);
    const bosses = 3 + Math.floor(alea(graine, 3) * (couche === 0 ? 3 : 4));
    const rayon = couche === 0 ? 5 : 10;
    // Un nuage : des bosses rondes posées côte à côte sur un ventre plat.
    const boules: { x: number; y: number; r: number }[] = [];
    let x = 0;
    for (let b = 0; b < bosses; b++) {
      const milieu = 1 - Math.abs((b + 0.5) / bosses - 0.5) * 1.3;
      const r = Math.round(rayon * (0.6 + 0.9 * milieu) * (0.8 + 0.5 * alea(graine + b, 4)));
      boules.push({ x: x + r, y: -Math.round(r * 0.7), r });
      x += Math.round(r * 1.25);
    }
    const demi = Math.round(x / 2) + rayon;
    const haut = Math.max(...boules.map((b) => b.r - b.y)) + 1;
    for (let dy = -haut; dy <= 2; dy++) {
      for (let dx = -rayon; dx <= x + rayon; dx++) {
        const boule = boules.find((b) => (dx - b.x) * (dx - b.x) + (dy - b.y) * (dy - b.y) <= b.r * b.r);
        if (!boule || dy > 0) continue;
        const pente = (dx - boule.x + (dy - boule.y) * 1.6) / boule.r;
        let couleur: string = pente < -0.75 ? clair : pente > 0.9 ? ventre : fond;
        if (dy >= -1) couleur = creux;
        else if (dy >= -3) couleur = (dx + dy) % 2 === 0 ? ventre : creux;
        else if (pente > 0.5 && pente <= 0.9 && (dx + dy) % 2 === 0) couleur = ventre;
        else if (pente < -0.4 && pente >= -0.75 && (dx + dy) % 2 === 0) couleur = clair;
        const px = (((cx - demi + dx) % periode) + periode) % periode;
        const py = base + dy;
        if (py < 0 || py >= H) continue;
        cases[py * largeur + px] = couleur;
        cases[py * largeur + px + periode] = couleur;
      }
    }
  }
  return { largeur, hauteur: H, cases };
}

/* ---------- Les lointains ---------- */

export type PlanLointain = "montagnes" | "collines" | "foret" | "lisiere";

/** Les plans lointains, du plus loin au plus proche : la part du déplacement de la caméra que chacun suit. */
export const PLANS_LOINTAINS: readonly { id: PlanLointain; glisse: number; hauteur: number }[] = [
  { id: "montagnes", glisse: 0.05, hauteur: 170 },
  { id: "collines", glisse: 0.14, hauteur: 96 },
  { id: "foret", glisse: 0.3, hauteur: 80 },
  { id: "lisiere", glisse: 0.52, hauteur: 70 },
];

/** Une ligne de crête : des dents larges, des dents fines, un grain. De 0 à 1. */
function crete(x: number, graine: number): number {
  const dent = (periode: number, decalage: number): number => 1 - Math.abs((((x + decalage) % periode) + periode) % periode - periode / 2) / (periode / 2);
  return borner(0.46 * dent(331, graine * 37) + 0.27 * dent(149, graine * 91 + 60) + 0.17 * dent(67, graine * 13 + 20) + 0.1 * dent(23, graine * 7) + 0.04 * (alea(x >> 1, graine) - 0.5));
}

/**
 * Un plan lointain de `largeur` cases : sa dernière rangée repose sur la ligne du fond. `brume` : de 0 à 1, la brume du
 * lever du jour au pied des collines et des arbres.
 */
export function composerPlanLointain(plan: PlanLointain, largeur: number, p: Palette, l: Lumiere, brume: number): Decor {
  const H = PLANS_LOINTAINS.find((q) => q.id === plan)!.hauteur;
  const cases: (string | null)[] = new Array<string | null>(largeur * H).fill(null);
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const horizon = p.ciel[4]!;
  const poser = (x: number, y: number, couleur: string): void => {
    if (x >= 0 && x < largeur && y >= 0 && y < H) cases[y * largeur + x] = couleur;
  };

  if (plan === "montagnes") {
    // Deux chaînes bleutées, noyées dans l'air : la plus lointaine presque de la couleur du ciel, des neiges sur les sommets.
    const loin = melanger(c("#7f9fd0", "#16224e"), horizon, 0.45);
    const loinOmbre = melanger(c("#6a8ac0", "#111b42"), horizon, 0.4);
    const pres = melanger(c("#5f7fb8", "#131e48"), horizon, 0.22);
    const presOmbre = melanger(c("#4c6aa4", "#0e173a"), horizon, 0.2);
    const neige = melanger(c("#f4f8ff", "#56679c"), horizon, 0.15);
    const neigeOmbre = melanger(c("#c9d8f0", "#3c4c80"), horizon, 0.15);
    for (const [graine, base, ampleur, fond, ombre] of [
      [3, 22, 110, loin, loinOmbre],
      [8, 70, 78, pres, presOmbre],
    ] as const) {
      for (let x = 0; x < largeur; x++) {
        const h = crete(x, graine);
        const sommet = Math.round(base + (1 - h) * ampleur);
        // Le versant qui descend vers la droite est dans l'ombre.
        const descend = crete(x + 9, graine) < crete(x - 9, graine);
        for (let y = sommet; y < H; y++) {
          const depuis = y - sommet;
          let couleur: string = descend ? ombre : fond;
          // Des arêtes de roche descendent des sommets.
          if (!descend && depuis > 3 && (x * 3 + depuis) % 37 === 0) couleur = ombre;
          if (h > 0.62 && depuis < (h - 0.62) * 60 + alea(x, graine + 4) * 5) couleur = descend ? neigeOmbre : neige;
          // Le pied des montagnes se fond dans l'air de l'horizon.
          const voile = borner((y - (H - 46)) / 46);
          if (voile > trame(x, y)) couleur = melanger(couleur, horizon, 0.55);
          poser(x, y, couleur);
        }
      }
    }
  } else if (plan === "collines") {
    // Des collines douces : des prés, des champs en bandes, des haies, et un lac où se reflète le ciel.
    const pre = melanger(c("#6aa86a", "#12303a"), horizon, 0.3);
    const preClair = melanger(c("#86bf78", "#183a42"), horizon, 0.3);
    const ble = melanger(c("#d8c070", "#2a3a4a"), horizon, 0.3);
    const labour = melanger(c("#a8845c", "#22283e"), horizon, 0.3);
    const haie = melanger(c("#3f8060", "#0c2230"), horizon, 0.25);
    const eau = melanger(p.ciel[2]!, c("#7fb8e6", "#20386a"), 0.5);
    const reflet = melanger(eau, "#ffffff", 0.35 + 0.2 * l.jour);
    for (let x = 0; x < largeur; x++) {
      const sommet = 34 + Math.round(16 * Math.sin(x / 113 + 1) + 9 * Math.sin(x / 47 + 2) + 4 * Math.sin(x / 19));
      // Le lac : dans le creux entre deux collines, tous les six cents cases environ.
      const dansLeLac = ((x + 180) % 620) - 150;
      const rive = 62 + Math.round(3 * Math.sin(x / 29));
      for (let y = sommet; y < H; y++) {
        const parcelle = Math.floor((x + Math.floor((y - sommet) * 1.6)) / 58) + Math.floor((y - sommet) / 26) * 7;
        const sorte = alea(parcelle, 77);
        let couleur: string = sorte < 0.45 ? pre : sorte < 0.62 ? preClair : sorte < 0.82 ? ble : labour;
        // Les sillons des champs, et les haies entre deux parcelles.
        if (sorte >= 0.62 && (x + (y - sommet) * 2) % 6 === 0) couleur = melanger(couleur, haie, 0.35);
        if ((x + Math.floor((y - sommet) * 1.6)) % 58 === 0 || (y - sommet) % 26 === 25) couleur = haie;
        if (y === sommet) couleur = preClair;
        if (dansLeLac > 0 && dansLeLac < 190 && y >= rive && y < rive + 18) {
          const bord = Math.min(dansLeLac, 190 - dansLeLac);
          if (bord > (y - rive < 3 || y - rive > 14 ? 14 : 4)) couleur = alea(x >> 2, y) < 0.12 ? reflet : eau;
        }
        poser(x, y, couleur);
      }
      // Des bosquets ronds, posés sur la crête.
      if (alea(Math.floor(x / 9), 5) < 0.2) for (let dy = -3; dy <= 0; dy++) poser(x, sommet + dy, haie);
      if (alea(Math.floor((x + 4) / 9), 5) < 0.2) poser(x, sommet - 4, haie);
    }
  } else if (plan === "foret") {
    // La forêt au loin : des sapins et des feuillus serrés, dans la brume.
    const fond = p.foret.loin;
    const clair = melanger(p.foret.loin, horizon, 0.3);
    const sombre = melanger(p.foret.loin, p.foret.pres, 0.5);
    for (let x = 0; x < largeur; x++) {
      const arbre = Math.floor(x / 11);
      const dans = (x % 11) - 5;
      const taille = 8 + alea(arbre, 21) * 12;
      const sapin = alea(arbre, 22) < 0.45;
      const cime = sapin ? Math.abs(dans) * 2.6 : (dans * dans) / 3.2;
      const sommet = Math.round(30 + 6 * Math.sin(x / 61) + 4 * Math.sin(x / 23 + 2) - taille + cime);
      for (let y = Math.max(0, sommet); y < H; y++) {
        let couleur: string = dans < -1 && y - sommet < 9 ? clair : dans > 2 ? sombre : fond;
        if (alea(x, y + 60) < 0.07) couleur = sombre;
        poser(x, y, couleur);
      }
    }
  } else {
    // La lisière : de grands arbres ronds, leurs troncs dans l'ombre, des taches de lumière sur les cimes.
    const fond = p.foret.pres;
    const clair = p.foret.presClaire;
    const sombre = melanger(p.foret.pres, c("#1c4a38", "#081822"), 0.6);
    const tronc = melanger(p.tronc.sombre, p.foret.pres, 0.4);
    for (let x = 0; x < largeur; x++) {
      const dessous = 34 + Math.round(3 * Math.sin(x / 17));
      for (let y = dessous; y < H; y++) poser(x, y, (x + y) % 3 === 0 ? fond : sombre);
      if (x % 13 === 6 || x % 13 === 7) for (let y = dessous + 4; y < H; y++) poser(x, y, tronc);
    }
    for (let k = -1; k * 19 < largeur + 30; k++) {
      const cx = k * 19 + Math.round(alea(k, 31) * 8);
      const r = 13 + Math.round(alea(k, 32) * 8);
      const cy = 30 + Math.round(alea(k, 33) * 10) - Math.round(4 * Math.sin(k / 3));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const pente = (dx * 0.6 + dy) / r;
          const a = alea(cx + dx, cy + dy + 80);
          let couleur: string = pente < -0.5 ? clair : pente > 0.35 ? sombre : fond;
          if (dx * dx + dy * dy > r * r * 0.78 && pente > -0.2) couleur = sombre;
          if (a < 0.07) couleur = sombre;
          else if (a > 0.95) couleur = clair;
          poser(cx + dx, cy + dy, couleur);
        }
      }
    }
    // L'herbe haute au pied de la lisière.
    for (let x = 0; x < largeur; x++) for (let y = H - 5 - (alea(x, 9) < 0.3 ? 2 : 0); y < H; y++) poser(x, y, (x + y) % 2 === 0 ? p.herbe.sombre : sombre);
  }

  // La brume du lever du jour : des nappes tramées au pied du plan, plus denses vers le bas.
  if (brume > 0.03 && plan !== "montagnes") {
    const voile = melanger(horizon, "#ffffff", 0.35);
    for (let y = Math.floor(H * 0.45); y < H; y++) {
      const dense = borner((y - H * 0.45) / (H * 0.4)) * brume;
      for (let x = 0; x < largeur; x++) {
        const nappe = 0.55 + 0.45 * Math.sin(x / 41 + y / 9) * Math.sin(x / 17 + 2);
        const fond = cases[y * largeur + x];
        if (fond && dense * nappe > trame(x, y)) cases[y * largeur + x] = melanger(fond, voile, 0.6);
      }
    }
  }
  return { largeur, hauteur: H, cases };
}

/** La force de la brume à cette heure : seulement au lever du jour, de 0 à 1. */
export function brumeDuMatin(l: Lumiere): number {
  return l.phase === "aube" ? borner(0.35 + l.rougeur * 0.65) : 0;
}
