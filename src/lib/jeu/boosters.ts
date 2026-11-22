/**
 * Les dessins de l'ouverture des boosters de « Mon Gaulois » (21 novembre 2026), repris de l'animation validée par le
 * pilote (« c'est la pièce la plus importante ») : le paquet de chaque booster, le dos de la carte, sa face (la case claire
 * du site, à la couleur de sa rareté), le ciel de la scène, les fissures et les grains de lumière. Tout en planches, sans
 * navigateur ; la scène (`src/components/village/SceneDuBooster.ts`) les pose dans ses toiles.
 *
 * Le paquet a une anatomie fixe dont l'animation dépend : lignes 0 à 9, la bande de déchirure, coupée en quatre morceaux de
 * 15 colonnes qui s'ouvrent l'un après l'autre (les coutures) ; lignes 10 à 77, le corps ; lignes 78 à 87, le bas serti.
 */
import { casesDuStatere } from "../../../supabase/functions/code-discord/statere";
import { PAL } from "./palette";
import { Planche, R, grille, lireCouleur, rr, tresse } from "./planche";
import { ecrire, enCapitales, largeurDuTexte, lignesDuTexte, nombreEcrit } from "./ecriture";
import { COTE_DES_ICONES_DE_RARETE, iconeDeRarete, rareteDuRang } from "./icones-de-rarete";
import { paquetDuBooster, type SorteDeBooster } from "./boosters-dessins";
import { accentDuDessin, fondSeul, type PoseDeLaChose } from "../village/fonds-objets";

export type { SorteDeBooster } from "./boosters-dessins";

/** Les raretés d'une carte, de la plus courante à la plus rare : leur rang (1 à 6) règle la lumière et la fête. */
export const RARETES_DE_CARTE = ["commun", "peu-commun", "epique", "mystique", "legendaire", "divin"] as const;
export type RareteDeCarte = (typeof RARETES_DE_CARTE)[number];
export const NOMS_DES_RARETES: Readonly<Record<RareteDeCarte, string>> = { commun: "Commun", "peu-commun": "Peu commun", epique: "Épique", mystique: "Mystique", legendaire: "Légendaire", divin: "Divin" };

/** Le rang d'une rareté de carte, 1 à 6. */
export const rangDe = (rarete: RareteDeCarte): number => RARETES_DE_CARTE.indexOf(rarete) + 1;
/** Une rareté du site lue comme une rareté de carte : une rareté inconnue de l'animation (le légendaire de saison, qui ne sort que du booster du dernier palier du pass) est montrée comme un légendaire. */
export const rareteDeCarte = (rarete: string): RareteDeCarte => ((RARETES_DE_CARTE as readonly string[]).includes(rarete) ? (rarete as RareteDeCarte) : "legendaire");

/** Les quatre couleurs d'une case : haut, bas, bord, encre (celles des cases du site). */
export type Tons = readonly [string, string, string, string];
export const TONS: Readonly<Record<RareteDeCarte, Tons>> = {
  commun: ["#eef6ff", "#cfe6ff", "#4aa3ff", "#1d6fd0"],
  "peu-commun": ["#eceeff", "#c9cffb", "#3a4fe8", "#2a37b8"],
  epique: ["#f4eaff", "#dcc6ff", "#9b4dff", "#6a22cf"],
  mystique: ["#ffecef", "#ffc4cc", "#ff2e4a", "#b8122a"],
  legendaire: ["#fff8dc", "#ffe59a", "#f2b632", "#8a5a00"],
  divin: ["#e4fbf8", "#aef0ea", "#19d3c5", "#0b7f77"],
};
/** La lumière de chaque rareté, celle qui filtre par la couture puis entoure la carte. */
export const LUMIERES: Readonly<Record<RareteDeCarte, readonly [number, number, number]>> = {
  commun: [74, 163, 255],
  "peu-commun": [58, 79, 232],
  epique: [155, 77, 255],
  mystique: [255, 46, 74],
  legendaire: [242, 182, 50],
  divin: [25, 211, 197],
};
/** La lumière du paquet scellé, qui ne dit encore rien. */
export const LUMIERE_NEUTRE: readonly [number, number, number] = [255, 242, 200];

