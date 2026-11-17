/**
 * L'image du score d'utilité d'une victoire (`victoires-utilite.ts`) : l'en-tête des autres images du robot, puis une ligne
 * par Gaulois de la partie, le plus utile d'abord. Sur chaque ligne : son rang, son Gaulois du village et son nom, ses titres
 * de la partie (Trésorier, Fer de lance, Ravitailleur), son utilité en grand, puis ses trois axes, chacun avec sa barre, aux
 * couleurs de la page de la partie : l'or de l'économie, le rouge du combat, le bleu du soutien.
 *
 * Une barre va de 0 au double de la part moyenne : son trait du milieu est cette moyenne, 100. Un axe où il n'y a rien à
 * partager n'a ni nombre ni barre : ce n'est pas zéro. L'image dit ce que vaut 100 et ce que le score ne mesure pas.
 */
import { fmtInt } from "./format";
import { AUCUN_GAULOIS, type GauloisParJoueur } from "./gaulois-joueurs";
import { BUST_CUT, HEAD_CUT, movedSprite, placeSprite, spriteRect, tenueOf, type SpritePlacement } from "./gaulois-sprite";
import { CARD_COLORS as C, drawnWidth, fitted, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Measure } from "./gazette-image";
import { mapLabel } from "./map-names";
import { AXES, NOM_DE_L_AXE, TITRE_DE_L_AXE, type Axe } from "./rejeu/bilan-ecran";
import { fittedAlt, shownAddress } from "./salon-discord";
import { axesEnMots, NOTE_DE_LA_MOYENNE, NOTE_DES_LIMITES, PAGE_DES_UTILES, partieEnMots, SANS_NOM, TITRE_DE_L_UTILITE, titresEnMots, type LigneDUtilite, type PartieDeLUtilite } from "./victoires-utilite";
import { victoryTitle } from "./victoires-discord";
import { victoryWhen } from "./victoires-image";

const WIDTH = 1200;
/** Le bas de l'image, sous les notes : l'adresse du site et la source. */
const FOOTER_HEIGHT = 84;
/** Au-delà de tant de Gaulois, les lignes deviennent plus basses. */
export const LIGNES_HAUTES_MAX = 5;

/** Les couleurs des trois axes, celles de la page de la partie dans le thème sombre (`--color-warn`, `--color-danger`, `--color-win`). */
export const TON_DE_L_AXE: Record<Axe, string> = { economie: "#FFC857", combat: "#FF6B6B", soutien: "#4C86F5" };

/** Ce que dit le pied de l'image : d'où viennent les nombres. */
export const NOTE_DE_LA_SOURCE = "D'après la fiche de la partie et son rejeu";
/** Sous les lignes : comment lire une barre. */
export const NOTE_DES_BARRES = "Le trait au milieu de chaque barre : cette moyenne.";

/** Les mesures d'une ligne : hautes jusqu'à `LIGNES_HAUTES_MAX` Gaulois, basses au-delà. */
const HAUTE = { height: 70, gap: 7, inset: 9, rang: 28, nom: 29, nomSeul: 45, nomAvecTitres: 32, titres: 15, titresY: 55, utilite: 42, utiliteY: 49, mot: 20, axe: 15, valeur: 24, texteY: 31, barreY: 44, barre: 8, cut: BUST_CUT } as const;
const BASSE = { height: 62, gap: 8, inset: 8, rang: 23, nom: 25, nomSeul: 40, nomAvecTitres: 29, titres: 13, titresY: 49, utilite: 36, utiliteY: 44, mot: 17, axe: 13, valeur: 21, texteY: 28, barreY: 40, barre: 6, cut: HEAD_CUT } as const;

const RANG_WIDTH = 60;
/** Les trois axes, à droite de la ligne : leur largeur, l'écart entre deux, et l'air jusqu'au bord. */
const AXE_WIDTH = 138;
const AXE_GAP = 14;
const AXE_BORD = 16;
/** La place gardée à l'utilité, entre le nom et les axes. */
const UTILITE_WIDTH = 190;
/** L'air de chaque côté de la colonne des Gaulois, entre le rang et les noms. */
const SPRITE_LEAD = 14;
const SPRITE_SCALE = 2;
/** Entre deux titres sous un nom, et leur plus petite taille. */
const TITRES_GAP = 14;
const TITRES_MIN = 11;
const TRACKING = 0.06;

/**
 * Avec cinq Gaulois, l'image fait 1 200 sur 762 : elle remplit le cadre où Discord montre une image (550 sur 350), comme
 * celle de la victoire juste au-dessus d'elle. Plus haute, elle s'élargit pour le remplir encore (`auCadreDeDiscord`).
 */

/** La largeur de la partie pleine d'une barre : 100 au milieu, 200 et plus au bout ; une part non nulle se voit toujours. */
export function largeurDeBarre(valeur: number, largeur = AXE_WIDTH): number {
  if (valeur <= 0) return 0;
  return Math.max(3, Math.round((Math.min(valeur, 200) / 200) * largeur));
}

