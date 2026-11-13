/**
 * Les billets de la tombola des concours (13 novembre 2026, choix du pilote parmi trois maquettes) : chaque participant
 * reçoit un billet numéroté, et au tirage le billet gagnant s'affiche devant tout le monde. Le site dessine le fond de
 * chaque billet (src/lib/tombola-image.ts, publié sous /tombola/), avec les mesures de `BILLET` ; la fonction code-discord
 * y pose le numéro, en onciale de cases, quand Discord demande l'image (concours.ts, `concoursImage`).
 *
 * Calcul pur et sans bibliothèque : la fonction tourne dans Deno, où l'outil d'images du site (sharp) ne va pas. Lire un
 * PNG, y poser des cases blanches, écrire un PNG : la compression passe par `DecompressionStream` et `CompressionStream`,
 * que Deno et Node connaissent tous deux.
 *
 * Licence : les dessins des chiffres (`CHIFFRES_CASES`) sont copiés, le 13 novembre 2026, de src/lib/police/onciale.ts, et
 * sont comme eux sous SIL Open Font License 1.1 (https://openfontlicense.org ; texte complet dans src/lib/police/OFL.txt,
 * voir NOTICE.md) ; un test les garde identiques. Leurs formes viennent de la police Uncial Antiqua, passée sur une grille
 * de cases puis redessinée à la main le 12 novembre 2026 :
 * Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com), with Reserved Font Names
 * "Uncial Antiqua". Modifiée par le clan [GAL] : grille de cases, minuscules, chiffres alignés, accents, signes. Ce nom
 * réservé ne s'emploie pas pour cette version. Le reste du fichier est sous l'AGPL du site.
 */

/** Les mesures d'un billet, communes au fond que dessine le site et au numéro que pose la fonction. */
export const BILLET = {
  largeur: 1200,
  hauteur: 330,
  /** Le billet, posé sur la table des cartes. */
  carte: { x: 36, y: 40, largeur: 1128, hauteur: 250 },
  /** Le talon, à droite de la perforation : « N° » en haut, le numéro dessous. */
  talon: { x: 864, largeur: 300 },
  /** La zone du numéro : son milieu, son haut, son bas et sa plus grande largeur. */
  numero: { centre: 1014, haut: 150, bas: 252, largeurMax: 252 },
} as const;

/** Le plus grand numéro qui se dessine : quatre chiffres. Au-delà, le billet se dit en texte seulement. */
export const BILLET_MAX = 9999;

/** Un numéro de billet tel qu'il s'écrit partout : trois chiffres au moins, « 017 ». */
export const numeroBillet = (n: number): string => String(n).padStart(3, "0");

/**
 * Les chiffres de l'onciale de cases, rangée par rangée de haut en bas (« # » : une case pleine) : sept cases de large, dix
 * de haut, posés sur la ligne de base. Copiés de `CHIFFRES` (src/lib/police/onciale.ts), sous SIL Open Font License 1.1.
 */