export const CARTE_LARGEUR = 68;
export const CARTE_HAUTEUR = 88;
export const PAQUET_LARGEUR = 60;
export const PAQUET_HAUTEUR = 88;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const TORQUE = ["..kkk.........kkk..", ".kYyOk.......kYyOk.", ".kyOok.......kyOok.", "..kyOk.......kyOk..", "..kyOkk.....kkyOk..", "...kyOOkkkkkOOok...", "....kyyOOOOOook....", ".....kkyyyOokk.....", ".......kkkkk......."];

/** Un dessin en cases : une couleur par case, `null` pour une case vide (objets, familiers, bannières, lots). */
export interface DessinEnCases {
  largeur: number;
  hauteur: number;
  cases: readonly (string | null)[];
}

/** Un dessin en cases devenu planche. */
export function plancheDuDessin(d: DessinEnCases): Planche {
  const p = new Planche(d.largeur, d.hauteur);
  d.cases.forEach((c, i) => {
    if (c) R(p, i % d.largeur, Math.floor(i / d.largeur), 1, 1, c);
  });
  return p;
}

/** Le paquet d'un booster, entier (60 × 88). */
export const paquet = (sorte: SorteDeBooster): Planche => paquetDuBooster(sorte);

/** Le paquet découpé pour l'animation : le corps (lignes 10 à 87) et les quatre morceaux de la bande (15 × 10). */
export function morceauxDuPaquet(p: Planche): { corps: Planche; bande: Planche[] } {
  const corps = new Planche(PAQUET_LARGEUR, PAQUET_HAUTEUR - 10);
  corps.drawImage(p, 0, -10);
  const bande = [0, 1, 2, 3].map((j) => {
    const m = new Planche(15, 10);
    m.drawImage(p, -j * 15, 0);
    return m;
  });
  return { corps, bande };
}

/** La ligne où l'icône de la rareté se pose sur une face, entre le nom et le mot du bas. */
const LIGNE_DE_L_ICONE = 62;
/**
 * L'icône de la rareté d'un rang (1 : commun… 6 : divin), centrée sur la face : le repère de forme des cases, la couleur
 * n'est jamais le seul. Elle remplace les losanges qui comptaient le rang (dessin de Claude Fable 5.2, 21 novembre 2026).
 */
function iconeDuRang(g: Planche, rang: number): void {
  g.drawImage(iconeDeRarete(rareteDuRang(rang)), Math.round((CARTE_LARGEUR - COTE_DES_ICONES_DE_RARETE) / 2), LIGNE_DE_L_ICONE);
}

/** Ce qu'une face de carte montre. `rang` : celui de l'icône de rareté, 1 à 6 (0 : aucune, une carte sans rareté). */
export interface FaceDeCarte {
  nom: string;
  image: DessinEnCases | null;
  tons: Tons;
  rang: number;
  /** Le mot du bas : le nom de la rareté, ou ce qui en tient lieu. */
  mot: string;
  /**
   * Le fond d'objet derrière l'image (`src/lib/village/fonds-objets/`, 22 novembre 2026) : sa clé, la rareté de la chose et
   * où la poser. Sans fond, l'image est posée sur la face nue, comme avant.
   */
  fond?: FondDeLaFace | null;
}

/** Le fond d'objet d'une face : la clé de la chose (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`), sa rareté et sa pose. */
export interface FondDeLaFace {
  cle: string;
  rarete: string;
  pose?: PoseDeLaChose;
}

/**
 * La fenêtre du fond d'objet sur une face : 62 × 34 cases sous le filet clair du haut, encadrée d'une case du bord de la
 * rareté, qui s'arrête au-dessus du nom. Une image plus haute en sort, par-dessus le cadre.
 */
export const FENETRE_DU_FOND = { x: 3, y: 3, largeur: 62, hauteur: 34 } as const;

/** La carte qu'une scène d'ouverture montre : ce que le serveur a tiré, prêt à dessiner. */
export interface CarteDeScene {
  /** Sa face, déjà dessinée (`faceDeCarte`). */
  face: Planche;
  /** Sa rareté, ou « rendu » pour des statères rendus (sans rareté : la lumière reste neutre jusqu'à la rupture). */
  rarete: RareteDeCarte | "rendu";
  /** Le rang de la fête et de la lumière annoncée : 1 à 6, 0 sans rareté. */
  rang: number;
  /** Son nom, écrit sous la carte. */
  nom: string;
  /** Le mot sous le nom : sa rareté, ou ce qui en tient lieu. */
  mot: string;
  /** Les couleurs de son étiquette. */
  tons: Tons;
  /** La lumière de la carte une fois sortie. */
  lumiere: readonly [number, number, number];
}

