/**
 * Le décor de la place du village (docs/DIRECTION.md, « Le village des Gaulois »), en pixels : un village gaulois la nuit,
 * dessiné case par case pour ce site, sans emprunt à une œuvre existante. Un ciel, une lisière de forêt, une palissade de
 * pieux, des huttes rondes au toit de chaume, des chênes, et le feu au milieu de la place.
 *
 * Le décor se compose pour n'importe quelle largeur : le feu reste au milieu, les huttes et les arbres se rangent de part
 * et d'autre tant qu'il y a de la place. Tout est calculé, rien n'est tiré au hasard à l'écran : la même largeur donne
 * toujours le même dessin. Design : Claude Fable 5.2.
 */

/** Un dessin en cases : `largeur` × `hauteur` couleurs « #rrggbb », rangée par rangée, `null` pour une case vide. */
export interface Decor {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** La hauteur du décor, en cases, et la plus petite largeur dessinée. */
export const DECOR_HAUTEUR = 72;
export const DECOR_LARGEUR_MIN = 150;

/** La première rangée du sol : au-dessus, le ciel et le village ; dessous, l'herbe où se tiennent les Gaulois. */
const SOL = 58;
/** La rangée où reposent les huttes et les arbres. */
const PIED = SOL + 2;
/** Le côté de la tuile du sol : l'herbe se répète à l'identique toutes les `TUILE` cases. */
export const TUILE_DU_SOL = 24;

/** Un nombre de 0 à 1 qui ne dépend que de la case : le même à chaque dessin. */
function alea(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CIEL = ["#0a1230", "#0c1638", "#0f1b42", "#12214c", "#162857"] as const;
const HERBE = { fond: "#1f4a2c", claire: "#2f6a3d", sombre: "#173a22", bord: "#2a5c36", lueur: "#34613a" } as const;
const TERRE = { fond: "#5a4630", claire: "#6b5439", sombre: "#4a3926" } as const;
const BOIS = { fond: "#5d3d22", autre: "#684627", clair: "#7d5631", sombre: "#472d19", creux: "#2a1a10", corde: "#8a7a55", cordeSombre: "#6a5c3e" } as const;
const CHAUME = { fond: "#a8853a", clair: "#c29f4c", sombre: "#86682b", brin: "#735826", rang: "#7c6029", bord: "#5f4a1f" } as const;
const MUR = { fond: "#b08f5c", clair: "#c4a46e", sombre: "#8f7045", trame: "#9c7c4c", ombre: "#74593a" } as const;
const FEUILLES = { fond: "#1d5a36", claire: "#2c7a48", sombre: "#134226" } as const;

/** Une case d'herbe. Les deux coordonnées se lisent dans la tuile : le sol se prolonge sous le décor sans raccord visible. */
function caseDuSol(x: number, y: number): string {
  const a = alea(x % TUILE_DU_SOL, y % TUILE_DU_SOL);
  if (a < 0.06) return HERBE.claire;
  if (a < 0.1) return HERBE.sombre;
  return HERBE.fond;
}

/**
 * La tuile du sol, à répéter sous le décor : elle commence à la rangée qui suit la dernière du décor, pour que les touffes
 * d'herbe se suivent sans marche.
 */
export function tuileDuSol(): Decor {
  const cases: string[] = [];
  const depart = DECOR_HAUTEUR - SOL;
  for (let y = 0; y < TUILE_DU_SOL; y++) for (let x = 0; x < TUILE_DU_SOL; x++) cases.push(caseDuSol(x, y + depart));
  return { largeur: TUILE_DU_SOL, hauteur: TUILE_DU_SOL, cases };
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
/** La rangée où reposent les pierres du feu. */
const PIED_DU_FEU = SOL + 10;

/** Où est le feu dans un décor de cette largeur : la colonne de son milieu et la rangée du haut de sa flamme. */
export function feuDuDecor(largeur: number): { x: number; y: number } {
  return { x: Math.floor(Math.max(largeur, DECOR_LARGEUR_MIN) / 2), y: PIED_DU_FEU - FEU.length + 1 };
}

/** Ce qui se range de part et d'autre du feu. */
type Place = { type: "hutte"; x: number; grande: boolean; eclairee: boolean } | { type: "arbre"; x: number };

/** Les huttes et les arbres d'un décor de cette largeur, du plus proche du feu au plus loin. */
export function placesDuDecor(largeur: number): Place[] {
  const l = Math.max(largeur, DECOR_LARGEUR_MIN);
  const milieu = Math.floor(l / 2);
  const places: Place[] = [];
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

/** Le village de nuit, pour une largeur donnée en cases. */
export function composerDecor(largeurDemandee: number): Decor {
  const largeur = Math.max(Math.floor(largeurDemandee), DECOR_LARGEUR_MIN);
  const hauteur = DECOR_HAUTEUR;
  const cases: string[] = new Array<string>(largeur * hauteur).fill(CIEL[0]);
  const poser = (x: number, y: number, couleur: string) => {
    if (x >= 0 && x < largeur && y >= 0 && y < hauteur) cases[y * largeur + x] = couleur;
  };

  // Le ciel : cinq bandes du plus sombre au plus clair, mêlées en damier là où elles se touchent.
  for (let y = 0; y < SOL; y++) {
    const rang = (y / SOL) * CIEL.length;
    const bande = Math.min(CIEL.length - 1, Math.floor(rang));
    const pres = rang - bande > 0.8 && bande < CIEL.length - 1;
    for (let x = 0; x < largeur; x++) poser(x, y, pres && (x + y) % 2 === 0 ? CIEL[bande + 1]! : CIEL[bande]!);
  }
  // Les étoiles, rares, et un croissant de lune.
  for (let y = 1; y < 34; y++) {
    for (let x = 0; x < largeur; x++) {
      const a = alea(x + 911, y + 57);
      if (a < 0.004) poser(x, y, "#c0c9e2");
      else if (a < 0.009) poser(x, y, "#5469ae");
    }
  }
  const lune = { x: largeur - 22, y: 11, r: 6 };
  for (let dy = -lune.r; dy <= lune.r; dy++) {
    for (let dx = -lune.r; dx <= lune.r; dx++) {
      if (dx * dx + dy * dy > lune.r * lune.r) continue;
      if ((dx - 3) * (dx - 3) + (dy + 2) * (dy + 2) < 30) continue;
      poser(lune.x + dx, lune.y + dy, dy > 3 ? "#d9cf9f" : "#f4ecc8");
    }
  }

  // La lisière de la forêt : deux rangs de cimes, le plus loin plus sombre.
  for (let x = 0; x < largeur; x++) {
    const loin = 31 + Math.round(3 * Math.sin(x / 13) + 2 * Math.sin(x / 5.1 + 1.3) + Math.abs(((x + 3) % 9) - 4) * 1.2);
    for (let y = loin; y < SOL; y++) poser(x, y, "#0c1d36");
    const pres = 38 + Math.round(2.5 * Math.sin(x / 9 + 2) + 2 * Math.sin(x / 3.7) + Math.abs((x % 11) - 5) * 1.1);
    for (let y = pres; y < SOL; y++) poser(x, y, alea(x, y) < 0.08 ? "#143a3c" : "#0f2c33");
  }

  // La palissade : des pieux taillés en pointe, de hauteurs un peu inégales, liés par une corde.
  for (let x = 0; x < largeur; x++) {
    const pieu = Math.floor(x / 5);
    const dans = x % 5;
    const haut = 44 + Math.floor(alea(pieu, 1) * 3);
    if (dans === 4) {
      for (let y = haut + 3; y < SOL + 1; y++) poser(x, y, BOIS.creux);
      continue;
    }
    const fond = pieu % 2 === 0 ? BOIS.fond : BOIS.autre;
    for (let y = haut; y < SOL + 1; y++) {
      // La pointe : deux cases en haut, puis quatre.
      if (y === haut && (dans === 0 || dans === 3)) continue;
      let couleur: string = dans === 0 ? BOIS.clair : dans === 3 ? BOIS.sombre : fond;
      if (y === 50) couleur = BOIS.corde;
      else if (y === 51) couleur = BOIS.cordeSombre;
      else if (alea(x, y) < 0.05) couleur = BOIS.sombre;
      poser(x, y, couleur);
    }
  }

  // Le sol : l'herbe, un bord plus clair au pied de la palissade.
  for (let y = SOL; y < hauteur; y++) for (let x = 0; x < largeur; x++) poser(x, y, y === SOL ? (alea(x, y) < 0.5 ? HERBE.bord : HERBE.fond) : caseDuSol(x, y - SOL));

  // Autour du feu : la terre battue, et l'herbe éclairée, mêlée en damier.
  const feu = feuDuDecor(largeur);
  for (let y = SOL + 1; y < hauteur - 1; y++) {
    for (let x = feu.x - 36; x <= feu.x + 36; x++) {
      const dx = (x - feu.x) / 22;
      const dy = (y - (SOL + 7)) / 5;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const a = alea(x, y + 300);
        poser(x, y, a < 0.12 ? TERRE.claire : a < 0.22 ? TERRE.sombre : TERRE.fond);
      } else if (d <= 2.2 && (x + y) % 2 === 0) poser(x, y, HERBE.lueur);
    }
  }

  // Les huttes et les arbres, des plus loin aux plus proches du feu.
  for (const place of placesDuDecor(largeur).reverse()) {
    if (place.type === "arbre") poserArbre(poser, place.x);
    else poserHutte(poser, place.x, place.grande, place.eclairee);
  }

  // Le feu.
  FEU.forEach((ligne, dy) => {
    for (let dx = 0; dx < ligne.length; dx++) {
      const couleur = COULEURS_DU_FEU[ligne[dx]!];
      if (couleur) poser(feu.x - Math.floor(ligne.length / 2) + dx, feu.y + dy, couleur);
    }
  });

  return { largeur, hauteur, cases };
}

type Poser = (x: number, y: number, couleur: string) => void;

/** Une hutte ronde : un mur de clayonnage, une porte, un toit de chaume en cône. `eclairee` : un feu brûle dedans. */
function poserHutte(poser: Poser, cx: number, grande: boolean, eclairee: boolean): void {
  const demiMur = grande ? 17 : 14;
  const hautMur = grande ? 13 : 11;
  const hautToit = grande ? 26 : 22;
  const demiToit = demiMur + 6;
  const hautDuMur = PIED - hautMur + 1;

  // Le mur : plus clair à gauche, plus sombre à droite, une trame toutes les trois rangées, l'ombre du toit en haut.
  for (let y = hautDuMur; y <= PIED; y++) {
    for (let dx = -demiMur; dx <= demiMur; dx++) {
      let couleur: string = dx < -demiMur / 2 ? MUR.clair : dx > demiMur / 2 ? MUR.sombre : MUR.fond;
      if ((y - hautDuMur) % 3 === 2) couleur = dx > demiMur / 2 ? MUR.ombre : MUR.trame;
      if (y < hautDuMur + 3) couleur = MUR.ombre;
      if (Math.abs(dx) === demiMur) couleur = MUR.ombre;
      poser(cx + dx, y, couleur);
    }
  }
  // La porte, cintrée, entre deux poteaux.
  const demiPorte = grande ? 4 : 3;
  const hautPorte = hautMur - 3;
  for (let i = 0; i < hautPorte; i++) {
    const y = PIED - i;
    const retrait = i === hautPorte - 1 ? 1 : 0;
    for (let dx = -demiPorte + retrait; dx <= demiPorte - retrait; dx++) {
      let couleur: string = BOIS.creux;
      if (eclairee) couleur = Math.abs(dx) <= 1 && i < hautPorte - 2 ? "#ffd75a" : Math.abs(dx) <= demiPorte - 2 ? "#f5a83a" : "#c9722a";
      poser(cx + dx, y, couleur);
    }
    poser(cx - demiPorte - 1, y, BOIS.sombre);
    poser(cx + demiPorte + 1, y, BOIS.sombre);
  }
  for (let dx = -demiPorte - 1; dx <= demiPorte + 1; dx++) poser(cx + dx, PIED - hautPorte, BOIS.sombre);

  // Le toit : un cône de chaume qui déborde du mur, en rangs, éclairé à gauche.
  const basDuToit = hautDuMur + 2;
  const sommet = basDuToit - hautToit + 1;
  for (let r = 0; r < hautToit; r++) {
    const demi = Math.max(1, Math.round(((r + 1) * demiToit) / hautToit));
    for (let dx = -demi; dx <= demi; dx++) {
      let couleur: string = dx < -demi / 3 ? CHAUME.clair : dx > demi / 3 ? CHAUME.sombre : CHAUME.fond;
      if (r % 6 === 5) couleur = CHAUME.rang;
      else if (alea(cx + dx, r) < 0.16) couleur = CHAUME.brin;
      if (Math.abs(dx) === demi || r === hautToit - 1) couleur = CHAUME.bord;
      poser(cx + dx, sommet + r, couleur);
    }
  }
  // Le faîte : un bouquet de paille liée.
  poser(cx, sommet - 1, CHAUME.bord);
  poser(cx - 1, sommet - 2, CHAUME.rang);
  poser(cx + 1, sommet - 2, CHAUME.rang);
  poser(cx, sommet - 2, CHAUME.bord);
}

/** Un chêne : un tronc et une ramure ronde, éclairée en haut à gauche. */
function poserArbre(poser: Poser, cx: number): void {
  for (let y = PIED - 17; y <= PIED; y++) {
    const evase = y > PIED - 3 ? 1 : 0;
    for (let dx = -3 - evase; dx <= 2 + evase; dx++) poser(cx + dx, y, dx < -1 ? "#5f3f25" : dx > 0 ? "#38230f" : "#4a301c");
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
      let couleur: string = pente < -0.55 ? FEUILLES.claire : pente > 0.5 ? FEUILLES.sombre : FEUILLES.fond;
      if (a < 0.07) couleur = FEUILLES.sombre;
      else if (a > 0.95) couleur = FEUILLES.claire;
      poser(cx + dx, PIED + dy, couleur);
    }
  }
}
