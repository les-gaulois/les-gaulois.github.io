import { COTE_DES_ICONES_DE_RARETE, RARETES_ILLUSTREES, iconeDeRarete, rareteDuRang, type RareteIllustree } from "../../lib/jeu/icones-de-rarete";

export { rareteDuRang };

/**
 * L'icône d'une rareté (21 novembre 2026, demande du pilote : « des icônes aussi pour commun, peu commun, épique, etc. au lieu
 * de * ** *** **** ***** ») : le dessin en pixels de `src/lib/jeu/icones-de-rarete.ts` (Claude Fable 5.2), dans la couleur de
 * sa rareté, qui monte en prestige de l'une à l'autre. Il remplace les losanges qui comptaient la rareté, partout où ils
 * servaient. Décoratif : le nom de la rareté est toujours écrit ou dit à côté.
 *
 * L'image est faite une fois par rareté dans la page (une toile, puis son adresse), et agrandie sans flou d'un nombre entier
 * de fois. Elle ne dépend pas de la feuille du kit du jeu : la même sert hors du jeu, à l'inscription de « Mon compte ».
 */

/** Une adresse d'image par rareté, faite au premier besoin. */
const ADRESSES = new Map<RareteIllustree, string>();

function adresseDe(rarete: RareteIllustree): string | null {
  const deja = ADRESSES.get(rarete);
  if (deja) return deja;
  if (typeof document === "undefined") return null;
  const dessin = iconeDeRarete(rarete);
  const toile = document.createElement("canvas");
  toile.width = dessin.width;
  toile.height = dessin.height;
  const contexte = toile.getContext("2d");
  if (!contexte) return null;
  contexte.putImageData(new ImageData(new Uint8ClampedArray(dessin.data), dessin.width, dessin.height), 0, 0);
  const adresse = toile.toDataURL("image/png");
  ADRESSES.set(rarete, adresse);
  return adresse;
}

/** Cette rareté a-t-elle son icône ? Toutes celles des objets, des familiers, des bannières et des Gaulois uniques. */
export const estIllustree = (rarete: string): rarete is RareteIllustree => (RARETES_ILLUSTREES as readonly string[]).includes(rarete);

/** L'icône d'une rareté, décorative. `echelle` : les pixels d'écran par case du dessin (2 par défaut, comme le kit). */
export function IconeDeRarete({ rarete, echelle = 2, classe = "" }: { rarete: string; echelle?: number; classe?: string }) {
  if (!estIllustree(rarete)) return null;
  const adresse = adresseDe(rarete);
  if (!adresse) return null;
  const cote = COTE_DES_ICONES_DE_RARETE * echelle;
  return <img src={adresse} width={cote} height={cote} alt="" aria-hidden="true" class={`rarete-icone ${classe}`} decoding="async" />;
}