/**
 * La carte d'une chose qui a une rareté : un objet, un familier, une bannière, un Gaulois unique. `fond` : la clé de son
 * fond d'objet et sa pose (pas pour une bannière, qui est elle-même un fond).
 */
export function carteDeRarete(nom: string, rarete: string, image: DessinEnCases | null, fond: { cle: string; pose?: PoseDeLaChose } | null = null): CarteDeScene {
  const r = rareteDeCarte(rarete);
  const rang = rangDe(r);
  const mot = NOMS_DES_RARETES[r];
  const face = faceDeCarte({ nom, image, tons: TONS[r], rang, mot, fond: fond && image ? { ...fond, rarete } : null });
  return { face, rarete: r, rang, nom, mot, tons: TONS[r], lumiere: LUMIERES[r] };
}

/** Les couleurs d'une carte de statères rendus : l'ardoise que le site donnait déjà au rendu, qu'aucune rareté ne porte. */
export const TONS_DU_RENDU: Tons = ["#f3f5fa", "#d9dee9", "#6f7890", "#3d4763"];

/** Le fond d'une face : la case claire du site (cadre au bord, face, trame de Bayer, filet clair en haut). */
export function fondDeFace(g: Planche, [haut, bas, bord]: Tons): void {
  const W = CARTE_LARGEUR;
  const H = CARTE_HAUTEUR;
  rr(g, 0, 0, W, H, 3, bord);
  rr(g, 1, 1, W - 2, H - 5, 2, haut);
  g.fillStyle = bas;
  for (let y = 1; y < H - 4; y++) {
    const t = (y / H) * 18 - 3;
    for (let x = 1; x < W - 1; x++) if (BAYER[(y & 3) * 4 + (x & 3)]! < t && !(y < 3 && (x < 3 || x > W - 4))) g.fillRect(x, y, 1, 1);
  }
  R(g, 2, 1, W - 4, 1, "#ffffff");
}
/** Un mot centré sur la face, en capitales. */
export function auCentre(g: Planche, texte: string, y: number, coul: string): void {
  const m = enCapitales(texte);
  g.drawImage(ecrire(m, coul), Math.round(CARTE_LARGEUR / 2 - largeurDuTexte(m) / 2), y);
}
/** Une pièce de statère, dessin du site (`casesDuStatere`). */
function piece(taille: 12 | 24): Planche {
  return plancheDuDessin({ largeur: taille, hauteur: taille, cases: casesDuStatere(taille) });
}
/** Où poser les pièces de chaque lot : le tas du site (`dessinDuLot`), sauf le sixième, en deux rangs de trois pour tenir doublé. */
const TAS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [[0, 0], [8, 0]],
  [[4, 0], [0, 7], [8, 7]],
  [[8, 0], [0, 7], [8, 7], [16, 7]],
  [[4, 0], [12, 0], [0, 7], [8, 7], [16, 7]],
  [[0, 0], [8, 0], [16, 0], [0, 7], [8, 7], [16, 7]],
];
function tas(rang: number): Planche {
  const places = TAS[rang - 1] ?? TAS[0]!;
  const p = new Planche(Math.max(...places.map(([x]) => x)) + 12, Math.max(...places.map(([, y]) => y)) + 12);
  const pi = piece(12);
  for (const [x, y] of places) p.drawImage(pi, x, y);
  return p;
}

/**
 * La carte d'un lot de statères (le booster de statères ; dessin de Claude Fable 5.2) : ses six lots sont rangés de 1 à 6
 * comme les raretés, et en prennent les couleurs, la lumière et la fête ; sur la face, le tas de pièces du rang, « +350 »,
 * « STATÈRES », l'icône de la rareté de même rang, « LOT 3 SUR 6 ». Jamais un nom de rareté.
 */
export function carteDUnLot(rang: number, gain: number, lots = 6): CarteDeScene {
  const r = RARETES_DE_CARTE[Math.min(Math.max(Math.round(rang), 1), 6) - 1]!;
  const n = rangDe(r);
  const tons = TONS[r];
  const g = new Planche(CARTE_LARGEUR, CARTE_HAUTEUR);
  fondDeFace(g, tons);
  const t = tas(n);
  g.drawImage(t, Math.round(CARTE_LARGEUR / 2 - t.width), Math.round(22 - t.height), t.width * 2, t.height * 2);
  auCentre(g, `+${nombreEcrit(gain)}`, 45, "#0a1230");
  auCentre(g, "Statères", 54, "#0a1230");
  iconeDuRang(g, n);
  const mot = `Lot ${n} sur ${lots}`;
  auCentre(g, mot, 74, tons[3]);
  return { face: g, rarete: r, rang: n, nom: `+${nombreEcrit(gain)} statères`, mot, tons, lumiere: LUMIERES[r] };
}

