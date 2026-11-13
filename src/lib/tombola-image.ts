/**
 * Les images de la tombola des concours sur Discord (13 novembre 2026, maquette C choisie par le pilote) : la bannière du
 * message du concours, et les fonds des deux billets, celui que reçoit chaque participant et le billet gagnant. Publiées
 * sous /tombola/ (src/pages/tombola/[nom].png.ts). La fonction code-discord pose le numéro sur les fonds, dans la zone que
 * `BILLET` lui garde (supabase/functions/code-discord/billets.ts) : les deux côtés lisent les mêmes mesures.
 *
 * Aucune donnée : des mots fixes et le dessin d'un billet. Le lot, la date et les noms s'écrivent sous l'image, dans le
 * message, où Discord les met à jour.
 */
import { BILLET } from "../../supabase/functions/code-discord/billets";
import { CARD_COLORS as C, GazetteFonts, fitted, fittedDrawn, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";

export const TOMBOLA_IMAGES = ["banniere", "billet", "gagnant"] as const;
export type TombolaImage = (typeof TOMBOLA_IMAGES)[number];

/** Les mots de chaque image : l'invite, le titre en onciale de cases, deux lignes. */
const MOTS: Record<TombolaImage, { titre: string; ligne: string; sous: string }> = {
  banniere: { titre: "Tombola des Gaulois", ligne: "Un billet numéroté pour chaque participant", sous: "Le numéro tiré au sort gagne, devant tout le monde" },
  billet: { titre: "Votre billet", ligne: "Tombola des Gaulois", sous: "Gardez ce numéro : le tirage au sort le dira" },
  gagnant: { titre: "Billet gagnant", ligne: "Tombola des Gaulois", sous: "Tiré au sort par le serveur du site" },
};

/** Ce que dit l'image, pour qui ne la voit pas. */
export const TOMBOLA_ALT: Record<TombolaImage, string> = {
  banniere: "Tombola des Gaulois : un billet numéroté pour chaque participant, le numéro tiré au sort gagne.",
  billet: "Votre billet de la tombola des Gaulois.",
  gagnant: "Le billet gagnant de la tombola des Gaulois.",
};

/**
 * Un billet sur la table des cartes, comme sur la maquette : à gauche l'invite, le titre et deux lignes ; à droite, après la
 * perforation et ses deux encoches, le talon avec « N° ». La bannière y écrit trois points ; les fonds laissent la zone du
 * numéro vide. Le billet gagnant a un fond plus clair et un contour blanc.
 */
export function tombolaCard(nom: TombolaImage, measure: Measure): GazetteCard {
  const { carte, talon, numero } = BILLET;
  const gagnant = nom === "gagnant";
  const x0 = carte.x;
  const perforation = talon.x;
  const rects: CardRect[] = [{ x: x0, y: carte.y, width: carte.largeur, height: carte.hauteur, radius: 18, color: gagnant ? C.SURFACE_2 : C.SURFACE, stroke: gagnant ? C.WHITE : C.LINE_STRONG }];
  for (let y = carte.y + 22; y < carte.y + carte.hauteur - 22; y += 22) rects.push({ x: perforation, y, width: 4, height: 12, radius: 2, color: C.LINE_STRONG });
  rects.push({ x: perforation - 18, y: carte.y - 18, width: 40, height: 36, radius: 18, color: C.NAVY });
  rects.push({ x: perforation - 18, y: carte.y + carte.hauteur - 18, width: 40, height: 36, radius: 18, color: C.NAVY });
  const room = perforation - x0 - 80;
  const mots = MOTS[nom];
  const texts: CardText[] = [
    { text: "gal@clan:~$ ./tombola", x: x0 + 40, y: carte.y + 58, size: 22, font: "mono", color: C.BLUE_TEXT },
    { ...fittedDrawn({ text: mots.titre, font: "cases", lettrine: C.RED }, 58, 34, room, measure), x: x0 + 40, y: carte.y + 132, font: "cases", color: C.WHITE, lettrine: C.RED },
    { ...fitted(mots.ligne, "strong", 28, 18, room, measure), x: x0 + 40, y: carte.y + 182, font: "strong", color: C.BLUE_TEXT },
    { ...fitted(mots.sous, "body", 24, 16, room, measure), x: x0 + 40, y: carte.y + 222, font: "body", color: C.MUTED },
    { text: "N°", x: numero.centre, y: carte.y + 88, size: 30, font: "monoStrong", color: C.MUTED, anchor: "middle" },
  ];
  if (nom === "banniere") texts.push({ text: "• • •", x: numero.centre, y: Math.round((numero.haut + numero.bas) / 2) + 20, size: 60, font: "monoStrong", color: C.WHITE, anchor: "middle" });
  // Sans badge : le billet tient seul.
  return { width: BILLET.largeur, height: BILLET.hauteur, rects, texts, logo: { x: 0, y: 0, size: 0 } };
}

let fonts: GazetteFonts | null = null;

/** L'image en PNG, sans palette : la fonction code-discord relit les fonds tels quels (billets.ts, `lirePng`). */
export async function renderTombolaImage(nom: TombolaImage, root = process.cwd()): Promise<Buffer> {
  fonts ??= new GazetteFonts(root);
  return renderGazetteCard(tombolaCard(nom, fonts.width), fonts, root);
}
