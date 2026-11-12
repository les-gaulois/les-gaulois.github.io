/**
 * La fabrique de l'onciale de cases (onciale.ts), en deux formes :
 * - en cases, chaque case séparée de ses voisines par un joint, comme la grille de conquête : les grands titres et les
 *   chiffres clés ;
 * - taillée : le contour des cases, ses marches d'escalier remplacées par des pans coupés (tailler, dans cases.ts). Les
 *   petits titres et les textes, que le pilote trouvait trop pixélisés.
 * scripts/generate-police.ts en tire les fichiers du site à chaque construction, et le robot de Discord ses images
 * (gazette-image.ts), sans attendre la construction du site. Code du site, sous l'AGPL comme lui ; les polices fabriquées
 * sont sous SIL Open Font License 1.1, comme les dessins d'onciale.ts (voir NOTICE.md).
 */
import opentype from "opentype.js";
import { TAILLE_TEXTES, casesPleines, contours, tailler, type Taille } from "./cases";
import { APPROCHE, CASE, ESPACE, ESPACE_FINE, ESPACE_INSECABLE, ONCIALE, chasse, glyphesOnciale } from "./onciale";

/** Le joint entre deux cases, en unités de chaque côté d'une case de 70 : 12 unités entre deux cases voisines. */
export const JOINT = 6;

/** Les deux formes de la police : en cases (`joint`) ou taillée (`taille`). */
export type FormeOnciale = { joint: number } | { taille: Taille };

/** Les deux polices du site : leur fichier, leur nom de famille et leur forme. */
export const POLICES_ONCIALE = [
  { fichier: "onciale.woff2", famille: ONCIALE.famille, forme: { taille: TAILLE_TEXTES } },
  { fichier: "onciale-cases.woff2", famille: ONCIALE.familleCases, forme: { joint: JOINT } },
] as const satisfies readonly { fichier: string; famille: string; forme: FormeOnciale }[];

/** `joint` : les cases séparées, de ce joint ; sinon `taille` : le contour des cases, taillé. */
export function policeOnciale(famille: string, forme: FormeOnciale): opentype.Font {
  const vide = (nom: string, unicode: number | undefined, cases: number) =>
    new opentype.Glyph({ name: nom, unicode, advanceWidth: cases * CASE, path: new opentype.Path() });
  const glyphes: opentype.Glyph[] = [
    vide(".notdef", undefined, 6),
    vide("space", 0x20, ESPACE),
    vide("uni00A0", 0xa0, ESPACE_INSECABLE),
    vide("uni2009", 0x2009, ESPACE_FINE),
    vide("uni202F", 0x202f, ESPACE_FINE),
  ];
  for (const [ch, d] of glyphesOnciale()) {
    const path = new opentype.Path();
    const dx = (d.approche ?? APPROCHE) * CASE;
    const cases = casesPleines(d);
    if ("joint" in forme) {
      const { joint } = forme;
      for (const [x, y] of cases) {
        const x0 = dx + x * CASE + joint;
        const y0 = y * CASE + joint;
        const x1 = dx + (x + 1) * CASE - joint;
        const y1 = (y + 1) * CASE - joint;
        path.moveTo(x0, y0);
        path.lineTo(x1, y0);
        path.lineTo(x1, y1);
        path.lineTo(x0, y1);
        path.close();
      }
    } else {
      // Des unités entières : une coupe d'un tiers de case ne tombe pas juste.
      const X = (x: number) => Math.round(dx + x * CASE);
      const Y = (y: number) => Math.round(y * CASE);
      for (const boucle of contours(cases)) {
        tailler(boucle, forme.taille).forEach(([x, y], i) => (i === 0 ? path.moveTo(X(x), Y(y)) : path.lineTo(X(x), Y(y))));
        path.close();
      }
    }
    // Un dessin par caractère : capitales et minuscules ont chacune le leur.
    const code = ch.codePointAt(0) as number;
    glyphes.push(new opentype.Glyph({ name: `uni${code.toString(16).toUpperCase().padStart(4, "0")}`, unicode: code, advanceWidth: chasse(d) * CASE, path }));
  }
  return new opentype.Font({
    familyName: famille,
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 13 * CASE,
    descender: -3 * CASE,
    copyright: ONCIALE.copyright,
    license: ONCIALE.licence,
    licenseURL: ONCIALE.licenceUrl,
    version: ONCIALE.version,
    glyphs: glyphes,
  });
}