const RETOUR = ["...k.......", "..kk.......", ".kkkkkkk...", "kkkkkkkkk..", ".kkkkkkkkk.", "..kk....kk.", "...k....kk.", "........kk.", ".......kkk.", "..kkkkkkk..", "..kkkkkk..."];
/**
 * La carte de statères rendus (boosters des bannières et des Gaulois uniques ; dessin de Claude Fable 5.2) : la pièce et sa
 * flèche de retour, « +600 », « STATÈRES », « RENDUS », un pointillé à la place de l'icône de rareté, « 40 % DU PRIX ». Ni
 * icône, ni nom de rareté : la lumière reste neutre et la fête est la plus sobre.
 */
export function carteDUnRendu(rendu: number, pourcent: number): CarteDeScene {
  const tons = TONS_DU_RENDU;
  const g = new Planche(CARTE_LARGEUR, CARTE_HAUTEUR);
  fondDeFace(g, tons);
  g.drawImage(piece(24), 28, 9);
  g.drawImage(grille(RETOUR, { k: tons[2] }), 13, 16);
  auCentre(g, `+${nombreEcrit(rendu)}`, 42, "#0a1230");
  auCentre(g, "Statères", 51, "#0a1230");
  auCentre(g, rendu > 1 ? "Rendus" : "Rendu", 60, "#0a1230");
  for (let x = 14; x < CARTE_LARGEUR - 14; x += 4) R(g, x, 70, 2, 1, tons[2]);
  const mot = `${String(Math.round(pourcent))} % du prix`;
  auCentre(g, mot, 74, tons[3]);
  return { face: g, rarete: "rendu", rang: 0, nom: `+${nombreEcrit(rendu)} ${rendu > 1 ? "statères rendus" : "statère rendu"}`, mot, tons, lumiere: LUMIERE_NEUTRE };
}

/** La place de l'image en haut d'une face : 62 × 38 cases au plus, réduite d'un facteur entier si elle est plus grande. */
export function placeDeLImage(largeur: number, hauteur: number): { largeur: number; hauteur: number } {
  const k = Math.max(1, Math.ceil(Math.max(largeur / 62, hauteur / 38)));
  return { largeur: Math.max(1, Math.round(largeur / k)), hauteur: Math.max(1, Math.round(hauteur / k)) };
}

/**
 * Le fond d'objet dans sa fenêtre, encadré d'une case du bord de la rareté. `place` : où l'image sera posée sur la face ; la
 * scène garde calme cette place et pose son sol sous elle.
 */
function poserLeFond(g: Planche, fond: FondDeLaFace, image: DessinEnCases, bord: string, place: { x: number; y: number; largeur: number; hauteur: number }): void {
  const { x: fx, y: fy, largeur, hauteur } = FENETRE_DU_FOND;
  const zone = { x: place.x - fx, y: place.y - fy, largeur: place.largeur, hauteur: place.hauteur };
  const posee = fond.pose === "sol" || fond.pose === "bas";
  const sol = Math.max(0, Math.min(hauteur - 1, zone.y + zone.hauteur + (posee ? 0 : 1)));
  const dessin = fondSeul(fond.cle, { largeur, hauteur, rarete: fond.rarete, accent: accentDuDessin(image), zone, sol });
  R(g, fx - 1, fy - 1, largeur + 2, hauteur + 2, bord);
  dessin.cases.forEach((c, i) => {
    if (c) R(g, fx + (i % largeur), fy + Math.floor(i / largeur), 1, 1, c);
  });
}