/**
 * Quoi écrire et où : se teste sans police. `gaulois` : le Gaulois du village de chaque membre au pseudo public de la partie
 * qui a créé le sien, posé après son nom.
 */
export function utilityCard(partie: PartieDeLUtilite, lignes: readonly LigneDUtilite[], tag: string, siteUrl: string, measure: Measure, gaulois: GauloisParJoueur = AUCUN_GAULOIS, cardWidth = WIDTH): GazetteCard {
  const CONTENT_WIDTH = cardWidth - 2 * MARGIN;
  // Une image plus large donne sa largeur en plus aux barres des trois axes.
  const axeWidth = AXE_WIDTH + Math.floor((cardWidth - WIDTH) / AXES.length);
  const head = pageHead({ path: PAGE_DES_UTILES, title: TITRE_DE_L_UTILITE, kicker: `${victoryTitle(tag)} · ${mapLabel(partie.map)}`, period: `${victoryWhen(partie)}, heure de Paris` }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const sprites: SpritePlacement[] = [];
  const m = lignes.length > LIGNES_HAUTES_MAX ? BASSE : HAUTE;
  const tracked: Measure = (text, font, size) => drawnWidth({ text, font, size, tracking: TRACKING }, measure);

  const right = MARGIN + CONTENT_WIDTH;
  const axesLeft = right - AXE_BORD - (AXES.length * axeWidth + (AXES.length - 1) * AXE_GAP);
  const utiliteRight = axesLeft - 28;
  // Les Gaulois du village, en buste, dans une colonne entre le rang et le nom : le bas posé sur le bord de la ligne, l'axe du
  // corps de tous sur la même verticale. La colonne a la largeur du plus large, arme comprise ; sans aucun Gaulois, pas de colonne.
  const busts = lignes.map((ligne, i) => {
    const tenue = tenueOf(gaulois, ligne.id);
    const bottom = head.bottom + i * (m.height + m.gap) + m.height - 1;
    return tenue ? placeSprite(tenue, { axis: 0, bottom, scale: SPRITE_SCALE, cut: m.cut, room: m.height - 1 + m.gap - 3 }) : null;
  });
  const placed = busts.filter((b): b is SpritePlacement => b !== null);
  const leftOfAxis = Math.max(0, ...placed.map((b) => -spriteRect(b).x));
  const rightOfAxis = Math.max(0, ...placed.map((b) => spriteRect(b).x + spriteRect(b).width));
  const badgeRight = MARGIN + m.inset + RANG_WIDTH;
  const axis = badgeRight + SPRITE_LEAD + leftOfAxis;
  const nameX = placed.length > 0 ? axis + rightOfAxis + SPRITE_LEAD : badgeRight + 24;
  const nameRoom = utiliteRight - UTILITE_WIDTH - nameX;

  lignes.forEach((ligne, i) => {
    const y = head.bottom + i * (m.height + m.gap);
    rects.push({ x: MARGIN, y, width: CONTENT_WIDTH, height: m.height, radius: 8, color: C.SURFACE, stroke: C.LINE });

    // Le rang : en bleu pour le premier, plus discret ensuite.
    const badge = { x: MARGIN + m.inset, y: y + m.inset, width: RANG_WIDTH, height: m.height - 2 * m.inset, radius: 6 };
    rects.push(ligne.rang === 1 ? { ...badge, color: C.BLUE } : { ...badge, color: C.SURFACE_2, stroke: C.LINE_STRONG });
    texts.push({ ...fitted(String(ligne.rang), "onciale", m.rang, m.rang - 10, RANG_WIDTH - 16, measure), x: badge.x + RANG_WIDTH / 2, y: y + Math.round(m.height / 2 + m.rang * 0.36), font: "onciale", color: C.WHITE, anchor: "middle" });

    // Le nom, et sous lui les titres de la partie, chacun dans la couleur de son axe.
    const nom = ligne.nom ?? SANS_NOM;
    const nameY = y + (ligne.titres.length > 0 ? m.nomAvecTitres : m.nomSeul);
    const bust = busts[i];
    if (bust) sprites.push(movedSprite(bust, axis, 0));
    const name = fitted(nom, "strong", m.nom, m.nom - 12, nameRoom, measure);
    texts.push({ ...name, x: nameX, y: nameY, font: "strong", color: ligne.nom === null ? C.MUTED : C.WHITE });
    // Les titres tiennent dans la place du nom, jamais sous l'utilité : plus petits s'il le faut, puis les derniers en moins.
    const titres = ligne.titres.map((a) => ({ a, text: TITRE_DE_L_AXE[a].toLocaleUpperCase("fr") }));
    const titresWidth = (shown: typeof titres, size: number) => shown.reduce((sum, t) => sum + Math.ceil(tracked(t.text, "monoStrong", size)), 0) + Math.max(0, shown.length - 1) * TITRES_GAP;
    let titresSize: number = m.titres;
    while (titresSize > TITRES_MIN && titresWidth(titres, titresSize) > nameRoom) titresSize--;
    while (titres.length > 0 && titresWidth(titres, titresSize) > nameRoom) titres.pop();
    let at = nameX;
    for (const { a, text } of titres) {
      texts.push({ text, x: at, y: y + m.titresY, size: titresSize, font: "monoStrong", color: TON_DE_L_AXE[a], tracking: TRACKING });
      at += Math.ceil(tracked(text, "monoStrong", titresSize)) + TITRES_GAP;
    }

    // L'utilité, en grand, puis ce qu'elle compte.
    const mot = "d'utilité";
    texts.push({ text: mot, x: utiliteRight, y: y + m.utiliteY, size: m.mot, font: "body", color: C.MUTED, anchor: "end" });
    const motWidth = Math.ceil(measure(mot, "body", m.mot));
    texts.push({ ...fitted(fmtInt(ligne.utilite), "onciale", m.utilite, m.utilite - 16, UTILITE_WIDTH - motWidth - 10, measure), x: utiliteRight - motWidth - 10, y: y + m.utiliteY, font: "onciale", color: C.WHITE, anchor: "end" });

    // Les trois axes : le nom à gauche, le nombre à droite, la barre dessous.
    AXES.forEach((a, k) => {
      const x = axesLeft + k * (axeWidth + AXE_GAP);
      const valeur = ligne.axes[a];
      const premier = ligne.titres.includes(a);
      texts.push({ text: NOM_DE_L_AXE[a].toLocaleUpperCase("fr"), x, y: y + m.texteY, size: m.axe, font: "monoStrong", color: C.MUTED, tracking: TRACKING });
      if (valeur === null) {
        // Rien à partager sur cet axe : un tiret, sans barre. Ce n'est pas zéro.
        texts.push({ text: "–", x: x + axeWidth, y: y + m.texteY, size: m.valeur, font: "body", color: C.MUTED, anchor: "end" });
        return;
      }
      texts.push({ text: fmtInt(valeur), x: x + axeWidth, y: y + m.texteY, size: m.valeur, font: "onciale", color: premier ? TON_DE_L_AXE[a] : C.WHITE, anchor: "end" });
      rects.push({ x, y: y + m.barreY, width: axeWidth, height: m.barre, radius: Math.floor(m.barre / 2), color: C.SURFACE_2 });
      const pleine = largeurDeBarre(valeur, axeWidth);
      if (pleine > 0) rects.push({ x, y: y + m.barreY, width: pleine, height: m.barre, radius: Math.floor(m.barre / 2), color: TON_DE_L_AXE[a] });
      // Le trait de la moyenne, au milieu, un peu plus haut que la barre.
      rects.push({ x: x + Math.round(axeWidth / 2) - 1, y: y + m.barreY - 3, width: 2, height: m.barre + 6, radius: 0, color: C.WHITE });
    });
  });

  // Sous les lignes : ce que vaut 100, comment lire une barre, et ce que le score ne mesure pas.
  const rowsBottom = head.bottom + lignes.length * (m.height + m.gap) - m.gap;
  const notes = [`${NOTE_DE_LA_MOYENNE} ${NOTE_DES_BARRES}`, NOTE_DES_LIMITES];
  notes.forEach((note, i) => texts.push({ ...fitted(note, "body", 21, 15, CONTENT_WIDTH, measure), x: MARGIN, y: rowsBottom + 34 + i * 27, font: "body", color: C.MUTED }));
  const height = rowsBottom + 34 + (notes.length - 1) * 27 + 10 + FOOTER_HEIGHT;
  texts.push(...pageFoot(shownAddress(siteUrl, PAGE_DES_UTILES), NOTE_DE_LA_SOURCE, height - 24, measure, cardWidth).texts);
  return { width: cardWidth, height, rects, texts, logo: LOGO, ...(sprites.length > 0 ? { gaulois: sprites } : {}) };
}

/**
 * Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. Sans couper une ligne : au-delà
 * de ce que Discord accepte, les derniers Gaulois sont comptés, et les deux notes restent entières.
 */
export function utilityImageAlt(partie: PartieDeLUtilite, lignes: readonly LigneDUtilite[], tag: string): string {
  const head = `Score d'utilité des Gaulois de la partie. ${partieEnMots(partie, tag)}, ${victoryWhen(partie).toLowerCase()}, heure de Paris.`;
  return fittedAlt(lignes, (shown, rest) =>
    [
      head,
      ...shown.map((l) => {
        const axes = axesEnMots(l);
        const titres = titresEnMots(l);
        return `${l.rang}. ${l.nom ?? SANS_NOM} : ${fmtInt(l.utilite)} d'utilité${axes ? `, ${axes}` : ""}${titres ? ` (${titres})` : ""}.`;
      }),
      ...(rest > 0 ? [`Et ${fmtInt(rest)} ${rest > 1 ? "autres Gaulois" : "autre Gaulois"}.`] : []),
      NOTE_DE_LA_MOYENNE,
      NOTE_DES_LIMITES,
    ].join(" "),
  );
}

/** Dessine l'image en PNG. */
export function renderUtilityCard(card: GazetteCard, fonts: GazetteFonts, root: string): Promise<Buffer> {
  return renderGazetteCard(card, fonts, root);
}
