/**
 * Les pièces du décor du village (docs/DIRECTION.md, « Le village des Gaulois »), en pixels : dessinées case par case pour
 * ce site, sans emprunt à une œuvre existante. Le ciel, la lisière de la forêt, la palissade de pieux, les huttes rondes au
 * toit de chaume, les chênes, le feu. Les lieux eux-mêmes se composent dans `lieux.ts`.
 *
 * Tout est calculé, rien n'est tiré au hasard à l'écran : la même largeur et la même lumière donnent toujours le même
 * dessin. Les couleurs du dehors suivent l'heure (`lumiere.ts`) : chacune a sa teinte de jour et sa teinte de nuit. Ce qui
 * éclaire (feu, portes, astres) garde sa couleur. Design : Claude Fable 5.2.
 */
import { type Lumiere, cielDuVillage, couleurDuDehors, melanger } from "./lumiere";

/** Un dessin en cases : `largeur` × `hauteur` couleurs « #rrggbb », rangée par rangée, `null` pour une case vide. */
export interface Decor {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** La plus petite largeur dessinée, en cases. */
export const DECOR_LARGEUR_MIN = 150;
/** La hauteur du haut d'un lieu du dehors (ciel, forêt, palissade), en cases. */
export const TETE_DU_DEHORS = 72;
/** La première rangée du sol dans ce haut : au-dessus, le ciel et le village ; dessous, l'herbe. */
export const SOL = 58;
/** La rangée où reposent les huttes et les arbres. */
export const PIED = SOL + 2;

/** Un nombre de 0 à 1 qui ne dépend que de la case : le même à chaque dessin. */
export function alea(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Une planche à dessin : on y pose des cases, ce qui sort du cadre est ignoré. */
export class Planche {
  readonly cases: (string | null)[];
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
    fond: string | null = null,
  ) {
    this.cases = new Array<string | null>(largeur * hauteur).fill(fond);
  }
  poser(x: number, y: number, couleur: string | null): void {
    if (x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur) this.cases[y * this.largeur + x] = couleur;
  }
  lire(x: number, y: number): string | null {
    return x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur ? (this.cases[y * this.largeur + x] ?? null) : null;
  }
  /** Un rectangle plein, ou coloré case par case. */
  rect(x: number, y: number, l: number, h: number, couleur: string | ((x: number, y: number) => string | null)): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + l; i++) {
        const c = typeof couleur === "string" ? couleur : couleur(i, j);
        if (c !== null) this.poser(i, j, c);
      }
    }
  }
  /** Un disque plein. */
  disque(cx: number, cy: number, r: number, couleur: string | ((dx: number, dy: number) => string | null)): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r * 0.4) continue;
        const c = typeof couleur === "string" ? couleur : couleur(dx, dy);
        if (c !== null) this.poser(cx + dx, cy + dy, c);
      }
    }
  }
  /** Un dessin écrit en lettres, une couleur par lettre ; une lettre sans couleur laisse la case. */
  lettres(x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>): void {
    lignes.forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) {
        const couleur = couleurs[ligne[dx]!];
        if (couleur) this.poser(x + dx, y + dy, couleur);
      }
    });
  }
  decor(): Decor {
    return { largeur: this.largeur, hauteur: this.hauteur, cases: this.cases };
  }
}

