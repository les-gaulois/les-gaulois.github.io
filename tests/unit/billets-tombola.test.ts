import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CHIFFRES } from "../../src/lib/police/onciale";
import { TOMBOLA_ALT, TOMBOLA_IMAGES, renderTombolaImage } from "../../src/lib/tombola-image";
import { BILLET, BILLET_MAX, CHIFFRES_CASES, billetPng, caseDuNumero, ecrirePng, lirePng, numeroBillet, poserNumero, type Image } from "../../supabase/functions/code-discord/billets";
import { BANNIERE_ALT } from "../../supabase/functions/code-discord/concours";

/** Une image unie de la taille d'un billet. */
const unie = (r: number, g: number, b: number, largeur: number = BILLET.largeur, hauteur: number = BILLET.hauteur): Image => {
  const rgba = new Uint8Array(largeur * hauteur * 4);
  for (let p = 0; p < rgba.length; p += 4) rgba.set([r, g, b, 255], p);
  return { largeur, hauteur, rgba };
};
/** Le cadre des pixels blancs d'une image, ou `null`. */
function cadreBlanc(image: Image): { x0: number; y0: number; x1: number; y1: number } | null {
  let cadre: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (let y = 0; y < image.hauteur; y++) {
    for (let x = 0; x < image.largeur; x++) {
      const p = (y * image.largeur + x) * 4;
      if (image.rgba[p] === 255 && image.rgba[p + 1] === 255 && image.rgba[p + 2] === 255) {
        cadre = cadre ? { x0: Math.min(cadre.x0, x), y0: Math.min(cadre.y0, y), x1: Math.max(cadre.x1, x), y1: Math.max(cadre.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
      }
    }
  }
  return cadre;
}
/** Un PNG de sharp, avec ou sans opacité, ses filtres choisis rangée par rangée : de quoi essayer les cinq filtres. */
async function pngDeSharp(canaux: 3 | 4): Promise<{ png: Uint8Array; pixels: Buffer }> {
  const largeur = 61;
  const hauteur = 37;
  const pixels = Buffer.alloc(largeur * hauteur * canaux);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + Math.floor(i / 7) * 11 + ((i * i) % 13)) & 255;
  const png = await sharp(pixels, { raw: { width: largeur, height: hauteur, channels: canaux } })
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer();
  return { png: new Uint8Array(png), pixels };
}

describe("les chiffres des billets", () => {
  it("sont ceux de l'onciale de cases du site, case pour case", () => {
    expect(Object.keys(CHIFFRES_CASES)).toEqual(Object.keys(CHIFFRES));
    for (const [chiffre, dessin] of Object.entries(CHIFFRES)) {
      expect(CHIFFRES_CASES[chiffre], chiffre).toEqual(dessin.rangees);
      // Posés sur la ligne de base : la dernière rangée est la rangée 0, la première la rangée 9.
      expect(dessin.haut, chiffre).toBe(9);
      expect(dessin.rangees.every((r) => r.length === 7)).toBe(true);
    }
  });

  it("s'écrivent sur trois chiffres au moins, et tiennent dans le talon jusqu'à 9 999", () => {
    expect(numeroBillet(7)).toBe("007");
    expect(numeroBillet(17)).toBe("017");
    expect(numeroBillet(1234)).toBe("1234");
    expect(BILLET_MAX).toBe(9999);
    expect(caseDuNumero(17)).toBe(10);
    expect(caseDuNumero(1234)).toBe(8);
    for (const n of [1, 17, 999, 1000, 9999]) {
      const taille = caseDuNumero(n);
      expect((8 * numeroBillet(n).length - 1) * taille).toBeLessThanOrEqual(BILLET.numero.largeurMax);
      expect(10 * taille).toBeLessThanOrEqual(BILLET.numero.bas - BILLET.numero.haut);
    }
  });

  it("se posent en blanc au milieu de la zone du numéro, en cases séparées, et nulle part ailleurs", () => {
    const image = unie(10, 20, 51);
    expect(poserNumero(image, 17)).toBe(true);
    const cadre = cadreBlanc(image);
    expect(cadre).not.toBeNull();
    if (!cadre) return;
    expect(cadre.y0).toBeGreaterThanOrEqual(BILLET.numero.haut);
    expect(cadre.y1).toBeLessThan(BILLET.numero.bas);
    expect(Math.abs((cadre.x0 + cadre.x1 + 1) / 2 - BILLET.numero.centre)).toBeLessThanOrEqual(1);
    // Trois chiffres de sept cases et deux cases vides entre eux : 23 cases de 10 pixels, moins un joint à chaque bout.
    expect(cadre.x1 - cadre.x0 + 1).toBe(230 - 2);
    // Entre deux cases pleines voisines (la barre du haut du 7), un joint de deux pixels.
    const y = cadre.y0 + 4;
    const rangee = Array.from({ length: cadre.x1 - cadre.x0 + 1 }, (_, i) => image.rgba[(y * image.largeur + cadre.x0 + i) * 4]);
    expect(rangee.join(",")).toContain("255,10,10,255");
  });

  it("refusent un numéro hors de 1 à 9 999, ou une image qui n'a pas la taille d'un billet", () => {
    for (const n of [0, -1, 1.5, 10_000, Number.NaN]) expect(poserNumero(unie(0, 0, 0), n), String(n)).toBe(false);
    expect(poserNumero(unie(0, 0, 0, 100, 100), 17)).toBe(false);
  });
});

describe("la lecture et l'écriture des PNG, sans bibliothèque", () => {
  it("relit les PNG de sharp, avec ou sans opacité, quels que soient les filtres des rangées", async () => {
    for (const canaux of [3, 4] as const) {
      const { png, pixels } = await pngDeSharp(canaux);
      const image = await lirePng(png);
      expect(image, `${canaux} canaux`).not.toBeNull();
      if (!image) continue;
      expect([image.largeur, image.hauteur]).toEqual([61, 37]);
      for (let p = 0, q = 0; q < pixels.length; p += 4, q += canaux) {
        expect([image.rgba[p], image.rgba[p + 1], image.rgba[p + 2], image.rgba[p + 3]]).toEqual([pixels[q], pixels[q + 1], pixels[q + 2], canaux === 4 ? pixels[q + 3] : 255]);
      }
    }
  });

  it("écrit un PNG que sharp relit à l'identique", async () => {
    const { png } = await pngDeSharp(4);
    const image = await lirePng(png);
    if (!image) throw new Error("illisible");
    const ecrit = await ecrirePng(image);
    const relu = await sharp(Buffer.from(ecrit)).raw().toBuffer({ resolveWithObject: true });
    expect([relu.info.width, relu.info.height, relu.info.channels]).toEqual([61, 37, 3]);
    for (let p = 0, q = 0; q < relu.data.length; p += 4, q += 3) {
      expect([relu.data[q], relu.data[q + 1], relu.data[q + 2]]).toEqual([image.rgba[p], image.rgba[p + 1], image.rgba[p + 2]]);
    }
    // Et la lecture de la fonction relit son écriture, pixel pour pixel.
    const encore = await lirePng(ecrit);
    expect(encore?.largeur).toBe(61);
    for (let p = 0; p < image.rgba.length; p += 4) {
      expect([encore?.rgba[p], encore?.rgba[p + 1], encore?.rgba[p + 2], encore?.rgba[p + 3]]).toEqual([image.rgba[p], image.rgba[p + 1], image.rgba[p + 2], 255]);
    }
  });

  it("relit un billet dont les rangées emploient au moins quatre filtres, comme sharp le lit", async () => {
    const fond = await lirePng(new Uint8Array(await renderTombolaImage("billet")));
    if (!fond) throw new Error("fond illisible");
    const png = await billetPng(fond, 42);
    if (!png) throw new Error("billet non dessiné");
    // Les filtres des rangées, lus dans les données décompressées : le billet les emploie tous.
    const vue = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const morceaux: Uint8Array[] = [];
    for (let pos = 8; pos < png.length; ) {
      const longueur = vue.getUint32(pos);
      if (String.fromCharCode(...png.subarray(pos + 4, pos + 8)) === "IDAT") morceaux.push(png.subarray(pos + 8, pos + 8 + longueur));
      pos += 12 + longueur;
    }
    const brut = inflateSync(Buffer.concat(morceaux));
    const ligne = BILLET.largeur * 3 + 1;
    const filtres = new Set(Array.from({ length: BILLET.hauteur }, (_, y) => brut[y * ligne]));
    expect([...filtres].sort()).toEqual([0, 1, 2, 3, 4].filter((f) => filtres.has(f)));
    expect(filtres.size).toBeGreaterThanOrEqual(4);
    for (const f of [1, 2, 4]) expect(filtres.has(f), `filtre ${f}`).toBe(true);
    const relu = await lirePng(png);
    const parSharp = await sharp(Buffer.from(png)).raw().toBuffer();
    let differents = 0;
    for (let p = 0, q = 0; q < parSharp.length; p += 4, q += 3) {
      if (relu?.rgba[p] !== parSharp[q] || relu?.rgba[p + 1] !== parSharp[q + 1] || relu?.rgba[p + 2] !== parSharp[q + 2]) differents++;
    }
    expect(differents).toBe(0);
  });

  it("refuse un fichier qui n'est pas un PNG qu'elle sait lire", async () => {
    const pixels = Buffer.alloc(8 * 8 * 3, 90);
    const palette = await sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).png({ palette: true }).toBuffer();
    const entrelace = await sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).png({ progressive: true }).toBuffer();
    const seize = await sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).toColourspace("rgb16").png().toBuffer();
    const { png } = await pngDeSharp(3);
    for (const [nom, octets] of [
      ["rien", new Uint8Array(0)],
      ["texte", new TextEncoder().encode("pas une image")],
      ["palette", new Uint8Array(palette)],
      ["entrelacé", new Uint8Array(entrelace)],
      ["16 bits", new Uint8Array(seize)],
      ["coupé", png.slice(0, png.length - 40)],
      ["sans données", png.slice(0, 33)],
    ] as const) {
      expect(await lirePng(octets), nom).toBeNull();
    }
  });
});

