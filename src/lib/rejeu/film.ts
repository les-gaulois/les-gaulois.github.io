/**
 * Le film d'une partie du clan, pour la page « Revoir une partie » (demande du pilote du 15 novembre 2026 : revoir les victoires
 * et les défaites déjà jouées, « comme si tu ouvrais le lien de la game dans ton site »). OpenFront interdit d'afficher son jeu
 * dans un autre site, et son API refuse les appels du navigateur (docs/API_AUDIT.md) : le robot du site rejoue donc chaque
 * partie avec le moteur du jeu (`scripts/filmer-parties.ts`), et n'en garde que ce film, qui se lit ici. Sans rien de Node : ce
 * fichier va aussi dans le navigateur.
 *
 * Le film ne montre que qui tient chaque case, sur une grille réduite de la carte (une case sur `facteur` dans chaque sens), une
 * image toutes les `pas` étapes du jeu (une étape dure 100 ms) et à la dernière. Pas de nom : les couleurs disent le camp.
 *
 * Format (avant compression gzip du fichier entier) :
 *   « GALF », un octet de version, la longueur de l'en-tête sur deux octets (petit-boutiste), l'en-tête en JSON (`EnteteFilm`),
 *   l'octet de terrain de chaque case de la grille (au format des cartes du jeu), puis chaque image : son nombre de plages de
 *   cases changées, et pour chaque plage l'écart depuis la fin de la précédente, sa longueur moins un (deux entiers LEB128) et
 *   la valeur de ses cases, un octet : la classe (`CLASSE`) plus `RETOMBEES` si des retombées nucléaires la touchent.
 *
 * Le dessin d'une image (`PeintreFilm`) reprend celui de la carte de fin des victoires (`carte-dessin.ts`), lui-même repris
 * d'OpenFront (https://github.com/openfrontio/OpenFrontIO, AGPL-3.0, commit a0abccc) : remplissage des territoires de
 * src/client/render/gl/shaders/map-overlay/territory.frag.glsl, bord de borderColor (src/client/theme/ThemeProvider.ts),
 * couleurs du terrain de encodeTerrainTile (src/client/render/gl/utils/ColorUtils.ts) et de render-settings.json. Modifié le
 * 15/11/2026 : réécrit en TypeScript pour une grille réduite, case par case, sans WebGL, aux couleurs des camps du site, les
 * couleurs calculées une fois par film. © OpenFront and Contributors : voir NOTICE.md.
 */
import { ALPHA_RETOMBEES, ALPHA_TERRITOIRE, COULEUR_EQUIPE, COULEUR_GAULOIS, COULEUR_RETOMBEES, COULEUR_ROBOTS, COULEURS_ADVERSES, couleurBord, couleurDeFond, estTerre, sature, type Rgb } from "../carte-dessin";

export const FORMAT_FILM = 1;
const MAGIE = [0x47, 0x41, 0x4c, 0x46];

/** La grille du film tient en au plus tant de cases : la carte du monde géante (4 108 × 1 948) devient 514 × 244. */
export const CASES_FILM_MAX = 160_000;
/** Au plus tant d'images : une partie de plusieurs heures se résume, une courte garde une image par seconde. */
export const IMAGES_FILM_MAX = 360;
export const PAS_FILM_MIN = 10;
/** La durée d'une étape du jeu (`turnIntervalMs` d'OpenFront) : une partie de 4 791 étapes a duré 481 s. */
export const MS_PAR_ETAPE = 100;

/** Le camp de chaque case. Les adversaires prennent les classes suivantes, une par équipe (ou par joueur), huit au plus. */
export const CLASSE = { personne: 0, gaulois: 1, equipe: 2, robots: 3, adverses: 4 } as const;
export const RETOMBEES = 0x10;
const CLASSE_MASQUE = 0x0f;
export const NOMBRE_DE_CLASSES = CLASSE.adverses + COULEURS_ADVERSES.length;

