/**
 * Le catalogue des bannières du Gaulois : les lots réunis, dans l'ordre des familles puis des raretés. Voir `commun.ts`.
 * Les lots A à E se vendent à la boutique ; les lots F à I, « Les trésors de la pochette », ne sortent que de la pochette
 * des bannières, et portent son cadre. La liste du serveur (`internal.bannieres`, migrations des bannières et de leur
 * pochette) a les mêmes identifiants, les mêmes raretés et la même marque de pochette : un test compare.
 */
import { poserLeCadre } from "./cadres.ts";
import { poserLeCadreDeLaPochette } from "./cadres-pochette.ts";
import { FAMILLE_DE_LA_POCHETTE, FAMILLES_DES_BANNIERES, RARETES_DES_BANNIERES, estDeLaPochette, type BanniereDuLot, type Decor, type FamilleDeBanniere, type RareteDeBanniere } from "./commun.ts";
import { LOT_A } from "./lot-a.ts";
import { LOT_B } from "./lot-b.ts";
import { LOT_C } from "./lot-c.ts";
import { LOT_D } from "./lot-d.ts";
import { LOT_E } from "./lot-e.ts";
import { LOT_F } from "./lot-f.ts";
import { LOT_G } from "./lot-g.ts";
import { LOT_H } from "./lot-h.ts";
import { LOT_I } from "./lot-i.ts";

export { FAMILLE_DE_LA_POCHETTE, FAMILLES_DES_BANNIERES, RARETES_DES_BANNIERES, estDeLaPochette, type BanniereDuLot, type FamilleDeBanniere, type RareteDeBanniere };

/** Une bannière du catalogue, sans son dessin : ce que lisent l'écran et le robot. */
export type Banniere = Omit<BanniereDuLot, "dessiner">;

const FAMILLES = Object.keys(FAMILLES_DES_BANNIERES) as FamilleDeBanniere[];
const rang = <T>(liste: readonly T[], x: T): number => liste.indexOf(x);

const TOUTES: readonly BanniereDuLot[] = [...LOT_A, ...LOT_B, ...LOT_C, ...LOT_D, ...LOT_E, ...LOT_F, ...LOT_G, ...LOT_H, ...LOT_I]
  .map((b, i) => ({ b, i }))
  .sort((p, q) => rang(FAMILLES, p.b.famille) - rang(FAMILLES, q.b.famille) || rang(RARETES_DES_BANNIERES, p.b.rarete) - rang(RARETES_DES_BANNIERES, q.b.rarete) || p.i - q.i)
  .map(({ b }) => b);

/** Toutes les bannières, sans leur dessin, rangées par famille puis par rareté. */
export const BANNIERES: readonly Banniere[] = TOUTES.map(({ id, nom, rarete, famille, description }) => ({ id, nom, rarete, famille, description }));

const PAR_ID = new Map(TOUTES.map((b) => [b.id, b]));

/** La bannière de cet identifiant, ou `null` si le catalogue ne la connaît pas. */
export const banniereParId = (id: string | null | undefined): Banniere | null => {
  const b = id ? PAR_ID.get(id) : undefined;
  return b ? { id: b.id, nom: b.nom, rarete: b.rarete, famille: b.famille, description: b.description } : null;
};

const dessins = new Map<string, Decor>();

/**
 * Le dessin d'une bannière, cadre compris (celui de la pochette pour ses trésors, celui de la rareté sinon), gardé une
 * fois fait ; `null` pour un identifiant inconnu (une bannière retirée, un serveur en avance sur le site) : l'image prend
 * alors le décor du lieu.
 */
export function dessinDeLaBanniere(id: string | null | undefined): Decor | null {
  const b = id ? PAR_ID.get(id) : undefined;
  if (!b) return null;
  let dessin = dessins.get(b.id);
  if (!dessin) {
    const brut = b.dessiner();
    const cases = [...brut.cases];
    (estDeLaPochette(b) ? poserLeCadreDeLaPochette : poserLeCadre)(cases, b.rarete);
    dessin = { cases, ombre: brut.ombre };
    dessins.set(b.id, dessin);
  }
  return dessin;
}
