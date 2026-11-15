/**
 * La carte de fin d'une victoire : qui tenait chaque case de la carte au dernier contrôle de la partie, rejouée avec le moteur
 * du jeu (`scripts/rejouer-victoires.ts`, demande du pilote du 15 novembre 2026 : « l'image de la map en fin game », comme
 * OFStats). Ce fichier lit ce que le rejeu a écrit, le vérifie, et le dessine.
 *
 * Le rejeu tourne dans un job sans secret (il exécute le code d'OpenFront) : tout ce qu'il écrit est relu ici comme une
 * donnée venue de l'extérieur. Un fichier au mauvais format, d'une autre partie, ou dont la fin n'a pas été contrôlée par les
 * empreintes du jeu est écarté, et l'image garde la vignette de la carte.
 *
 * Format, un fichier JSON (`EtatFinalMeta`) et un fichier binaire compressé par gzip, de `largeur × hauteur` cases, rangées
 * ligne après ligne : le propriétaire de chaque case (deux octets, petit-boutiste, 0 pour personne), puis l'octet de terrain
 * de chaque case, au format des cartes du jeu (bit 7 terre, bit 6 littoral, bit 5 océan, bits 0 à 4 magnitude), puis 1 par
 * case touchée par des retombées nucléaires, 0 sinon.
 *
 * Couleurs du terrain et dessin des territoires repris d'OpenFront (https://github.com/openfrontio/OpenFrontIO, AGPL-3.0,
 * commit a0abccc) comme pour `public/carte-monde/index.html`, d'où viennent les fichiers d'origine : encodeTerrainTile de
 * src/client/render/gl/utils/ColorUtils.ts avec les couleurs de src/client/render/gl/render-settings.json, remplissage de
 * src/client/render/gl/shaders/map-overlay/territory.frag.glsl, bord de borderColor (src/client/theme/ThemeProvider.ts).
 * Modifié le 15/11/2026 : réécrit en TypeScript pour une image fixe, sans WebGL ; les couleurs des joueurs sont celles du
 * site (les Gaulois dans le bleu de leurs pastilles, leur équipe en bleu clair, les autres équipes en couleurs chaudes, les
 * robots en gris), pas celles du jeu. © OpenFront and Contributors : voir NOTICE.md.
 */
import { gunzipSync } from "node:zlib";
import { z } from "zod";

export const FORMAT_CARTE_FINALE = 1;
/** La plus grande carte du jeu, la carte du monde géante, fait 4 108 × 1 948 cases : de la marge, sans laisser passer n'importe quoi. */
export const MAX_COTE = 5_000;
export const MAX_CASES = 12_000_000;
/** Octets par case dans le fichier binaire : deux pour le propriétaire, un pour le terrain, un pour les retombées. */
export const OCTETS_PAR_CASE = 4;
/**
 * Au-delà, les fichiers ne sont pas même lus : une description pèse quelques dizaines de kilo-octets (un joueur par robot), les
 * cases compressées quelques centaines.
 */
export const MAX_OCTETS_DESCRIPTION = 4_000_000;
export const MAX_OCTETS_CASES = MAX_CASES * OCTETS_PAR_CASE;
/**
 * Les empreintes du jeu viennent toutes les 10 étapes, soit une seconde. Au-delà de 5 secondes entre le dernier contrôle et la
 * fin de la fiche, la fin de la partie n'est pas contrôlée : pas de carte.
 */
export const ECART_FIN_MAX = 50;

export const JoueurFinal = z.object({
  /** Le petit numéro du joueur dans la partie : celui des cases. */
  n: z.number().int().min(1).max(65_535),
  /** L'identifiant du joueur dans la partie, public dans la fiche de la partie. `null` : robot ou nation. */
  client: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,32}$/)
    .nullable(),
  equipe: z.string().min(1).max(40).nullable(),
  type: z.string().min(1).max(20),
});
export type JoueurFinal = z.infer<typeof JoueurFinal>;

export const EtatFinalMeta = z
  .object({
    format: z.literal(FORMAT_CARTE_FINALE),
    partie: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    largeur: z.number().int().min(1).max(MAX_COTE),
    hauteur: z.number().int().min(1).max(MAX_COTE),
    /** Les étapes rejouées, jusqu'au dernier contrôle compris, et celles de la fiche. */
    tours: z.number().int().min(1),
    toursFiche: z.number().int().min(1),
    /** Les empreintes du jeu retrouvées, toutes, jusqu'au dernier contrôle. */
    empreintes: z.number().int().min(1),
    joueurs: z.array(JoueurFinal).max(5_000),
  })
  .refine((m) => m.largeur * m.hauteur <= MAX_CASES, "carte trop grande")
  .refine((m) => m.tours <= m.toursFiche && m.toursFiche - m.tours <= ECART_FIN_MAX, "fin de partie non contrôlée")
  .refine((m) => new Set(m.joueurs.map((j) => j.n)).size === m.joueurs.length, "joueur en double");
export type EtatFinalMeta = z.infer<typeof EtatFinalMeta>;

export interface EtatFinal extends EtatFinalMeta {
  proprio: Uint16Array;
  terrain: Uint8Array;
  retombees: Uint8Array;
}

