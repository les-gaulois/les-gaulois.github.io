/**
 * L'image d'un bâtiment fini du village des Gaulois, pour le salon des nouvelles (`chantier-discord.ts`) : le nom du bâtiment,
 * ce qu'il a coûté en points rapportés au clan, le jour où son chantier s'est terminé et le prochain chantier, à gauche ; le
 * bâtiment lui-même, en pixels, debout sur son ombre à droite, comme le Gaulois d'une fiche (`fiche-image.ts`). Même dessin
 * que les autres images du robot (`gazette-image.ts`, « Les images du robot » de docs/DESIGN.md).
 *
 * Le bâtiment vient de `dessinDuBatiment(id, PLEIN_JOUR, 1)` (`village/batiments/`), en plein jour pour qu'il se lise sur
 * l'encre du fond. C'est du pixel art : chaque case devient un carré d'un nombre entier de pixels, le plus grand qui tienne
 * dans sa colonne, sans lissage. Les dessins font de 46 à 170 cases de haut et de 64 à 240 de large : une tour haute et
 * étroite y prend 3 pixels par case, une palissade très large 2.
 *
 * 1 200 × 660 : 1,82 fois plus large que haut, au-dessus des 1,55 qu'il faut pour que Discord la montre en grand (550 pixels
 * de large).
 */
import sharp, { type OverlayOptions } from "sharp";
import { annonceEnMots, dateLongue, heureEnMots, pointsEnMots, type AnnonceDuChantier } from "./chantier-discord";
import { fmtInt } from "./format";
import { CARD_COLORS as C, kpiParts, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Measure } from "./gazette-image";
import { shownAddress } from "./salon-discord";
import { BATIMENTS } from "./village/chantier-liste";
import { pointsQuiRestent } from "./village/chantier";
import type { Decor } from "./village/decor";

const WIDTH = 1200;
const HEIGHT = 660;
/** La colonne du bâtiment, à droite : sa largeur, l'écart avec les chiffres, et le sol où il se pose. */
export const BATIMENT = { column: 480, gap: 32, ground: HEIGHT - 76, top: LOGO.y, maxScale: 8 } as const;
/** Son ombre au sol, comme celle du Gaulois d'une fiche : plus sombre que l'encre du fond. */
const OMBRE = "#02050F";

/** « 14 nov. », à Paris. */
const jourCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/** Le dessin posé sur l'image : ses cases, le coin haut gauche en pixels, le côté d'une case. */
export interface DessinPose {
  decor: Decor;
  x: number;
  y: number;
  echelle: number;
}

export interface ChantierCard extends GazetteCard {
  dessin: DessinPose | null;
}

/**
 * Où poser le bâtiment dans sa colonne : la plus grande taille de case entière qui y tienne, centré, la dernière rangée sur le
 * sol. `null` : un dessin vide.
 */
export function placeDuBatiment(decor: Decor, colonne = BATIMENT): DessinPose | null {
  if (decor.largeur < 1 || decor.hauteur < 1) return null;
  const echelle = Math.max(1, Math.min(colonne.maxScale, Math.floor(colonne.column / decor.largeur), Math.floor((colonne.ground - colonne.top) / decor.hauteur)));
  const left = WIDTH - MARGIN - colonne.column;
  return { decor, echelle, x: Math.round(left + (colonne.column - decor.largeur * echelle) / 2), y: colonne.ground - decor.hauteur * echelle };
}

/** Quoi écrire et où, à partir de l'annonce et du dessin du bâtiment : se teste sans police. */
export function chantierCard(annonce: AnnonceDuChantier, decor: Decor | null, siteUrl: string, measure: Measure): ChantierCard {
  const { batiment, prochain, releve } = annonce;
  const dessin = decor ? placeDuBatiment(decor) : null;
  const right = BATIMENT.column + BATIMENT.gap;
  const head = pageHead({ path: "/village", title: batiment.titre, kicker: "Chantier terminé au village des Gaulois", period: `Au relevé du ${dateLongue(releve)}, ${heureEnMots(releve)}` }, measure, right);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const width = WIDTH - 2 * MARGIN - right;

  if (dessin) {
    const shadow = { width: Math.min(BATIMENT.column, dessin.decor.largeur * dessin.echelle + 40), height: 14 };
    rects.push({ x: WIDTH - MARGIN - BATIMENT.column / 2 - shadow.width / 2, y: BATIMENT.ground - 7, ...shadow, radius: shadow.height / 2, color: OMBRE });
  }

  // Ce qui est compté et le jour du chantier fini, côte à côte.
  const done = kpiParts(
    [
      { label: "Points rapportés au clan", value: fmtInt(batiment.cout), hint: { text: "posés sur ce chantier" } },
      { label: "Chantier terminé", value: jourCourt.format(new Date(batiment.fini_le)), hint: { text: `par une partie de ${heureEnMots(batiment.fini_le)}` } },
    ],
    { x: MARGIN, y: head.bottom + 4, width, valueSize: 72, minValueSize: 36 },
    measure,
  );
  rects.push(...done.rects);
  texts.push(...done.texts);

  // Le prochain chantier, ou le village fini.
  const next = kpiParts(
    [
      prochain
        ? { label: "Prochain chantier", value: prochain.titre, hint: { text: `encore ${pointsEnMots(pointsQuiRestent(prochain))} rapportés au clan`, color: C.BLUE_TEXT, strong: true } }
        : { label: "Le village", value: "Tout est bâti", hint: { text: `les ${BATIMENTS.length} chantiers sont finis`, color: C.BLUE_TEXT, strong: true } },
    ],
    { x: MARGIN, y: done.bottom + 30, width, valueSize: 60, minValueSize: 32 },
    measure,
  );
  rects.push(...next.rects);
  texts.push(...next.texts);

  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), "Le score positif des parties du clan : une défaite ne retire rien.", HEIGHT - 24, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, dessin };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export const chantierImageAlt = (annonce: AnnonceDuChantier): string => annonceEnMots(annonce).join(" ").slice(0, 1024);

/** Les pixels du bâtiment : rouge, vert, bleu, opacité, chaque case un carré plein, sans lissage. */
export function pixelsDuDessin({ decor, echelle }: DessinPose): { data: Buffer; width: number; height: number } {
  const width = decor.largeur * echelle;
  const height = decor.hauteur * echelle;
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < decor.hauteur; row++) {
    for (let column = 0; column < decor.largeur; column++) {
      const color = decor.cases[row * decor.largeur + column];
      if (!color || !/^#[0-9a-f]{6}$/i.test(color)) continue;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      for (let dy = 0; dy < echelle; dy++) {
        let at = ((row * echelle + dy) * width + column * echelle) * 4;
        for (let dx = 0; dx < echelle; dx++) {
          data[at++] = r;
          data[at++] = g;
          data[at++] = b;
          data[at++] = 255;
        }
      }
    }
  }
  return { data, width, height };
}

/** Dessine l'image en PNG, le bâtiment posé par-dessus le fond. */
export async function renderChantierCard(card: ChantierCard, fonts: GazetteFonts, root: string): Promise<Buffer> {
  const layers: OverlayOptions[] = [];
  if (card.dessin) {
    const { data, width, height } = pixelsDuDessin(card.dessin);
    const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
    layers.push({ input: png, left: card.dessin.x, top: card.dessin.y });
  }
  return renderGazetteCard(card, fonts, root, layers);
}