/** La couleur de chaque classe, celles de la carte de fin des victoires. `null` : personne. */
export const COULEURS_DES_CLASSES: readonly (Rgb | null)[] = [null, COULEUR_GAULOIS, COULEUR_EQUIPE, COULEUR_ROBOTS, ...COULEURS_ADVERSES];

/**
 * La grille réduite d'une carte, comme le moteur la note (`Film` de scripts/rejeu-openfront/entree.ts) : le plus petit
 * facteur qui la fait tenir en `CASES_FILM_MAX` cases (l'arrondi vers le haut de chaque côté peut en ajouter une rangée).
 */
export function grilleDuFilm(largeur: number, hauteur: number): { facteur: number; largeur: number; hauteur: number } {
  let facteur = Math.max(1, Math.ceil(Math.sqrt((largeur * hauteur) / CASES_FILM_MAX)));
  while (Math.ceil(largeur / facteur) * Math.ceil(hauteur / facteur) > CASES_FILM_MAX) facteur++;
  return { facteur, largeur: Math.ceil(largeur / facteur), hauteur: Math.ceil(hauteur / facteur) };
}

/** Le pas entre deux images et leur nombre, pour une partie dont la dernière étape contrôlée est `derniere`. */
export function imagesDuFilm(derniere: number): { pas: number; images: number } {
  const pas = Math.max(PAS_FILM_MIN, Math.ceil(derniere / (IMAGES_FILM_MAX - 2)));
  return { pas, images: Math.floor(derniere / pas) + 1 + (derniere % pas === 0 ? 0 : 1) };
}

/** L'étape du jeu montrée par l'image `k`. */
export function etapeDeLImage(entete: Pick<EnteteFilm, "pas" | "tours" | "images">, k: number): number {
  return k === entete.images - 1 ? entete.tours - 1 : k * entete.pas;
}

export interface EnteteFilm {
  format: typeof FORMAT_FILM;
  partie: string;
  /** Le nom de la carte dans le jeu, tel que la fiche de la partie le donne. */
  carte: string;
  /** Le début de la partie (ISO), sa victoire ou sa défaite pour le clan, comme OpenFront les compte. */
  debut: string;
  victoire: boolean;
  /** Le format de la partie selon OpenFront (`playerTeams` de la session : « Duos », « 5 »…). */
  equipes: string;
  gaulois: number;
  joueurs: number;
  largeur: number;
  hauteur: number;
  facteur: number;
  pas: number;
  images: number;
  /** Les étapes rejouées, jusqu'au dernier contrôle des empreintes du jeu. */
  tours: number;
  /** Les classes d'adversaires qui servent dans le film : la légende n'en montre pas d'autres. */
  adverses: number;
  /** Une équipe aux Gaulois, avec d'autres joueurs qu'eux : la légende montre « leur équipe ». */
  equipe: boolean;
}

export interface Film {
  entete: EnteteFilm;
  terrain: Uint8Array;
  /** Où commence chaque image dans `donnees`. */
  debuts: Uint32Array;
  donnees: Uint8Array;
}

/* ---------- Écrire ---------- */