/** Les couleurs du dehors à une lumière donnée. */
export function paletteDuDehors(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const nuit = 1 - l.jour;
  return {
    nuit,
    ciel: cielDuVillage(l),
    herbe: { fond: c("#3f8a3c", "#1f4a2c"), claire: c("#5aa84a", "#2f6a3d"), sombre: c("#2f6e33", "#173a22"), bord: c("#4f9a45", "#2a5c36") },
    terre: { fond: c("#8a6a45", "#5a4630"), claire: c("#a07d52", "#6b5439"), sombre: c("#735638", "#4a3926") },
    bois: {
      fond: c("#8a5a30", "#5d3d22"),
      autre: c("#966437", "#684627"),
      clair: c("#b07a44", "#7d5631"),
      sombre: c("#6a4424", "#472d19"),
      creux: c("#3d2616", "#2a1a10"),
      corde: c("#c9b278", "#8a7a55"),
      cordeSombre: c("#a08c5c", "#6a5c3e"),
    },
    chaume: { fond: c("#d9b04e", "#a8853a"), clair: c("#f0cc68", "#c29f4c"), sombre: c("#b48c3a", "#86682b"), brin: c("#9c7a30", "#735826"), rang: c("#a8823a", "#7c6029"), bord: c("#80622a", "#5f4a1f") },
    mur: { fond: c("#d8b47a", "#b08f5c"), clair: c("#ecca90", "#c4a46e"), sombre: c("#b89260", "#8f7045"), trame: c("#c4a06a", "#9c7c4c"), ombre: c("#987650", "#74593a") },
    feuilles: { fond: c("#2f8a48", "#1d5a36"), claire: c("#48ad5c", "#2c7a48"), sombre: c("#216b38", "#134226") },
    tronc: { clair: c("#7a5230", "#5f3f25"), fond: c("#63411f", "#4a301c"), sombre: c("#4f3218", "#38230f") },
    foret: { loin: c("#5f9a8a", "#0c1d36"), pres: c("#2f7a55", "#0f2c33"), presClaire: c("#3d8c5f", "#143a3c") },
    /** L'autre clan, de l'autre côté du champ : des toiles prune. */
    prune: { fond: c("#7a5a94", "#3f2f58"), clair: c("#9a7ab4", "#54406e"), sombre: c("#5a4070", "#2c2040"), trait: c("#3a2848", "#1c1428") },
    /** L'herbe éclairée par le feu : à peine le jour, nettement la nuit. */
    lueur: melanger(c("#3f8a3c", "#1f4a2c"), "#8a8f3a", 0.1 + 0.34 * nuit),
  };
}
export type Palette = ReturnType<typeof paletteDuDehors>;

/** Une case d'herbe : quelques brins clairs, quelques brins sombres, sans motif qui se répète. */
export function caseDuSol(x: number, y: number, p: Palette): string {
  const a = alea(x + 3, y + 1009);
  if (a < 0.045) return p.herbe.claire;
  if (a < 0.075) return p.herbe.sombre;
  return p.herbe.fond;
}

/** Où est l'astre dans un ciel de cette largeur : le milieu de son disque, en cases. */
export function placeDeLAstre(l: Lumiere, largeur: number): { x: number; y: number } | null {
  if (!l.astre) return null;
  return { x: Math.round(14 + l.astre.course * (largeur - 28)), y: Math.round(44 - l.astre.hauteur * 34) };
}

