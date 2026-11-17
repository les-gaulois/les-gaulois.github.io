/**
 * Les images fixes des finitions de carte, dessinées d'avance par `scripts/atelier-cartes.ts` dans
 * `src/lib/village/cartes-vignettes/` : une par finition du rayon « Cartes » (`cartes.ts`), 48 × 80, une case par pixel.
 * Elles servent là où il n'y a pas de navigateur : l'annonce des achats sur Discord (`src/lib/achats-discord.ts`), qui
 * dessine en cases de couleur. Lues une fois chacune, depuis le dépôt ; une image absente ou illisible : `null`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import type { Vignette } from "../gaulois";
import { finitionParId } from "./cartes";

export const DOSSIER_DES_VIGNETTES = join("src", "lib", "village", "cartes-vignettes");
export const VIGNETTE_LARGEUR = 48;
export const VIGNETTE_HAUTEUR = 80;

const hex = (n: number): string => n.toString(16).padStart(2, "0");

/**
 * Lit un PNG simple, tel que le navigateur l'écrit : 8 bits par couleur, avec ou sans transparence, sans entrelacement.
 * Rend ses cases, `#rrggbb` ou `null` pour un pixel transparent. `null` pour tout autre PNG : ce lecteur ne fait que cela.
 */
export function lireLePng(octets: Uint8Array): Vignette | null {
  const vue = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  if (vue.length < 33 || vue.readUInt32BE(0) !== 0x89504e47 || vue.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let largeur = 0;
  let hauteur = 0;
  let canaux = 0;
  const morceaux: Buffer[] = [];
  for (let i = 8; i + 12 <= vue.length; ) {
    const taille = vue.readUInt32BE(i);
    const nom = vue.toString("latin1", i + 4, i + 8);
    const debut = i + 8;
    if (debut + taille + 4 > vue.length) return null;
    if (nom === "IHDR") {
      largeur = vue.readUInt32BE(debut);
      hauteur = vue.readUInt32BE(debut + 4);
      const [profondeur, genre, , , entrelace] = [vue[debut + 8], vue[debut + 9], vue[debut + 10], vue[debut + 11], vue[debut + 12]];
      canaux = genre === 6 ? 4 : genre === 2 ? 3 : 0;
      if (profondeur !== 8 || canaux === 0 || entrelace !== 0) return null;
    } else if (nom === "IDAT") morceaux.push(vue.subarray(debut, debut + taille));
    else if (nom === "IEND") break;
    i = debut + taille + 4;
  }
  if (largeur < 1 || hauteur < 1 || largeur > 512 || hauteur > 512 || morceaux.length === 0) return null;
  let brut: Buffer;
  try {
    brut = inflateSync(Buffer.concat(morceaux));
  } catch {
    return null;
  }
  const pas = largeur * canaux;
  if (brut.length !== (pas + 1) * hauteur) return null;
  const image = Buffer.alloc(pas * hauteur);
  // Chaque rangée est écrite par différence avec sa voisine : les cinq filtres du format.
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (pas + 1)] ?? 0;
    for (let x = 0; x < pas; x++) {
      const valeur = brut[y * (pas + 1) + 1 + x] ?? 0;
      const gauche = x >= canaux ? (image[y * pas + x - canaux] ?? 0) : 0;
      const haut = y > 0 ? (image[(y - 1) * pas + x] ?? 0) : 0;
      const coin = y > 0 && x >= canaux ? (image[(y - 1) * pas + x - canaux] ?? 0) : 0;
      let ajout = 0;
      if (filtre === 1) ajout = gauche;
      else if (filtre === 2) ajout = haut;
      else if (filtre === 3) ajout = (gauche + haut) >> 1;
      else if (filtre === 4) {
        const p = gauche + haut - coin;
        const [dg, dh, dc] = [Math.abs(p - gauche), Math.abs(p - haut), Math.abs(p - coin)];
        ajout = dg <= dh && dg <= dc ? gauche : dh <= dc ? haut : coin;
      } else if (filtre !== 0) return null;
      image[y * pas + x] = (valeur + ajout) & 255;
    }
  }
  const cases: (string | null)[] = [];
  for (let i = 0; i < largeur * hauteur; i++) {
    const o = i * canaux;
    const opaque = canaux === 3 || (image[o + 3] ?? 0) >= 128;
    cases.push(opaque ? `#${hex(image[o] ?? 0)}${hex(image[o + 1] ?? 0)}${hex(image[o + 2] ?? 0)}` : null);
  }
  return { largeur, hauteur, cases };
}

const lues = new Map<string, Vignette | null>();

/** L'image fixe d'une finition du rayon, ou `null` : finition inconnue, image absente, ou d'une autre taille que prévu. */
export function vignetteDeLaCarte(id: string, dossier: string = DOSSIER_DES_VIGNETTES): Vignette | null {
  const finition = finitionParId(id);
  if (!finition) return null;
  const cle = `${dossier}/${finition.id}`;
  if (lues.has(cle)) return lues.get(cle) ?? null;
  let vignette: Vignette | null = null;
  try {
    vignette = lireLePng(readFileSync(join(dossier, `${finition.id}.png`)));
  } catch {
    vignette = null;
  }
  if (vignette && (vignette.largeur !== VIGNETTE_LARGEUR || vignette.hauteur !== VIGNETTE_HAUTEUR)) vignette = null;
  lues.set(cle, vignette);
  return vignette;
}