function varint(sortie: number[], v: number) {
  while (v >= 0x80) {
    sortie.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  sortie.push(v);
}

/**
 * Écrit un film image par image : chaque grille donnée (une classe par case, `RETOMBEES` en plus) est comparée à la précédente,
 * et seules les plages de cases changées sont écrites.
 */
export class EcrivainFilm {
  private readonly avant: Uint8Array;
  private readonly octets: number[] = [];
  images = 0;

  constructor(
    private readonly largeur: number,
    private readonly hauteur: number,
  ) {
    this.avant = new Uint8Array(largeur * hauteur);
  }

  ajouter(grille: Uint8Array) {
    if (grille.length !== this.avant.length) throw new Error("grille de la mauvaise taille");
    const plages: number[] = [];
    let nombre = 0;
    let fin = 0;
    let i = 0;
    const n = grille.length;
    while (i < n) {
      if (grille[i] === this.avant[i]) {
        i++;
        continue;
      }
      const v = grille[i]!;
      let j = i + 1;
      while (j < n && grille[j] === v && grille[j] !== this.avant[j]) j++;
      varint(plages, i - fin);
      varint(plages, j - i - 1);
      plages.push(v);
      nombre++;
      this.avant.fill(v, i, j);
      fin = j;
      i = j;
    }
    varint(this.octets, nombre);
    for (const o of plages) this.octets.push(o);
    this.images++;
  }

  /** Le film entier, avant compression. */
  octetsDuFilm(entete: EnteteFilm, terrain: Uint8Array): Uint8Array {
    if (terrain.length !== this.largeur * this.hauteur) throw new Error("terrain de la mauvaise taille");
    if (entete.images !== this.images) throw new Error("nombre d'images inattendu");
    const texte = new TextEncoder().encode(JSON.stringify(entete));
    if (texte.length > 0xffff) throw new Error("en-tête trop long");
    const out = new Uint8Array(7 + texte.length + terrain.length + this.octets.length);
    out.set(MAGIE, 0);
    out[4] = FORMAT_FILM;
    out[5] = texte.length & 0xff;
    out[6] = texte.length >> 8;
    out.set(texte, 7);
    out.set(terrain, 7 + texte.length);
    out.set(this.octets, 7 + texte.length + terrain.length);
    return out;
  }
}

/* ---------- Lire ---------- */

const entier = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const texte = (v: unknown, motif: RegExp): v is string => typeof v === "string" && motif.test(v);

/** Relit l'en-tête d'un film : lève une erreur, en mots, s'il ne convient pas. */
export function lireEntete(brut: unknown): EnteteFilm {
  if (typeof brut !== "object" || brut === null) throw new Error("en-tête illisible");
  const e = brut as Record<string, unknown>;
  const ok =
    e.format === FORMAT_FILM &&
    texte(e.partie, /^[A-Za-z0-9]{1,32}$/) &&
    texte(e.carte, /^[^<>]{1,80}$/) &&
    texte(e.debut, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/) &&
    typeof e.victoire === "boolean" &&
    texte(e.equipes, /^[A-Za-z0-9 ]{1,20}$/) &&
    entier(e.gaulois, 0, 1_000) &&
    entier(e.joueurs, 0, 10_000) &&
    entier(e.largeur, 1, 5_000) &&
    entier(e.hauteur, 1, 5_000) &&
    entier(e.facteur, 1, 100) &&
    entier(e.pas, PAS_FILM_MIN, 10_000_000) &&
    entier(e.images, 1, IMAGES_FILM_MAX) &&
    entier(e.tours, 1, 100_000_000) &&
    entier(e.adverses, 0, COULEURS_ADVERSES.length) &&
    typeof e.equipe === "boolean";
  if (!ok) throw new Error("en-tête au mauvais format");
  const entete = e as unknown as EnteteFilm;
  if (entete.largeur * entete.hauteur > CASES_FILM_MAX) throw new Error("grille trop grande");
  return { ...entete };
}

/**
 * Relit un film décompressé. Lève une erreur, en mots, si quoi que ce soit ne va pas : une plage hors de la grille, une classe
 * inconnue, des octets en trop ou en moins.
 */
export function lireFilm(octets: Uint8Array): Film {
  if (octets.length < 7 || MAGIE.some((o, i) => octets[i] !== o)) throw new Error("ce n'est pas un film du site");
  if (octets[4] !== FORMAT_FILM) throw new Error("version du film inconnue");
  const longueur = octets[5]! | (octets[6]! << 8);
  if (7 + longueur > octets.length) throw new Error("film coupé");
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder().decode(octets.subarray(7, 7 + longueur)));
  } catch {
    throw new Error("en-tête illisible");
  }
  const entete = lireEntete(brut);
  const n = entete.largeur * entete.hauteur;
  const debutTerrain = 7 + longueur;
  if (debutTerrain + n > octets.length) throw new Error("film coupé");
  const terrain = octets.slice(debutTerrain, debutTerrain + n);
  const donnees = octets.subarray(debutTerrain + n);
  const debuts = new Uint32Array(entete.images);
  let p = 0;
  const lire = () => {
    let v = 0;
    let echelle = 1;
    for (let k = 0; k < 5; k++) {
      if (p >= donnees.length) throw new Error("film coupé");
      const o = donnees[p++]!;
      v += (o & 0x7f) * echelle;
      if (o < 0x80) return v;
      echelle *= 128;
    }
    throw new Error("nombre trop long");
  };
  for (let k = 0; k < entete.images; k++) {
    debuts[k] = p;
    const plages = lire();
    if (plages > n) throw new Error("trop de plages");
    let fin = 0;
    for (let q = 0; q < plages; q++) {
      const debut = fin + lire();
      const longueurPlage = lire() + 1;
      if (p >= donnees.length) throw new Error("film coupé");
      const v = donnees[p++]!;
      if ((v & ~(CLASSE_MASQUE | RETOMBEES)) !== 0 || (v & CLASSE_MASQUE) >= NOMBRE_DE_CLASSES) throw new Error("classe inconnue");
      if (debut + longueurPlage > n) throw new Error("plage hors de la grille");
      fin = debut + longueurPlage;
    }
  }
  if (p !== donnees.length) throw new Error("octets en trop à la fin du film");
  return { entete, terrain, debuts, donnees };
}