/** Le ciel du haut d'un lieu du dehors : cinq bandes, les étoiles la nuit, le soleil ou la lune, puis la lisière de la forêt. */
export function poserCielEtForet(planche: Planche, l: Lumiere, p: Palette): void {
  const { largeur } = planche;
  const bandeDe = (y: number): number => Math.min(p.ciel.length - 1, Math.floor((y / SOL) * p.ciel.length));
  // Cinq bandes du haut vers l'horizon, mêlées en damier là où elles se touchent.
  for (let y = 0; y < SOL; y++) {
    const rang = (y / SOL) * p.ciel.length;
    const bande = bandeDe(y);
    const pres = rang - bande > 0.8 && bande < p.ciel.length - 1;
    for (let x = 0; x < largeur; x++) planche.poser(x, y, pres && (x + y) % 2 === 0 ? p.ciel[bande + 1]! : p.ciel[bande]!);
  }
  // Les étoiles : elles pâlissent quand le jour vient, sans s'éteindre d'un coup.
  const eclat = Math.min(1, Math.max(0, 1 - l.jour * 2.4));
  if (eclat > 0.03) {
    for (let y = 1; y < 34; y++) {
      for (let x = 0; x < largeur; x++) {
        const a = alea(x + 911, y + 57);
        if (a < 0.004) planche.poser(x, y, melanger(p.ciel[bandeDe(y)]!, "#c0c9e2", eclat));
        else if (a < 0.009) planche.poser(x, y, melanger(p.ciel[bandeDe(y)]!, "#5469ae", eclat));
      }
    }
  }
  // L'astre : le soleil, blanc en haut, orangé près de l'horizon ; ou un croissant de lune.
  const place = placeDeLAstre(l, largeur);
  if (place && l.astre) {
    if (l.astre.sorte === "soleil") {
      const haut = Math.max(0, l.astre.hauteur);
      const coeur = melanger("#ff9a3c", "#fff3b0", haut * 1.4);
      const bord = melanger("#f5722a", "#ffd75a", haut * 1.4);
      planche.disque(place.x, place.y, 9, (dx, dy) => {
        const d = dx * dx + dy * dy;
        if (d <= 40) return null;
        const fond = planche.lire(place.x + dx, place.y + dy);
        return fond && (dx + dy) % 2 === 0 ? melanger(fond, bord, 0.45) : null;
      });
      planche.disque(place.x, place.y, 6, (dx, dy) => (dx * dx + dy * dy > 26 ? bord : coeur));
    } else {
      const r = 6;
      const force = Math.min(1, Math.max(0, 1.3 - l.jour * 2));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          if ((dx - 3) * (dx - 3) + (dy + 2) * (dy + 2) < 30) continue;
          const fond = planche.lire(place.x + dx, place.y + dy) ?? p.ciel[0]!;
          planche.poser(place.x + dx, place.y + dy, melanger(fond, dy > 3 ? "#d9cf9f" : "#f4ecc8", force));
        }
      }
    }
  }
  // La lisière de la forêt : deux rangs de cimes, le plus loin dans la brume.
  for (let x = 0; x < largeur; x++) {
    const loin = 31 + Math.round(3 * Math.sin(x / 13) + 2 * Math.sin(x / 5.1 + 1.3) + Math.abs(((x + 3) % 9) - 4) * 1.2);
    for (let y = loin; y < SOL; y++) planche.poser(x, y, p.foret.loin);
    const pres = 38 + Math.round(2.5 * Math.sin(x / 9 + 2) + 2 * Math.sin(x / 3.7) + Math.abs((x % 11) - 5) * 1.1);
    for (let y = pres; y < SOL; y++) planche.poser(x, y, alea(x, y) < 0.08 ? p.foret.presClaire : p.foret.pres);
  }
}

/** La palissade, de la colonne `de` à la colonne `a` : des pieux taillés en pointe, de hauteurs un peu inégales, liés par une corde. */
export function poserPalissade(planche: Planche, p: Palette, de = 0, a = planche.largeur): void {
  for (let x = de; x < a; x++) {
    const pieu = Math.floor(x / 5);
    const dans = x % 5;
    const haut = 44 + Math.floor(alea(pieu, 1) * 3);
    if (dans === 4) {
      for (let y = haut + 3; y < SOL + 1; y++) planche.poser(x, y, p.bois.creux);
      continue;
    }
    const fond = pieu % 2 === 0 ? p.bois.fond : p.bois.autre;
    for (let y = haut; y < SOL + 1; y++) {
      // La pointe : deux cases en haut, puis quatre.
      if (y === haut && (dans === 0 || dans === 3)) continue;
      let couleur: string = dans === 0 ? p.bois.clair : dans === 3 ? p.bois.sombre : fond;
      if (y === 50) couleur = p.bois.corde;
      else if (y === 51) couleur = p.bois.cordeSombre;
      else if (alea(x, y) < 0.05) couleur = p.bois.sombre;
      planche.poser(x, y, couleur);
    }
  }
}

