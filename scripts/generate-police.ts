/**
 * Fabrique l'onciale de cases (src/lib/police/onciale.ts) dans public/generated/polices/, à chaque construction :
 * - onciale-cases.woff2, chaque case séparée de ses voisines par un joint, comme la grille de conquête : les grands
 *   titres et les chiffres clés ;
 * - onciale.woff2, les mêmes lettres « taillées » : le contour des cases, ses marches d'escalier remplacées par des pans
 *   coupés (tailler, dans src/lib/police/cases.ts). Les petits titres et les textes, que le pilote trouvait trop pixélisés.
 * Les deux sont sous SIL Open Font License 1.1 (voir l'en-tête de onciale.ts et NOTICE.md). La fabrique est dans
 * src/lib/police/fabrique.ts : les images du robot pour Discord s'en servent aussi.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compress } from "wawoff2";
import { POLICES_ONCIALE, policeOnciale } from "../src/lib/police/fabrique";

const dossier = join("public", "generated", "polices");
mkdirSync(dossier, { recursive: true });
for (const { fichier, famille, forme } of POLICES_ONCIALE) {
  const otf = new Uint8Array(policeOnciale(famille, forme).toArrayBuffer());
  const woff2 = await compress(otf);
  writeFileSync(join(dossier, fichier), woff2);
  console.log(`Police ${famille} : ${dossier}/${fichier} (${woff2.length} octets)`);
}