/** Pose l'image `k` sur la grille, qui doit montrer l'image `k - 1` (ou être vide pour la première). */
export function appliquerImage(film: Film, k: number, grille: Uint8Array) {
  const d = film.donnees;
  let p = film.debuts[k]!;
  const lire = () => {
    let v = 0;
    let echelle = 1;
    for (;;) {
      const o = d[p++]!;
      v += (o & 0x7f) * echelle;
      if (o < 0x80) return v;
      echelle *= 128;
    }
  };
  const plages = lire();
  let fin = 0;
  for (let q = 0; q < plages; q++) {
    const debut = fin + lire();
    const longueur = lire() + 1;
    grille.fill(d[p++]!, debut, debut + longueur);
    fin = debut + longueur;
  }
}

/**
 * Les grilles de quelques images, gardées pour revenir en arrière sans tout relire : une toutes les `ecart` images. La grille
 * de l'image `k` se retrouve depuis la plus proche gardée avant elle.
 */
export class Bobine {
  private readonly gardees: Uint8Array[] = [];
  readonly grille: Uint8Array;
  /** L'image que montre `grille`. */
  image = -1;

  constructor(
    readonly film: Film,
    private readonly ecart = 24,
  ) {
    this.grille = new Uint8Array(film.entete.largeur * film.entete.hauteur);
    const g = new Uint8Array(this.grille.length);
    for (let k = 0; k < film.entete.images; k++) {
      appliquerImage(film, k, g);
      if (k % ecart === 0) this.gardees.push(g.slice());
    }
  }

  aller(k: number) {
    const cible = Math.max(0, Math.min(this.film.entete.images - 1, Math.floor(k)));
    if (cible === this.image) return;
    if (cible < this.image || cible - this.image > this.ecart) {
      const depart = Math.floor(cible / this.ecart);
      this.grille.set(this.gardees[depart]!);
      this.image = depart * this.ecart;
    }
    while (this.image < cible) appliquerImage(this.film, ++this.image, this.grille);
  }
}

