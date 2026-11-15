/**
 * Le dessin d'une carte de partie rejouée : couleurs du terrain, des joueurs et des retombées, territoires posés sur le terrain.
 * Sert à la carte de fin des victoires (`carte-finale.ts`, image Discord) et au film des parties (`rejeu/film.ts`, page
 * « Revoir une partie »). Sans rien de Node : ce fichier va aussi dans le navigateur.
 *
 * Couleurs du terrain et dessin des territoires repris d'OpenFront (https://github.com/openfrontio/OpenFrontIO, AGPL-3.0,
 * commit a0abccc) comme pour `public/carte-monde/index.html`, d'où viennent les fichiers d'origine : encodeTerrainTile de
 * src/client/render/gl/utils/ColorUtils.ts avec les couleurs de src/client/render/gl/render-settings.json, remplissage de
 * src/client/render/gl/shaders/map-overlay/territory.frag.glsl, bord de borderColor (src/client/theme/ThemeProvider.ts).
 * Modifié le 15/11/2026 : réécrit en TypeScript pour une image fixe, sans WebGL ; les couleurs des joueurs sont celles du
 * site (les Gaulois dans le bleu de leurs pastilles, leur équipe en bleu clair, les autres équipes en couleurs chaudes, les
 * robots en gris), pas celles du jeu ; puis séparé de `carte-finale.ts` le même jour, pour le film des parties.
 * © OpenFront and Contributors : voir NOTICE.md.
 */

/* ---------- Le terrain ---------- */

export type Rgb = readonly [number, number, number];

/** Les bits de l'octet de terrain des cartes du jeu : terre, littoral, magnitude. */
export const TERRE = 0x80;
export const LITTORAL = 0x40;
const MAGNITUDE = 0x1f;
const INFRANCHISSABLE = 31;

/** Le pourtour de la carte n'est-il que de l'eau ? La mer du cadre peut alors l'entourer jusqu'au bord. */
export function ouverteSurLaMer(terrain: Uint8Array, largeur: number, hauteur: number): boolean {
  const eau = (x: number, y: number) => !((terrain[y * largeur + x] ?? TERRE) & TERRE);
  for (let x = 0; x < largeur; x++) if (!eau(x, 0) || !eau(x, hauteur - 1)) return false;
  for (let y = 0; y < hauteur; y++) if (!eau(0, y) || !eau(largeur - 1, y)) return false;
  return true;
}

/** Repris d'OpenFront : les couleurs de base du terrain, `render-settings.json`, section « terrain » (voir l'en-tête). */
const FOND: Rgb = [0x3c, 0x3c, 0x3c];
const OCEAN: Rgb = [0x47, 0x85, 0xb5];
const SABLE: Rgb = [0xcc, 0xcb, 0x9e];
const PLAINES: Rgb = [0xbe, 0xdc, 0x8a];
const HAUTEURS: Rgb = [0xdc, 0xcb, 0x9e];
const MONTAGNES: Rgb = [0xe6, 0xe6, 0xe6];

/** Repris d'OpenFront : encodeTerrainTile (voir l'en-tête), modifié le 15/11/2026 : renvoie [r, g, b]. */
export function couleurTerrain(octet: number): Rgb {
  const terre = (octet & TERRE) !== 0;
  const littoral = (octet & LITTORAL) !== 0;
  const magnitude = octet & MAGNITUDE;
  if (terre && magnitude === INFRANCHISSABLE) return FOND;
  if (terre && littoral) return SABLE;
  if (terre) {
    if (magnitude < 10) return [PLAINES[0], PLAINES[1] - 2 * magnitude, PLAINES[2]];
    if (magnitude < 20) {
      const m = magnitude - 10;
      return [Math.min(255, HAUTEURS[0] + 2 * m), Math.min(255, HAUTEURS[1] + 2 * m), Math.min(255, HAUTEURS[2] + 2 * m)];
    }
    const m = Math.floor(magnitude / 2);
    return [Math.min(255, MONTAGNES[0] + m), Math.min(255, MONTAGNES[1] + m), Math.min(255, MONTAGNES[2] + m)];
  }
  if (littoral) return [Math.round(0.7 * OCEAN[0] + 76.5), Math.round(0.7 * OCEAN[1] + 76.5), Math.round(0.7 * OCEAN[2] + 76.5)];
  const m = Math.min(magnitude, 10);
  return [Math.max(0, OCEAN[0] - m), Math.max(0, OCEAN[1] - m), Math.max(0, OCEAN[2] - m)];
}

