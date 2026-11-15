/**
 * Les figurants de l'almanach des petits moments (`type.ts`) : ce qui peut passer dans le village. Chaque moment de
 * l'almanach ne peut montrer que ces figurants-là : leur liste fait la variété des moments. Dessins originaux, case par
 * case, à l'échelle des Gaulois (48 × 64), tournés vers la droite, dans le trait des bêtes du village (`../betes.ts`),
 * qu'ils ne refont pas (ni poule, ni chien, ni chèvre, ni vache, ni charrette). Rien ne dit une saison.
 * Rangés par milieu : `figurants-ciel.ts`, `figurants-eau.ts`, `figurants-sol.ts`, `figurants-gens.ts`,
 * `figurants-toit.ts`, `figurants-nappes.ts` ; la boîte à dessin est dans `figurants-outils.ts`. Design : Claude Fable 5.2.
 */
import { FIGURANTS_DU_CIEL } from "./figurants-ciel";
import { FIGURANTS_DE_L_EAU } from "./figurants-eau";
import { FIGURANTS_GENS } from "./figurants-gens";
import { FIGURANTS_EN_NAPPE } from "./figurants-nappes";
import { FIGURANTS_DU_SOL } from "./figurants-sol";
import { FIGURANTS_DES_TOITS } from "./figurants-toit";
import type { Figurant } from "./type";

export const FIGURANTS: readonly Figurant[] = [...FIGURANTS_DU_CIEL, ...FIGURANTS_DE_L_EAU, ...FIGURANTS_DU_SOL, ...FIGURANTS_GENS, ...FIGURANTS_DES_TOITS, ...FIGURANTS_EN_NAPPE];