/** Les cases rangées pour le fichier binaire, avant compression : ce qu'écrit le rejeu. */
export function casesEnOctets(proprio: Uint16Array, terrain: Uint8Array, retombees: Uint8Array): Uint8Array {
  const n = proprio.length;
  const out = new Uint8Array(n * OCTETS_PAR_CASE);
  const vue = new DataView(out.buffer);
  for (let i = 0; i < n; i++) vue.setUint16(i * 2, proprio[i]!, true);
  out.set(terrain, n * 2);
  out.set(retombees, n * 3);
  return out;
}

/**
 * Relit l'état final d'une partie, écrit par le rejeu. Lève une erreur, en mots, si quoi que ce soit ne va pas : l'image garde
 * alors la vignette de la carte. `partie` : l'identifiant de la victoire à dessiner, que le fichier doit porter.
 */
export function lireEtatFinal(metaTexte: string, binaireGz: Uint8Array, partie: string): EtatFinal {
  let brut: unknown;
  try {
    brut = JSON.parse(metaTexte);
  } catch {
    throw new Error("description illisible");
  }
  const parsed = EtatFinalMeta.safeParse(brut);
  if (!parsed.success) throw new Error(`description au mauvais format (${parsed.error.issues[0]?.message ?? "?"})`);
  const meta = parsed.data;
  if (meta.partie !== partie) throw new Error("fichier d'une autre partie");
  const n = meta.largeur * meta.hauteur;
  let octets: Buffer;
  try {
    octets = gunzipSync(binaireGz, { maxOutputLength: n * OCTETS_PAR_CASE });
  } catch {
    throw new Error("cases illisibles");
  }
  if (octets.length !== n * OCTETS_PAR_CASE) throw new Error("nombre de cases inattendu");
  const proprio = new Uint16Array(n);
  for (let i = 0; i < n; i++) proprio[i] = octets.readUInt16LE(i * 2);
  const connus = new Set(meta.joueurs.map((j) => j.n));
  for (let i = 0; i < n; i++) if (proprio[i] !== 0 && !connus.has(proprio[i]!)) throw new Error("case d'un joueur inconnu");
  const terrain = new Uint8Array(octets.subarray(n * 2, n * 3));
  const retombees = new Uint8Array(octets.subarray(n * 3, n * 4));
  return { ...meta, proprio, terrain, retombees };
}

/* ---------- Le terrain ---------- */

export type Rgb = readonly [number, number, number];

const TERRE = 0x80;
const LITTORAL = 0x40;
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

/**
 * La couleur de chaque joueur qui tient des cases. `gaulois` : les identifiants en partie des membres du clan de la victoire ;
 * `equipe` : leur équipe, celle qui a gagné (`null` dans une partie sans équipes). Les équipes adverses prennent leur couleur
 * dans l'ordre de leur nom, pour qu'une même partie se dessine toujours pareil.
 */
export function couleursDesJoueurs(joueurs: readonly JoueurFinal[], gaulois: ReadonlySet<string>, equipe: string | null): Map<number, Rgb> {
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
const ALPHA_TERRITOIRE = 0.8;
const SATURATION = 0.85;
const ASSOMBRIR_BORD = 0.125;
/** Choix du site : les retombées assez fortes pour se voir de loin, le terrain encore un peu dessous. */
const ALPHA_RETOMBEES = 0.62;

/** Repris d'OpenFront : fin de territory.frag.glsl, la couleur tirée vers sa luminance. */
function sature([r, g, b]: Rgb): Rgb {
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

const mele = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Dessine la carte de fin à `largeur × hauteur` pixels, trois octets par pixel. Chaque pixel prend la case sous son centre.
 * Un territoire se pose sur le terrain comme dans le jeu, plus sombre et plein sur son bord ; `epaisseur` : la largeur du bord,
 * en pixels (2 pour une image dessinée au double de sa taille, puis réduite).
 */
export function dessinerCarteFinale(etat: Pick<EtatFinal, "largeur" | "hauteur" | "proprio" | "terrain" | "retombees">, couleurs: ReadonlyMap<number, Rgb>, largeur: number, hauteur: number, epaisseur = 1): Uint8Array {
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
      let c: Rgb = octet & TERRE ? ((octet & MAGNITUDE) === INFRANCHISSABLE ? HORS_CARTE : couleurTerrain(octet)) : octet & LITTORAL ? LITTORAL_FINAL : MER_FINALE;
      const n = qui[p]!;
      if (n !== 0 && octet & TERRE) c = surLeBord(x, y, n) ? bords.get(n)! : mele(c, remplissages.get(n)!, ALPHA_TERRITOIRE);
      if (etat.retombees[t] && octet & TERRE) c = mele(c, COULEUR_RETOMBEES, ALPHA_RETOMBEES);
      out[p * 3] = Math.round(c[0]);
      out[p * 3 + 1] = Math.round(c[1]);
      out[p * 3 + 2] = Math.round(c[2]);
    }
  }
  return out;
}

/** Les cases tenues par chaque couleur : la description de l'image dit ce qu'elle montre. */
export function partsDesCouleurs(etat: Pick<EtatFinal, "proprio" | "terrain">, couleurs: ReadonlyMap<number, Rgb>): Map<Rgb, number> {
  const parts = new Map<Rgb, number>();
  for (let i = 0; i < etat.proprio.length; i++) {
    const c = couleurs.get(etat.proprio[i]!);
    if (c && etat.terrain[i]! & TERRE) parts.set(c, (parts.get(c) ?? 0) + 1);
  }
  return parts;
}