/** L'herbe, de la rangée `de` au bas de la planche : un bord plus clair sur sa première rangée. */
export function poserHerbe(planche: Planche, p: Palette, de = SOL): void {
  for (let y = de; y < planche.hauteur; y++) {
    for (let x = 0; x < planche.largeur; x++) planche.poser(x, y, y === de ? (alea(x, y) < 0.5 ? p.herbe.bord : p.herbe.fond) : caseDuSol(x, y - de, p));
  }
}

/** Le feu : flammes, bûches et pierres. r rouge, o orange, y jaune, w cœur clair, B et b bûches, e bout de bûche, s et S pierres. */
const FEU = [
  "......r........",
  "......rr.......",
  ".....rrr.......",
  ".....roor...r..",
  "..r.rrooor.rr..",
  "..rrrooyoorrr..",
  "..rroooyyoorr..",
  ".rrrooyyyooorr.",
  ".rrooyywyyoorr.",
  ".rrooyywwyyorr.",
  "..rooyywwyyor..",
  "..rrooyyyyorr..",
  ".eBBBBBBBBBBBe.",
  "sebbbbbbbbbbbes",
  "sS.sS.sSs.Ss.Ss",
  "ss.ss.sss.ss.ss",
] as const;
const COULEURS_DU_FEU: Readonly<Record<string, string>> = {
  r: "#e2452a",
  o: "#f58a1f",
  y: "#ffd75a",
  w: "#fff1a8",
  B: "#835a33",
  b: "#5d3d22",
  e: "#b98a52",
  s: "#5c6474",
  S: "#8d95a6",
};
/** Les rangées de la flamme dans le dessin du feu : le reste (bûches, pierres) ne bouge pas. */
const RANGEES_DE_FLAMME = 12;
export const FEU_LARGEUR = FEU[0].length;
export const FEU_HAUTEUR = FEU.length;
/** La rangée où reposent les pierres du feu de la place. */
const PIED_DU_FEU = SOL + 10;

/** Où est le feu de la place dans un décor de cette largeur : la colonne de son milieu et la rangée du haut de sa flamme. */
export function feuDuDecor(largeur: number): { x: number; y: number } {
  return { x: Math.floor(Math.max(largeur, DECOR_LARGEUR_MIN) / 2), y: PIED_DU_FEU - FEU.length + 1 };
}

/**
 * Pose un feu : `x` la colonne de son milieu, `y` la rangée du haut de sa flamme. Sans `flamme`, seulement les bûches et
 * les pierres : l'écran pose la flamme par-dessus, pour la faire danser (`flammesDuFeu`).
 */
export function poserFeu(planche: Planche, x: number, y: number, flamme = true): void {
  const gauche = x - Math.floor(FEU_LARGEUR / 2);
  if (flamme) planche.lettres(gauche, y, FEU, COULEURS_DU_FEU);
  else planche.lettres(gauche, y + RANGEES_DE_FLAMME, FEU.slice(RANGEES_DE_FLAMME), COULEURS_DU_FEU);
}

/**
 * Les trois images de la flamme, que l'écran pose au-dessus des bûches : la première est la flamme au repos, celle qui
 * reste quand les animations sont coupées. Chaque image a une case de marge de chaque côté : elle se pose une colonne
 * avant le feu.
 */
export function flammesDuFeu(): Decor[] {
  const images: Decor[] = [];
  for (const image of [0, 1, 2]) {
    const planche = new Planche(FEU_LARGEUR + 2, RANGEES_DE_FLAMME);
    for (let y = 0; y < RANGEES_DE_FLAMME; y++) {
      // Le haut de la flamme penche d'une case d'un côté puis de l'autre ; sa pointe raccourcit d'une rangée.
      const penche = image === 0 || y > 5 ? 0 : image === 1 ? 1 : -1;
      const source = image !== 0 && y < 6 ? Math.min(RANGEES_DE_FLAMME - 1, y + (y < 3 ? 1 : 0)) : y;
      const ligne = FEU[source]!;
      for (let x = 0; x < ligne.length; x++) {
        const couleur = COULEURS_DU_FEU[ligne[x]!];
        if (couleur) planche.poser(x + 1 + penche, y, couleur);
      }
    }
    images.push(planche.decor());
  }
  return images;
}