describe("les images de la tombola, publiées par le site", () => {
  it("ont la taille d'un billet, sans palette, et la zone du numéro des fonds est vide", async () => {
    for (const nom of TOMBOLA_IMAGES) {
      const png = await renderTombolaImage(nom);
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height, meta.isPalette ?? false], nom).toEqual([BILLET.largeur, BILLET.hauteur, false]);
      const image = await lirePng(new Uint8Array(png));
      expect(image, nom).not.toBeNull();
      if (!image || nom === "banniere") continue;
      // Une seule couleur dans toute la zone du numéro : le numéro posé par la fonction n'y chevauche rien.
      const couleurs = new Set<string>();
      for (let y = BILLET.numero.haut; y < BILLET.numero.bas; y++) {
        for (let x = BILLET.numero.centre - BILLET.numero.largeurMax / 2; x < BILLET.numero.centre + BILLET.numero.largeurMax / 2; x++) {
          const p = (y * image.largeur + x) * 4;
          couleurs.add(`${image.rgba[p]},${image.rgba[p + 1]},${image.rgba[p + 2]}`);
        }
      }
      expect([...couleurs], nom).toHaveLength(1);
    }
  });

  it("un billet numéroté se dessine sur le fond du site, vite, en PNG que sharp relit", async () => {
    const fond = await lirePng(new Uint8Array(await renderTombolaImage("gagnant")));
    if (!fond) throw new Error("fond illisible");
    const avant = fond.rgba.slice();
    const t0 = performance.now();
    const png = await billetPng(fond, 42);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(png).not.toBeNull();
    // Le fond gardé n'est pas touché : il sert au billet suivant.
    expect(fond.rgba).toEqual(avant);
    const meta = await sharp(Buffer.from(png ?? new Uint8Array(0))).metadata();
    expect([meta.width, meta.height]).toEqual([BILLET.largeur, BILLET.hauteur]);
    expect(await billetPng(fond, 0)).toBeNull();
  });

  it("disent ce qu'elles montrent, comme le message du concours", () => {
    expect(TOMBOLA_ALT.banniere).toBe(BANNIERE_ALT);
    for (const nom of TOMBOLA_IMAGES) expect(TOMBOLA_ALT[nom].length).toBeGreaterThan(10);
  });
});