/** La face d'une carte : la case claire du site, comme dans la maquette validée (68 × 88). */
export function faceDeCarte(f: FaceDeCarte): Planche {
  const W = CARTE_LARGEUR;
  const H = CARTE_HAUTEUR;
  const g = new Planche(W, H);
  const [haut, bas, bord, encre] = f.tons;
  rr(g, 0, 0, W, H, 3, bord);
  rr(g, 1, 1, W - 2, H - 5, 2, haut);
  g.fillStyle = bas;
  for (let y = 1; y < H - 4; y++) {
    const t = (y / H) * 18 - 3;
    for (let x = 1; x < W - 1; x++) if (BAYER[(y & 3) * 4 + (x & 3)]! < t && !(y < 3 && (x < 3 || x > W - 4))) g.fillRect(x, y, 1, 1);
  }
  R(g, 2, 1, W - 4, 1, "#ffffff");
  if (f.image) {
    const place = placeDeLImage(f.image.largeur, f.image.hauteur);
    const x = Math.round(W / 2 - place.largeur / 2);
    const y = Math.round(21 - place.hauteur / 2);
    if (f.fond) poserLeFond(g, f.fond, f.image, bord, { x, y, largeur: place.largeur, hauteur: place.hauteur });
    g.drawImage(plancheDuDessin(f.image), x, y, place.largeur, place.hauteur);
  }
  const ls = lignesDuTexte(enCapitales(f.nom), W - 8, 3);
  // Sur une carte à rareté, le nom monte de deux cases pour laisser sa place à l'icône ; s'il tient sur trois lignes, elles
  // se serrent en plus d'une case chacune.
  const serre = f.rang > 0 && ls.length === 3;
  const y0 = serre ? 38 : (f.rang > 0 ? 40 : 42) + Math.floor((3 - ls.length) * 4.5);
  ls.forEach((l, i) => g.drawImage(ecrire(l, "#0a1230"), Math.round(W / 2 - largeurDuTexte(l) / 2), y0 + i * (serre ? 8 : 9)));
  if (f.rang > 0) iconeDuRang(g, f.rang);
  const mot = enCapitales(f.mot);
  g.drawImage(ecrire(mot, encre), Math.round(W / 2 - largeurDuTexte(mot) / 2), f.rang > 0 ? 74 : 71);
  return g;
}

/** Le dos de la carte, au torque, celui de la maquette validée (68 × 88). */
export function dosDeCarte(): Planche {
  const W = CARTE_LARGEUR;
  const H = CARTE_HAUTEUR;
  const g = new Planche(W, H);
  rr(g, 0, 0, W, H, 3, PAL.k);
  rr(g, 1, 1, W - 2, H - 2, 2, PAL.o);
  rr(g, 1, 1, W - 3, H - 3, 2, PAL.y);
  rr(g, 2, 2, W - 4, H - 4, 1, PAL.O);
  rr(g, 4, 4, W - 8, H - 8, 1, PAL.k);
  rr(g, 5, 5, W - 10, H - 10, 0, "#1f3aa8");
  g.fillStyle = "#2f55d8";
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) if ((x + y) % 6 === 0 || (x - y + 200) % 6 === 0) g.fillRect(x, y, 1, 1);
  R(g, 8, 9, W - 16, 10, PAL.k);
  R(g, 9, 10, W - 18, 8, "#0b1238");
  tresse(g, 10, 11, W - 20, 6, [PAL.y, PAL.O], [PAL.O, PAL.o], "#0b1238");
  R(g, 8, H - 19, W - 16, 10, PAL.k);
  R(g, 9, H - 18, W - 18, 8, "#0b1238");
  tresse(g, 10, H - 17, W - 20, 6, [PAL.y, PAL.O], [PAL.O, PAL.o], "#0b1238");
  rr(g, 12, 28, 44, 32, 6, PAL.k);
  rr(g, 13, 29, 42, 30, 5, PAL.y);
  rr(g, 15, 31, 38, 26, 4, PAL.k);
  rr(g, 16, 32, 36, 24, 3, "#0b1238");
  const t = grille(TORQUE, PAL);
  g.drawImage(t, 15, 35, t.width * 2, t.height * 2);
  return g;
}