/** Autour d'un feu du dehors : la terre battue, et l'herbe éclairée, mêlée en damier, plus loin la nuit. */
export function poserSolDuFeu(planche: Planche, p: Palette, x: number, bas: number): void {
  for (let j = bas - 16; j < bas + 10; j++) {
    for (let i = x - 54; i <= x + 54; i++) {
      const dx = (i - x) / 22;
      const dy = (j - (bas - 3)) / 5;
      const d = dx * dx + dy * dy;
      if (j <= SOL) continue;
      if (d <= 1) {
        const a = alea(i, j + 300);
        planche.poser(i, j, a < 0.12 ? p.terre.claire : a < 0.22 ? p.terre.sombre : p.terre.fond);
      } else if (d <= 2.2 && (i + j) % 2 === 0) planche.poser(i, j, p.lueur);
      else if (d <= 2.2 + 3.4 * p.nuit && (i + j) % 4 === 0) planche.poser(i, j, p.lueur);
    }
  }
}

/** Ce qui se range de part et d'autre du feu. */
export type Batisse = { type: "hutte"; x: number; grande: boolean; eclairee: boolean } | { type: "arbre"; x: number };

/** Les huttes et les arbres d'un décor de cette largeur, du plus proche du feu au plus loin. */
export function placesDuDecor(largeur: number): Batisse[] {
  const l = Math.max(largeur, DECOR_LARGEUR_MIN);
  const milieu = Math.floor(l / 2);
  const places: Batisse[] = [];
  for (let k = 0; ; k++) {
    const ecart = 50 + k * 66;
    if (milieu - ecart - 25 < 0) break;
    for (const cote of [-1, 1] as const) {
      const x = milieu + cote * ecart;
      if (k % 3 === 2) places.push({ type: "arbre", x });
      else places.push({ type: "hutte", x, grande: (k + (cote > 0 ? 1 : 0)) % 2 === 0, eclairee: (k + (cote > 0 ? 0 : 1)) % 2 === 0 });
    }
  }
  return places;
}

/**
 * Une hutte ronde : un mur de clayonnage, une porte, un toit de chaume en cône. `eclairee` : un feu brûle dedans, et sa
 * lueur passe la porte dès que le jour baisse. `pied` : la rangée où elle repose.
 */
