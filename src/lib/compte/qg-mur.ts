/**
 * Les calculs de l'onglet « Le mur » du QG (`QgMur.tsx`) : les lignes du mur, la recherche, les filtres et leurs nombres.
 * Rien n'est inventé : tout vient de `get_qg` (le mur) et de `get_qg_tools` (les GG de la semaine, les parrains).
 *
 * Aucun membre du mur n'est marqué « Parrain » : le serveur donne les parrains sans leur numéro de Gaulois, et un nom ne
 * désigne pas un membre à coup sûr (deux comptes peuvent porter le même). Seule l'adresse de la photo, qui contient
 * l'identifiant Discord, relierait un parrain à un membre du mur, et seulement pour ceux qui ont une photo : une marque
 * posée sur les uns et pas sur les autres dirait faux. La liste des parrains, elle, est celle du serveur.
 */
import { fmtCount, fmtInt } from "../format";
import type { QgTools, WallMember } from "./outils";
import type { Face } from "./qg";

/** Au-delà, le mur ne tient plus dans un écran : la recherche et les filtres s'affichent. */
export const MUR_LONG = 12;

/** Les parrains montrés d'emblée ; les suivants sont repliés. */
export const PARRAINS_MONTRES = 4;

/** Bornes du serveur (`get_qg`, `get_qg_tools`) : il ne donne pas plus de 300 membres du mur ni plus de 50 parrains. */
export const MUR_MAX = 300;
export const PARRAINS_MAX = 50;

export type MurFiltre = "tous" | "encadrement" | "gg";

/** Les filtres du mur, dans l'ordre de la barre. `outils` : il ne compte rien sans `get_qg_tools`. */
export const MUR_FILTRES: readonly { id: MurFiltre; label: string; outils?: boolean }[] = [
  { id: "tous", label: "Tous" },
  { id: "encadrement", label: "Encadrement" },
  { id: "gg", label: "GG cette semaine", outils: true },
];

/** Une ligne du mur. Sans les outils (`get_qg_tools` absent), `member` et `gg` sont à `null` : « pas de données » n'est pas zéro. */
export interface MurLigne {
  /** `n` et le numéro de Gaulois avec les outils, sinon `i` et la place dans la liste : stable le temps d'un affichage. */
  key: string;
  face: Face;
  /** Le membre tel que le serveur le donne pour les GG, ou `null` sans les outils. */
  member: WallMember | null;
  staff: boolean;
  /** Les GG reçus cette semaine, ou `null` sans les outils. */
  gg: number | null;
  /** C'est le membre connecté : pas de bouton GG pour soi. */
  mine: boolean;
}

/** Les lettres liées que la décomposition des accents ne sépare pas. */
const LIEES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss", ø: "o", ł: "l", đ: "d" };

/** Sans accents, majuscules ni espaces en trop, pour comparer ce qui est tapé à un nom. Les autres signes restent. */
export const sansAccents = (text: string): string =>
  text
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[œæßøłđ]/g, (ch) => LIEES[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();

/** L'encadrement : tout rôle au-dessus de membre. */
export const isStaff = (face: Pick<Face, "role">): boolean => face.role !== "member";

/**
 * Les lignes du mur : celui des outils s'ils en donnent un (GG, bouton), sinon celui de `get_qg`, sans GG ni bouton, comme
 * avant ce dessin. Un numéro de Gaulois lu deux fois n'est gardé qu'une fois : il sert de clé.
 */
export function murLignes(wall: readonly Face[], tools: QgTools | null): MurLigne[] {
  if (!tools || tools.wall.length === 0) return wall.map((face, i) => ({ key: `i${i}`, face, member: null, staff: isStaff(face), gg: null, mine: false }));
  const seen = new Set<number>();
  return tools.wall.flatMap((member) => {
    if (seen.has(member.number)) return [];
    seen.add(member.number);
    return [{ key: `n${member.number}`, face: member, member, staff: isStaff(member), gg: member.gg, mine: tools.me.number !== null && member.number === tools.me.number }];
  });
}

/** La recherche, à chaque lettre tapée : le nom, sans tenir compte des accents ni des majuscules. */
export function murTrouve(ligne: MurLigne, query: string): boolean {
  const q = sansAccents(query);
  return q === "" || sansAccents(ligne.face.name).includes(q);
}

export function dansFiltre(ligne: MurLigne, filtre: MurFiltre): boolean {
  if (filtre === "encadrement") return ligne.staff;
  if (filtre === "gg") return ligne.gg !== null && ligne.gg > 0;
  return true;
}

/** Le nombre de lignes de chaque filtre, parmi celles que la recherche garde. */
export function murNombres(lignes: readonly MurLigne[]): Record<MurFiltre, number> {
  const count = (filtre: MurFiltre) => lignes.filter((ligne) => dansFiltre(ligne, filtre)).length;
  return { tous: lignes.length, encadrement: count("encadrement"), gg: count("gg") };
}

/** Ce que le mur affiche : la recherche, puis le filtre. L'ordre du serveur est gardé. */
export function murVisible(lignes: readonly MurLigne[], query: string, filtre: MurFiltre): MurLigne[] {
  return lignes.filter((ligne) => murTrouve(ligne, query) && dansFiltre(ligne, filtre));
}

/**
 * Les filtres de la barre : « Tous » toujours, celui qui est choisi toujours (même tombé à zéro, pour qu'on voie pourquoi
 * le mur est vide), les autres s'ils comptent quelqu'un sur tout le mur. Un filtre des outils ne paraît pas sans eux.
 */
export function murFiltres(totaux: Record<MurFiltre, number>, choix: MurFiltre, outils: boolean): MurFiltre[] {
  return MUR_FILTRES.filter((f) => f.id === "tous" || f.id === choix || ((!f.outils || outils) && totaux[f.id] > 0)).map((f) => f.id);
}

/** Ce qu'entend un lecteur d'écran après une lettre tapée ou un filtre choisi ; rien quand tout le mur est montré. */
export function murAnnonce(visibles: number, query: string, filtre: MurFiltre): string {
  return sansAccents(query) !== "" || filtre !== "tous" ? `${fmtCount(visibles, "membre")} pour ce choix.` : "";
}

/** Un nombre lu dans une liste que le serveur arrête à `max` : à la borne, il peut y en avoir davantage. */
export const auMoins = (n: number, max: number): string => (n >= max ? `${fmtInt(max)} ou plus` : fmtInt(n));

/**
 * Le bouton GG qui reçoit le focus quand celui qui l'avait quitte le mur (un GG retiré sous « GG cette semaine ») : celui
 * qui a pris sa place, ou le dernier. `-1` : il n'en reste aucun.
 */
export const murFocusApres = (index: number, boutons: number): number => (boutons < 1 ? -1 : Math.min(Math.max(index, 0), boutons - 1));