/** Les fissures qui courent sur le corps du paquet sous l'effort, de 0 (aucune) à 1 (toutes) : 60 × 78 cases. */
const FISSURES: readonly (readonly (readonly [number, number])[])[] = [
  [[30, 18], [28, 12], [31, 7], [29, 1]],
  [[44, 24], [49, 20], [52, 13], [56, 9]],
  [[14, 30], [9, 27], [6, 20], [3, 15]],
  [[20, 44], [16, 51], [18, 58], [12, 66], [10, 75]],
  [[40, 44], [44, 52], [42, 60], [48, 68], [50, 76]],
  [[46, 36], [52, 40], [56, 47]],
];
export function fissures(prog: number): Planche {
  const g = new Planche(PAQUET_LARGEUR, PAQUET_HAUTEUR - 10);
  if (prog <= 0) return g;
  g.fillStyle = "#ffffff";
  for (const ligne of FISSURES) {
    let total = 0;
    for (let i = 1; i < ligne.length; i++) total += Math.hypot(ligne[i]![0] - ligne[i - 1]![0], ligne[i]![1] - ligne[i - 1]![1]);
    let reste = total * prog;
    for (let i = 1; i < ligne.length && reste > 0; i++) {
      const [x0, y0] = ligne[i - 1]!;
      const [x1, y1] = ligne[i]!;
      const l = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.ceil(Math.min(l, reste));
      for (let k = 0; k <= n; k++) g.fillRect(Math.round(x0 + ((x1 - x0) * k) / l), Math.round(y0 + ((y1 - y0) * k) / l), 1, 1);
      reste -= l;
    }
  }
  return g;
}

/** Un tirage au hasard qui se répète à graine égale (les dessins sont les mêmes à chaque fois). */
export function hasard(graine: number): () => number {
  let s = graine | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le ciel de la scène, en cases de 3 pixels : un dégradé tramé et des étoiles, toujours les mêmes. */
export function cielDeLaScene(largeur: number, hauteur: number, cielBas: string, etoile: string): Planche {
  const w = Math.max(1, Math.ceil(largeur));
  const h = Math.max(1, Math.ceil(hauteur));
  const g = new Planche(w, h);
  const rnd = hasard(41);
  g.fillStyle = cielBas;
  for (let y = 0; y < h; y++) {
    const t = (y / h) * 18 - 1;
    for (let x = 0; x < w; x++) if (BAYER[(y & 3) * 4 + (x & 3)]! < t) g.fillRect(x, y, 1, 1);
  }
  const [er, ev, eb] = lireCouleur(etoile);
  for (let i = 0; i < 54; i++) {
    const x = (rnd() * w) | 0;
    const y = (rnd() * h * 0.8) | 0;
    const c = `rgba(${er},${ev},${eb},${(0.35 + rnd() * 0.55).toFixed(3)})`;
    R(g, x, y, 1, 1, c);
    if (i % 7 === 0) {
      R(g, x - 1, y, 3, 1, c);
      R(g, x, y - 1, 1, 3, c);
    }
  }
  return g;
}

/** La tuile des grains de lumière d'une rareté haute (32 × 32 cases), posée par la feuille sur la carte. */
export function tuileDeGrains(couls: readonly string[], graine: number): Planche {
  const N = 32;
  const g = new Planche(N, N);
  const rnd = hasard(graine);
  for (let i = 0; i < 22; i++) {
    const x = (rnd() * N) | 0;
    const y = (rnd() * N) | 0;
    const c = couls[i % couls.length]!;
    R(g, x, y, 1, 1, c);
    if (i < 3) {
      R(g, (x + 1) % N, y, 1, 1, c);
      R(g, (x + N - 1) % N, y, 1, 1, c);
      R(g, x, (y + 1) % N, 1, 1, c);
      R(g, x, (y + N - 1) % N, 1, 1, c);
    }
  }
  return g;
}
export const GRAINS = {
  mystique: () => tuileDeGrains(["#ff2e4a", "#ffffff", "#ff8a3c"], 3),
  legendaire: () => tuileDeGrains(["#d9981b", "#ffffff", "#f2b632"], 5),
  divin: () => tuileDeGrains(["#19d3c5", "#ffffff", "#ff78d6", "#f2b632"], 8),
} as const;

/** Les rayons qui tournent derrière la carte : un dégradé conique en pointes irrégulières, toujours le même pour une graine. */
export function rayonsEnCss(coul: string, graine: number): string {
  const rnd = hasard(graine);
  const st: string[] = [];
  let a = 0;
  for (;;) {
    const a1 = a + 7 + rnd() * 15;
    const plein = 4 + rnd() * 9;
    const a3 = a1 + plein;
    if (a3 > 356) break;
    st.push(`rgba(${coul},0) ${a1.toFixed(1)}deg`, `rgba(${coul},${(0.35 + rnd() * 0.6).toFixed(2)}) ${(a1 + plein / 2).toFixed(1)}deg`, `rgba(${coul},0) ${a3.toFixed(1)}deg`);
    a = a3;
  }
  return `conic-gradient(rgba(${coul},0) 0deg,${st.join(",")},rgba(${coul},0) 360deg)`;
}