/**
 * La mer de la carte de fin : un bleu de nuit, choix du site. La mer claire du jeu se confondait avec le bleu des Gaulois sur
 * l'image (essai sur la carte du monde, 15 novembre 2026) ; plus sombre, elle laisse ressortir chaque territoire. L'eau qui
 * touche la terre est un peu plus claire, pour dessiner les côtes.
 */
export const MER_FINALE_CSS = "#132D52";
export const MER_FINALE: Rgb = [0x13, 0x2d, 0x52];
export const LITTORAL_FINAL: Rgb = [0x24, 0x4a, 0x7c];
/** Le bord infranchissable de certaines cartes (le cadre de la carte du monde) : le fond du cadre de l'image, pas le gris du jeu. */
export const HORS_CARTE: Rgb = [0x0a, 0x14, 0x33];

/** La couleur d'une case sans territoire : le terrain du jeu sur la terre, la mer de nuit, le cadre hors de la carte. */
export function couleurDeFond(octet: number): Rgb {
  if (octet & TERRE) return (octet & MAGNITUDE) === INFRANCHISSABLE ? HORS_CARTE : couleurTerrain(octet);
  return octet & LITTORAL ? LITTORAL_FINAL : MER_FINALE;
}

/** Une case de terre, où un territoire se pose (le cadre infranchissable compris, comme dans le jeu). */
export const estTerre = (octet: number) => (octet & TERRE) !== 0;

/* ---------- Les couleurs des joueurs ---------- */

const hex = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Les Gaulois : le bleu de leurs pastilles sur l'image (`CARD_COLORS.BLUE`). */
export const COULEUR_GAULOIS = hex("#0B5FFF");
/** Les autres joueurs de leur équipe. */
export const COULEUR_EQUIPE = hex("#7FB0FF");
/** Les robots du jeu. */
export const COULEUR_ROBOTS = hex("#8E929C");
/**
 * Les autres équipes, ou les autres joueurs d'une partie sans équipes : des couleurs chaudes, loin des deux bleus et du vert
 * des retombées, le rouge des clans en face d'abord.
 */
export const COULEURS_ADVERSES: readonly Rgb[] = ["#E0303F", "#F28C28", "#9D4EDD", "#F2C94C", "#C2185B", "#8D6E63", "#F48FB1", "#6D2E46"].map(hex);
/**
 * Les retombées nucléaires, posées par-dessus : le vert de leur lueur dans le jeu (« falloutLight » de render-settings.json,
 * 0,15 ; 0,95 ; 0,15), pour qu'une terre ravagée ne se confonde pas avec une plaine.
 */
export const COULEUR_RETOMBEES: Rgb = [38, 242, 38];

/** Ce que le dessin sait d'un joueur de la partie : son petit numéro, son identifiant en partie, son équipe et son type. */
export interface JoueurDessine {
  n: number;
  client: string | null;
  equipe: string | null;
  type: string;
}

/**
 * La couleur de chaque joueur qui tient des cases. `gaulois` : les identifiants en partie des membres du clan de la victoire ;
 * `equipe` : leur équipe, celle qui a gagné (`null` dans une partie sans équipes). Les équipes adverses prennent leur couleur
 * dans l'ordre de leur nom, pour qu'une même partie se dessine toujours pareil.
 */
export function couleursDesJoueurs(joueurs: readonly JoueurDessine[], gaulois: ReadonlySet<string>, equipe: string | null): Map<number, Rgb> {
  const couleurs = new Map<number, Rgb>();
  const adverses = [...new Set(joueurs.filter((j) => j.type !== "BOT" && j.equipe !== null && j.equipe !== equipe).map((j) => j.equipe!))].sort();
  let seul = 0;
  for (const j of [...joueurs].sort((a, b) => a.n - b.n)) {
    if (j.client !== null && gaulois.has(j.client)) couleurs.set(j.n, COULEUR_GAULOIS);
    else if (j.type === "BOT") couleurs.set(j.n, COULEUR_ROBOTS);
    else if (equipe !== null && j.equipe === equipe) couleurs.set(j.n, COULEUR_EQUIPE);
    else if (j.equipe !== null && equipe !== null) couleurs.set(j.n, COULEURS_ADVERSES[adverses.indexOf(j.equipe) % COULEURS_ADVERSES.length]!);
    else couleurs.set(j.n, COULEURS_ADVERSES[seul++ % COULEURS_ADVERSES.length]!);
  }
  return couleurs;
}

/* ---------- Le dessin ---------- */

/**
 * Repris d'OpenFront : « territorySaturation » de render-settings.json et « borderDarken » du thème. L'opacité des territoires,
 * 0,588 dans le jeu, passe à 0,8 : l'image se voit en petit dans Discord, le terrain ne doit pas couvrir la couleur des joueurs.
 */