export function poserHutte(planche: Planche, p: Palette, cx: number, grande: boolean, eclairee: boolean, pied = PIED): void {
  const demiMur = grande ? 17 : 14;
  const hautMur = grande ? 13 : 11;
  const hautToit = grande ? 26 : 22;
  const demiToit = demiMur + 6;
  const hautDuMur = pied - hautMur + 1;
  // La lueur du dedans : nulle en plein jour, entière à la nuit.
  const lueur = eclairee ? Math.min(1, Math.max(0, (0.8 - (1 - p.nuit)) / 0.5)) : 0;

  // Le mur : plus clair à gauche, plus sombre à droite, une trame toutes les trois rangées, l'ombre du toit en haut.
  for (let y = hautDuMur; y <= pied; y++) {
    for (let dx = -demiMur; dx <= demiMur; dx++) {
      let couleur: string = dx < -demiMur / 2 ? p.mur.clair : dx > demiMur / 2 ? p.mur.sombre : p.mur.fond;
      if ((y - hautDuMur) % 3 === 2) couleur = dx > demiMur / 2 ? p.mur.ombre : p.mur.trame;
      if (y < hautDuMur + 3) couleur = p.mur.ombre;
      if (Math.abs(dx) === demiMur) couleur = p.mur.ombre;
      planche.poser(cx + dx, y, couleur);
    }
  }
  // La porte, cintrée, entre deux poteaux.
  const demiPorte = grande ? 4 : 3;
  const hautPorte = hautMur - 3;
  for (let i = 0; i < hautPorte; i++) {
    const y = pied - i;
    const retrait = i === hautPorte - 1 ? 1 : 0;
    for (let dx = -demiPorte + retrait; dx <= demiPorte - retrait; dx++) {
      const feu = Math.abs(dx) <= 1 && i < hautPorte - 2 ? "#ffd75a" : Math.abs(dx) <= demiPorte - 2 ? "#f5a83a" : "#c9722a";
      planche.poser(cx + dx, y, melanger(p.bois.creux, feu, lueur));
    }
    planche.poser(cx - demiPorte - 1, y, p.bois.sombre);
    planche.poser(cx + demiPorte + 1, y, p.bois.sombre);
  }
  for (let dx = -demiPorte - 1; dx <= demiPorte + 1; dx++) planche.poser(cx + dx, pied - hautPorte, p.bois.sombre);

  // Le toit : un cône de chaume qui déborde du mur, en rangs, éclairé à gauche.
  const basDuToit = hautDuMur + 2;
  const sommet = basDuToit - hautToit + 1;
  for (let r = 0; r < hautToit; r++) {
    const demi = Math.max(1, Math.round(((r + 1) * demiToit) / hautToit));
    for (let dx = -demi; dx <= demi; dx++) {
      let couleur: string = dx < -demi / 3 ? p.chaume.clair : dx > demi / 3 ? p.chaume.sombre : p.chaume.fond;
      if (r % 6 === 5) couleur = p.chaume.rang;
      else if (alea(cx + dx, r) < 0.16) couleur = p.chaume.brin;
      if (Math.abs(dx) === demi || r === hautToit - 1) couleur = p.chaume.bord;
      planche.poser(cx + dx, sommet + r, couleur);
    }
  }
  // Le faîte : un bouquet de paille liée.
  planche.poser(cx, sommet - 1, p.chaume.bord);
  planche.poser(cx - 1, sommet - 2, p.chaume.rang);
  planche.poser(cx + 1, sommet - 2, p.chaume.rang);
  planche.poser(cx, sommet - 2, p.chaume.bord);
}

/** Un chêne : un tronc et une ramure ronde, éclairée en haut à gauche. */
export function poserArbre(planche: Planche, p: Palette, cx: number, pied = PIED): void {
  for (let y = pied - 17; y <= pied; y++) {
    const evase = y > pied - 3 ? 1 : 0;
    for (let dx = -3 - evase; dx <= 2 + evase; dx++) planche.poser(cx + dx, y, dx < -1 ? p.tronc.clair : dx > 0 ? p.tronc.sombre : p.tronc.fond);
  }
  const boules = [
    { x: 0, y: -28, r: 13 },
    { x: -11, y: -22, r: 9 },
    { x: 11, y: -23, r: 9 },
    { x: -5, y: -36, r: 8 },
    { x: 7, y: -35, r: 8 },
  ];
  for (let dy = -46; dy <= -10; dy++) {
    for (let dx = -22; dx <= 22; dx++) {
      const boule = boules.find((b) => (dx - b.x) * (dx - b.x) + (dy - b.y) * (dy - b.y) <= b.r * b.r);
      if (!boule) continue;
      // La lumière vient d'en haut à gauche : le haut de chaque boule est clair, le bas sombre.
      const pente = (dx - boule.x + (dy - boule.y)) / boule.r;
      const a = alea(cx + dx, dy + 500);
      let couleur: string = pente < -0.55 ? p.feuilles.claire : pente > 0.5 ? p.feuilles.sombre : p.feuilles.fond;
      if (a < 0.07) couleur = p.feuilles.sombre;
      else if (a > 0.95) couleur = p.feuilles.claire;
      planche.poser(cx + dx, pied + dy, couleur);
    }
  }
}
