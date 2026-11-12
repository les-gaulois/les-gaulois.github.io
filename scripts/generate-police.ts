/**
 * Fabrique l'onciale de cases (src/lib/police/onciale.ts) dans public/generated/polices/, à chaque construction :
 * - onciale-cases.woff2, chaque case séparée de ses voisines par un joint, comme la grille de conquête : les grands
 *   titres et les chiffres clés ;
 * - onciale.woff2, les mêmes lettres « taillées » : le contour des cases, ses marches d'escalier remplacées par des pans
 *   coupés (tailler, dans src/lib/police/cases.ts). Les petits titres et les textes, que le pilote trouvait trop pixélisés.
 * Les deux sont sous SIL Open Font License 1.1 (voir l'en-tête de onciale.ts et NOTICE.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";
import { compress } from "wawoff2";
import { TAILLE_TEXTES, casesPleines, contours, tailler, type Taille } from "../src/lib/police/cases";
import { APPROCHE, CASE, ESPACE, ESPACE_FINE, ESPACE_INSECABLE, ONCIALE, caracteresDe, chasse, glyphesOnciale } from "../src/lib/police/onciale";

/** Le joint entre deux cases, en unités de chaque côté d'une case de 70 : 12 unités entre deux cases voisines. */
const JOINT = 6;

/** `joint` : les cases séparées, de ce joint ; sinon `taille` : le contour des cases, taillé. */
function police(famille: string, forme: { joint: number } | { taille: Taille }): opentype.Font {
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
    const [code, ...autres] = caracteresDe(ch).map((c) => c.codePointAt(0) as number);
    const glyphe = new opentype.Glyph({
      name: `uni${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`,
      unicode: code,
      advanceWidth: chasse(d) * CASE,
      path,
    });
    // La minuscule : opentype.js 1.3 ignore l'option « unicodes » du constructeur, addUnicode l'ajoute bien.
    for (const c of autres) glyphe.addUnicode(c);
    glyphes.push(glyphe);
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

const dossier = join("public", "generated", "polices");
mkdirSync(dossier, { recursive: true });
for (const [fichier, famille, forme] of [
  ["onciale.woff2", ONCIALE.famille, { taille: TAILLE_TEXTES }],
  ["onciale-cases.woff2", ONCIALE.familleCases, { joint: JOINT }],
] as const) {
  const otf = new Uint8Array(police(famille, forme).toArrayBuffer());
  const woff2 = await compress(otf);
  writeFileSync(join(dossier, fichier), woff2);
  console.log(`Police ${famille} : ${dossier}/${fichier} (${woff2.length} octets)`);
}