export const ALPHA_TERRITOIRE = 0.8;
const SATURATION = 0.85;
const ASSOMBRIR_BORD = 0.125;
/** Choix du site : les retombées assez fortes pour se voir de loin, le terrain encore un peu dessous. */
export const ALPHA_RETOMBEES = 0.62;

/** Repris d'OpenFront : fin de territory.frag.glsl, la couleur tirée vers sa luminance. */
export function sature([r, g, b]: Rgb): Rgb {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return [luma + (r - luma) * SATURATION, luma + (g - luma) * SATURATION, luma + (b - luma) * SATURATION];
}

/** Repris d'OpenFront : borderColor, la clarté HSL baissée de 12,5 points. */
export function couleurBord([r0, g0, b0]: Rgb): Rgb {
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  l = Math.max(0, l - ASSOMBRIR_BORD);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

export const mele = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Les cases d'une carte à dessiner : le propriétaire de chaque case (0 pour personne), son terrain, ses retombées. */
export interface CasesADessiner {
  largeur: number;
  hauteur: number;
  proprio: Uint16Array;
  terrain: Uint8Array;
  retombees: Uint8Array;
}

/**
 * Dessine la carte de fin à `largeur × hauteur` pixels, trois octets par pixel. Chaque pixel prend la case sous son centre.
 * Un territoire se pose sur le terrain comme dans le jeu, plus sombre et plein sur son bord ; `epaisseur` : la largeur du bord,
 * en pixels (2 pour une image dessinée au double de sa taille, puis réduite).
 */
export function dessinerCarteFinale(etat: CasesADessiner, couleurs: ReadonlyMap<number, Rgb>, largeur: number, hauteur: number, epaisseur = 1): Uint8Array {
  const colonne = new Uint32Array(largeur);
  for (let x = 0; x < largeur; x++) colonne[x] = Math.min(etat.largeur - 1, Math.floor(((x + 0.5) * etat.largeur) / largeur));
  const caseDe = new Uint32Array(largeur * hauteur);
  const qui = new Uint16Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const ligne = Math.min(etat.hauteur - 1, Math.floor(((y + 0.5) * etat.hauteur) / hauteur)) * etat.largeur;
    for (let x = 0; x < largeur; x++) {
      const t = ligne + colonne[x]!;
      caseDe[y * largeur + x] = t;
      qui[y * largeur + x] = couleurs.has(etat.proprio[t]!) ? etat.proprio[t]! : 0;
    }
  }
  const remplissages = new Map<number, Rgb>();
  const bords = new Map<number, Rgb>();
  for (const [n, c] of couleurs) {
    remplissages.set(n, sature(c));
    bords.set(n, couleurBord(c));
  }
  const autre = (x: number, y: number, n: number) => x < 0 || y < 0 || x >= largeur || y >= hauteur || qui[y * largeur + x] !== n;
  const surLeBord = (x: number, y: number, n: number) => {
    for (let d = 1; d <= epaisseur; d++) if (autre(x - d, y, n) || autre(x + d, y, n) || autre(x, y - d, n) || autre(x, y + d, n)) return true;
    return false;
  };
  const out = new Uint8Array(largeur * hauteur * 3);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const p = y * largeur + x;
      const t = caseDe[p]!;
      const octet = etat.terrain[t]!;
      let c: Rgb = couleurDeFond(octet);
      const n = qui[p]!;
      if (n !== 0 && estTerre(octet)) c = surLeBord(x, y, n) ? bords.get(n)! : mele(c, remplissages.get(n)!, ALPHA_TERRITOIRE);
      if (etat.retombees[t] && estTerre(octet)) c = mele(c, COULEUR_RETOMBEES, ALPHA_RETOMBEES);
      out[p * 3] = Math.round(c[0]);
      out[p * 3 + 1] = Math.round(c[1]);
      out[p * 3 + 2] = Math.round(c[2]);
    }
  }
  return out;
}

/** Les cases tenues par chaque couleur : la description de l'image dit ce qu'elle montre. */
export function partsDesCouleurs(etat: Pick<CasesADessiner, "proprio" | "terrain">, couleurs: ReadonlyMap<number, Rgb>): Map<Rgb, number> {
  const parts = new Map<Rgb, number>();
  for (let i = 0; i < etat.proprio.length; i++) {
    const c = couleurs.get(etat.proprio[i]!);
    if (c && etat.terrain[i]! & TERRE) parts.set(c, (parts.get(c) ?? 0) + 1);
  }
  return parts;
}