export const CHIFFRES_CASES: Readonly<Record<string, readonly string[]>> = {
  "0": [".#####.", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."],
  "1": ["...##..", ".####..", "##.##..", "...##..", "...##..", "...##..", "...##..", "...##..", "...##..", ".######"],
  "2": [".#####.", "##...##", ".....##", ".....##", "....##.", "...##..", "..##...", ".##....", "##.....", "#######"],
  "3": [".#####.", "##...##", ".....##", ".....##", "..####.", ".....##", ".....##", ".....##", "##...##", ".#####."],
  "4": ["....##.", "...###.", "..####.", ".##.##.", "##..##.", "##..##.", "#######", "....##.", "....##.", "....##."],
  "5": ["#######", "##.....", "##.....", "######.", ".....##", ".....##", ".....##", ".....##", "##...##", ".#####."],
  "6": ["..####.", ".##....", "##.....", "##.....", "######.", "##...##", "##...##", "##...##", "##...##", ".#####."],
  "7": ["#######", ".....##", ".....##", "....##.", "....##.", "...##..", "...##..", "..##...", "..##...", "..##..."],
  "8": [".#####.", "##...##", "##...##", "##...##", ".#####.", "##...##", "##...##", "##...##", "##...##", ".#####."],
  "9": [".#####.", "##...##", "##...##", "##...##", "##...##", ".######", ".....##", ".....##", "....##.", ".####.."],
};
/** Un chiffre fait sept cases de large ; une case vide le sépare du suivant, comme dans la police du site. */
const LARGEUR_CHIFFRE = 7;
const PAS_CHIFFRE = 8;
const HAUTEUR_CHIFFRE = 10;
/** Le joint entre deux cases, comme la police en cases du site : 6 unités de chaque côté d'une case de 70. */
const JOINT = 6 / 70;
/** La plus grande case, en pixels : trois chiffres font alors 230 pixels de large. */
const CASE_MAX = 10;

/** Une image en mémoire : quatre octets par pixel (rouge, vert, bleu, opacité), rangée par rangée. */
export interface Image {
  largeur: number;
  hauteur: number;
  rgba: Uint8Array<ArrayBuffer>;
}

/** Le plus grand fond accepté : un billet en fait 396 000. */
const PIXELS_MAX = 4_000_000;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function transformer(donnees: Uint8Array<ArrayBuffer>, flux: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const sortie = new Blob([donnees]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Lit un PNG en couleurs sur huit bits (avec ou sans opacité), non entrelacé : ce que produit l'outil d'images du site.
 * `null` pour tout autre PNG, ou un fichier abîmé.
 */
export async function lirePng(octets: Uint8Array): Promise<Image | null> {
  if (octets.length < 8 || SIGNATURE.some((b, i) => octets[i] !== b)) return null;
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let largeur = 0;
  let hauteur = 0;
  let canaux = 0;
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (let pos = 8; pos + 12 <= octets.length; ) {
    const longueur = vue.getUint32(pos);
    const nom = String.fromCharCode(...octets.subarray(pos + 4, pos + 8));
    const debut = pos + 8;
    if (debut + longueur + 4 > octets.length) return null;
    if (nom === "IHDR") {
      if (longueur !== 13) return null;
      largeur = vue.getUint32(debut);
      hauteur = vue.getUint32(debut + 4);
      const type = octets[debut + 9];
      // Huit bits, en couleurs (2) ou en couleurs avec opacité (6), compression et filtres ordinaires, non entrelacé.
      if (octets[debut + 8] !== 8 || (type !== 2 && type !== 6) || octets[debut + 10] !== 0 || octets[debut + 11] !== 0 || octets[debut + 12] !== 0) return null;
      canaux = type === 6 ? 4 : 3;
    } else if (nom === "IDAT") {
      morceaux.push(octets.subarray(debut, debut + longueur));
      total += longueur;
    } else if (nom === "IEND") {
      break;
    }
    pos = debut + longueur + 4;
  }
  if (canaux === 0 || largeur < 1 || hauteur < 1 || largeur * hauteur > PIXELS_MAX || morceaux.length === 0) return null;
  const compresse = new Uint8Array(total);
  let at = 0;
  for (const m of morceaux) {
    compresse.set(m, at);
    at += m.length;
  }
  let brut: Uint8Array;
  try {
    brut = await transformer(compresse, new DecompressionStream("deflate"));
  } catch {
    return null;
  }
  const ligne = largeur * canaux;
  if (brut.length < hauteur * (ligne + 1)) return null;
  const pixels = new Uint8Array(hauteur * ligne);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    const dst = y * ligne;
    for (let i = 0; i < ligne; i++) {
      const x = brut[src + i] ?? 0;
      const a = i >= canaux ? (pixels[dst + i - canaux] ?? 0) : 0;
      const b = y > 0 ? (pixels[dst - ligne + i] ?? 0) : 0;
      const c = y > 0 && i >= canaux ? (pixels[dst - ligne + i - canaux] ?? 0) : 0;
      let v: number;
      if (filtre === 0) v = x;
      else if (filtre === 1) v = x + a;
      else if (filtre === 2) v = x + b;
      else if (filtre === 3) v = x + ((a + b) >> 1);
      else if (filtre === 4) v = x + paeth(a, b, c);
      else return null;
      pixels[dst + i] = v & 255;
    }
  }
  if (canaux === 4) return { largeur, hauteur, rgba: pixels };
  const rgba = new Uint8Array(largeur * hauteur * 4);
  for (let p = 0, q = 0; p < pixels.length; p += 3, q += 4) {
    rgba[q] = pixels[p] ?? 0;
    rgba[q + 1] = pixels[p + 1] ?? 0;
    rgba[q + 2] = pixels[p + 2] ?? 0;
    rgba[q + 3] = 255;
  }
  return { largeur, hauteur, rgba };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = (CRC_TABLE[(c ^ o) & 255] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(nom: string, donnees: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + donnees.length);
  const vue = new DataView(out.buffer);
  vue.setUint32(0, donnees.length);
  for (let i = 0; i < 4; i++) out[4 + i] = nom.charCodeAt(i);
  out.set(donnees, 8);
  vue.setUint32(8 + donnees.length, crc32(out.subarray(4, 8 + donnees.length)));
  return out;
}

/**
 * Écrit l'image en PNG, sans opacité (le billet est opaque) : chaque rangée prend le filtre qui la rend la plus facile à
 * compresser, comme le font les outils d'images ordinaires.
 */
export async function ecrirePng(image: Image): Promise<Uint8Array<ArrayBuffer>> {
  const { largeur, hauteur, rgba } = image;
  const ligne = largeur * 3;
  const brut = new Uint8Array(hauteur * (ligne + 1));
  let precedente = new Uint8Array(ligne);
  let courante = new Uint8Array(ligne);
  const essais = [0, 1, 2, 3, 4].map(() => new Uint8Array(ligne));
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0, p = y * largeur * 4, q = 0; x < largeur; x++, p += 4, q += 3) {
      courante[q] = rgba[p] ?? 0;
      courante[q + 1] = rgba[p + 1] ?? 0;
      courante[q + 2] = rgba[p + 2] ?? 0;
    }
    let meilleur = 0;
    let plusPetit = Infinity;
    essais.forEach((essai, filtre) => {
      let somme = 0;
      for (let i = 0; i < ligne; i++) {
        const x = courante[i] ?? 0;
        const a = i >= 3 ? (courante[i - 3] ?? 0) : 0;
        const b = y > 0 ? (precedente[i] ?? 0) : 0;
        const c = y > 0 && i >= 3 ? (precedente[i - 3] ?? 0) : 0;
        const predit = filtre === 0 ? 0 : filtre === 1 ? a : filtre === 2 ? b : filtre === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (x - predit) & 255;
        essai[i] = v;
        somme += v < 128 ? v : 256 - v;
      }
      if (somme < plusPetit) {
        plusPetit = somme;
        meilleur = filtre;
      }
    });
    brut[y * (ligne + 1)] = meilleur;
    brut.set(essais[meilleur] ?? courante, y * (ligne + 1) + 1);
    [precedente, courante] = [courante, precedente];
  }
  const entete = new Uint8Array(13);
  const vue = new DataView(entete.buffer);
  vue.setUint32(0, largeur);
  vue.setUint32(4, hauteur);
  entete[8] = 8;
  entete[9] = 2;
  const donnees = await transformer(brut, new CompressionStream("deflate"));
  const parties = [new Uint8Array(SIGNATURE), morceau("IHDR", entete), morceau("IDAT", donnees), morceau("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parties.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parties) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Remplit un rectangle de pixels entiers, coupé aux bords de l'image. */
function remplir(image: Image, x: number, y: number, largeur: number, hauteur: number, [r, g, b]: readonly [number, number, number]): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.largeur, x + largeur);
  const y1 = Math.min(image.hauteur, y + hauteur);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0, p = (yy * image.largeur + x0) * 4; xx < x1; xx++, p += 4) {
      image.rgba[p] = r;
      image.rgba[p + 1] = g;
      image.rgba[p + 2] = b;
      image.rgba[p + 3] = 255;
    }
  }
}