/** Décompresse un fichier de film tel que le site le publie (gzip), avec ce que le navigateur sait faire. */
export async function decompresser(octets: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([octets as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/* ---------- Dessiner ---------- */

/**
 * Dessine les images d'un film, une case de la grille par pixel, comme la carte de fin des victoires (`dessinerCarteFinale` de
 * carte-dessin.ts) : le terrain du jeu, la mer de nuit, chaque territoire posé dessus, plus sombre et plein sur son bord, et
 * les retombées par-dessus. Les couleurs sont calculées une fois : chaque image ne coûte qu'un passage sur la grille.
 */
export class PeintreFilm {
  private readonly fond: Uint8ClampedArray;
  private readonly terre: Uint8Array;
  private readonly plein: Float32Array;
  private readonly bord: Uint8ClampedArray;

  constructor(private readonly film: Film) {
    const n = film.terrain.length;
    this.fond = new Uint8ClampedArray(n * 3);
    this.terre = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = couleurDeFond(film.terrain[i]!);
      this.fond[i * 3] = c[0];
      this.fond[i * 3 + 1] = c[1];
      this.fond[i * 3 + 2] = c[2];
      this.terre[i] = estTerre(film.terrain[i]!) ? 1 : 0;
    }
    this.plein = new Float32Array(NOMBRE_DE_CLASSES * 3);
    this.bord = new Uint8ClampedArray(NOMBRE_DE_CLASSES * 3);
    COULEURS_DES_CLASSES.forEach((c, k) => {
      if (!c) return;
      const s = sature(c);
      const b = couleurBord(c);
      for (let j = 0; j < 3; j++) {
        this.plein[k * 3 + j] = s[j]!;
        this.bord[k * 3 + j] = b[j]!;
      }
    });
  }

  /** Peint la grille dans `rgba`, quatre octets par case. */
  peindre(grille: Uint8Array, rgba: Uint8ClampedArray) {
    const { largeur, hauteur } = this.film.entete;
    const a = ALPHA_TERRITOIRE;
    const ar = ALPHA_RETOMBEES;
    const [rr, rg, rb] = COULEUR_RETOMBEES;
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const i = y * largeur + x;
        let r = this.fond[i * 3]!;
        let g = this.fond[i * 3 + 1]!;
        let b = this.fond[i * 3 + 2]!;
        if (this.terre[i]) {
          const v = grille[i]!;
          const c = v & CLASSE_MASQUE;
          if (c !== 0) {
            const autre = (j: number) => (grille[j]! & CLASSE_MASQUE) !== c;
            const surLeBord = x === 0 || y === 0 || x === largeur - 1 || y === hauteur - 1 || autre(i - 1) || autre(i + 1) || autre(i - largeur) || autre(i + largeur);
            if (surLeBord) {
              r = this.bord[c * 3]!;
              g = this.bord[c * 3 + 1]!;
              b = this.bord[c * 3 + 2]!;
            } else {
              r += (this.plein[c * 3]! - r) * a;
              g += (this.plein[c * 3 + 1]! - g) * a;
              b += (this.plein[c * 3 + 2]! - b) * a;
            }
          }
          if (v & RETOMBEES) {
            r += (rr - r) * ar;
            g += (rg - g) * ar;
            b += (rb - b) * ar;
          }
        }
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = 255;
      }
    }
  }
}

/** Des retombées nucléaires paraissent-elles dans le film ? La légende ne les montre que si oui. */
export function contientRetombees(film: Film): boolean {
  const d = film.donnees;
  let p = 0;
  const lire = () => {
    let v = 0;
    let echelle = 1;
    for (;;) {
      const o = d[p++]!;
      v += (o & 0x7f) * echelle;
      if (o < 0x80) return v;
      echelle *= 128;
    }
  };
  for (let k = 0; k < film.entete.images; k++) {
    const plages = lire();
    for (let q = 0; q < plages; q++) {
      lire();
      lire();
      if (d[p++]! & RETOMBEES) return true;
    }
  }
  return false;
}

/** Le moment de la partie montré par l'image `k`, en secondes depuis la première étape. */
export const secondesDeLImage = (entete: Pick<EnteteFilm, "pas" | "tours" | "images">, k: number) => Math.round((etapeDeLImage(entete, k) * MS_PAR_ETAPE) / 1000);

/** Un moment de la partie à l'écran : « 3:07 », « 1:02:45 ». */
export function horloge(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Le même moment, pour un lecteur d'écran : « 3 min 7 s », « 1 h 2 min 45 s ». */
export function dureeDite(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h > 0 ? `${h} h` : "", m > 0 || h > 0 ? `${m} min` : "", `${s % 60} s`].filter(Boolean).join(" ");
}