/** La taille d'une case pour ce numéro : la plus grande qui tient dans la zone du numéro, en pixels entiers. */
export function caseDuNumero(n: number): number {
  const chiffres = numeroBillet(n).length;
  const largeur = PAS_CHIFFRE * chiffres - 1;
  return Math.min(CASE_MAX, Math.floor(BILLET.numero.largeurMax / largeur), Math.floor((BILLET.numero.bas - BILLET.numero.haut) / HAUTEUR_CHIFFRE));
}

/**
 * Pose le numéro du billet, en blanc, dans la zone du numéro de `BILLET` : chaque case pleine d'un chiffre devient un carré
 * séparé de ses voisins par le joint de la police, sur des pixels entiers (des bords nets). `false` si le numéro n'est pas
 * un entier de 1 à `BILLET_MAX`, ou si l'image n'a pas la taille d'un billet.
 */
export function poserNumero(image: Image, n: number): boolean {
  if (!Number.isInteger(n) || n < 1 || n > BILLET_MAX || image.largeur !== BILLET.largeur || image.hauteur !== BILLET.hauteur) return false;
  const texte = numeroBillet(n);
  const taille = caseDuNumero(n);
  const joint = Math.max(1, Math.round(taille * JOINT));
  const largeur = (PAS_CHIFFRE * texte.length - 1) * taille;
  const gauche = Math.round(BILLET.numero.centre - largeur / 2);
  const haut = Math.round(BILLET.numero.haut + (BILLET.numero.bas - BILLET.numero.haut - HAUTEUR_CHIFFRE * taille) / 2);
  [...texte].forEach((chiffre, k) => {
    const rangees = CHIFFRES_CASES[chiffre] ?? [];
    rangees.forEach((rangee, r) => {
      for (let col = 0; col < LARGEUR_CHIFFRE; col++) {
        if (rangee[col] !== "#") continue;
        const x = gauche + (k * PAS_CHIFFRE + col) * taille + joint;
        const y = haut + r * taille + joint;
        remplir(image, x, y, taille - 2 * joint, taille - 2 * joint, [255, 255, 255]);
      }
    });
  });
  return true;
}

/** Le billet numéroté : une copie du fond, le numéro posé dessus, en PNG. `null` si le numéro ne se dessine pas. */
export async function billetPng(fond: Image, n: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const image: Image = { largeur: fond.largeur, hauteur: fond.hauteur, rgba: fond.rgba.slice() };
  return poserNumero(image, n) ? ecrirePng(image) : null;
}
