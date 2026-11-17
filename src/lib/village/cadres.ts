/**
 * Le rayon « Cadres » de la boutique (demande du pilote, 17 novembre 2026 : « cadres animés », six choisis sur maquette,
 * puis « crée-en 20 de plus », « détaillé selon la rareté ») : vingt-six cadres animés en pixels pour la carte d'un membre,
 * dessinés dans `src/lib/fx/cadres-carte.ts`. Les communs et peu communs font sept cases d'épaisseur ; les épiques,
 * mystiques et légendaires en font dix, avec un blason au sommet, des coins sculptés et leur lumière sur l'image.
 *
 * Les règles, décidées par le serveur (migration `20261117001600_cadres_des_cartes.sql`, docs/DIRECTION.md, « Le rayon
 * Cadres ») : les mêmes que pour les finitions du rayon « Cartes ». Un cadre s'achète à la boutique au prix d'une bannière
 * de sa rareté, en un seul exemplaire ; jamais au marché, en pochette ni à la revente, et pas d'achat pendant un essai en
 * mode GOD. Le membre en montre un, ou aucun. La liste ci-dessous et celle du serveur sont les mêmes : un test les compare.
 * Les raretés sont une proposition de Claude, à changer si le pilote le demande.
 */
import type { RareteDeBanniere } from "../../../supabase/functions/code-discord/bannieres/commun.ts";
import type { CadreDeCarte } from "../fx/cadres-carte";

export type IdDeCadre = CadreDeCarte;

export interface CadreDuRayon {
  id: IdDeCadre;
  nom: string;
  rarete: RareteDeBanniere;
  /** Ce que le cadre montre, en une phrase : la fiche du rayon. */
  description: string;
}

const NOMS_ET_RARETES: Readonly<Record<IdDeCadre, readonly [string, RareteDeBanniere, string]>> = {
  corde: ["Corde", "commun", "Une torsade de chanvre qui tourne autour de la carte, des nœuds aux coins."],
  bois: ["Bois verni", "commun", "Des planches clouées, des équerres de fer, et le vernis qui accroche la lumière."],
  pierre: ["Pierre moussue", "commun", "Des blocs taillés, avec une mousse qui scintille."],
  fer: ["Fer riveté", "commun", "Des plaques de fer, des rivets en relief, un éclat qui court."],
  lierre: ["Lierre", "peu-commun", "Une liane qui ondule sur l'écorce, ses feuilles qui dépassent, ses fleurs qui s'ouvrent."],
  vagues: ["Vagues", "peu-commun", "La houle roule tout autour, avec son écume."],
  damier: ["Damier", "peu-commun", "Des cases noires et blanches qui défilent, dans un liseré d'or."],
  tartan: ["Tartan du clan", "peu-commun", "Un tissage rouge, vert et or qui glisse."],
  sablier: ["Sablier", "peu-commun", "Le sable tombe le long du cadre, grain après grain."],
  tricolore: ["Tricolore", "peu-commun", "Trois bandes bleu, blanc, rouge, parcourues d'une onde de lumière."],
  braise: ["Braise", "peu-commun", "Du charbon qui rougeoie, et des flammes qui montent."],
  givre: ["Givre", "peu-commun", "De la glace à facettes, des stalactites qui gouttent, des flocons."],
  "or-liquide": ["Or liquide", "epique", "L'or fondu coule du creuset du sommet et goutte sur la carte."],
  runes: ["Runes", "epique", "Des mégalithes gravés : les runes s'allument tour à tour sous un cristal."],
  lave: ["Lave", "epique", "De la roche noire fendue de lave, un volcan au sommet, des étincelles."],
  circuit: ["Circuit", "epique", "Des pistes, des puces qui clignotent, des signaux qui circulent."],
  rubis: ["Rubis", "epique", "Une monture d'or sertie de rubis taillés, qui étincellent tour à tour."],
  aurore: ["Aurore", "mystique", "Un ciel de nuit, des rubans de lumière, des voiles qui dansent sous la lune."],
  toxique: ["Toxique", "mystique", "Une vase qui bouillonne et goutte, sous une fiole qui fume."],
  neon: ["Néon", "mystique", "Trois tubes de couleur, une étoile qui change de teinte, des ampoules qui courent."],
  galaxie: ["Galaxie", "mystique", "Une nébuleuse, une planète à anneau, des spirales aux coins, deux comètes."],
  foudre: ["Foudre", "legendaire", "Un ciel d'orage : des éclairs font le tour, et le tonnerre illumine tout."],
  "arc-en-ciel": ["Arc-en-ciel", "legendaire", "Toutes les couleurs ondulent, sous une arche et ses nuages."],
  glitch: ["Glitch", "legendaire", "L'image saute, se décale en rouge et en cyan, un panneau d'alerte clignote."],
  plasma: ["Plasma", "legendaire", "Une énergie rose et bleue, des orbes et des filaments tout autour."],
  soleil: ["Soleil", "legendaire", "De l'or ciselé, des pierres serties, un astre au sommet et de longs rayons."],
};

/** Les cadres du rayon, du plus commun au plus rare, dans l'ordre de la liste ci-dessus. */
export const CADRES: readonly CadreDuRayon[] = (Object.keys(NOMS_ET_RARETES) as IdDeCadre[]).map((id) => {
  const [nom, rarete, description] = NOMS_ET_RARETES[id];
  return { id, nom, rarete, description };
});

const PAR_ID: ReadonlyMap<string, CadreDuRayon> = new Map(CADRES.map((c) => [c.id, c]));

/** Le cadre de ce nom, ou `null` : un nom que le rayon ne connaît pas est ignoré. */
export const cadreParId = (id: string | null | undefined): CadreDuRayon | null => (id ? (PAR_ID.get(id) ?? null) : null);

/* ---------- Ce que le serveur répond ---------- */

/** `get_mes_cadres` : le solde du membre, les prix par rareté, ses cadres et celui qu'il montre. */
export interface MesCadres {
  solde: number;
  peutAcheter: boolean;
  prix: Readonly<Partial<Record<RareteDeBanniere, number>>>;
  possedes: readonly IdDeCadre[];
  porte: IdDeCadre | null;
}

const objet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entier = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Lit la réponse de `get_mes_cadres`. `null` : illisible. Un cadre ou une rareté inconnue est ignoré. */
export function lireMesCadres(raw: unknown): MesCadres | null {
  if (!objet(raw) || raw["ok"] !== true || !entier(raw["solde"]) || typeof raw["peut_acheter"] !== "boolean" || !objet(raw["prix"]) || !Array.isArray(raw["cadres"])) return null;
  const prix: Partial<Record<RareteDeBanniere, number>> = {};
  for (const { rarete } of CADRES) {
    const p = raw["prix"][rarete];
    if (entier(p) && p > 0) prix[rarete] = p;
  }
  const possedes = raw["cadres"].flatMap((f) => {
    const connu = objet(f) && typeof f["cadre"] === "string" ? cadreParId(f["cadre"]) : null;
    return connu ? [connu.id] : [];
  });
  const porte = typeof raw["porte"] === "string" ? (cadreParId(raw["porte"])?.id ?? null) : null;
  return { solde: raw["solde"], peutAcheter: raw["peut_acheter"], prix, possedes, porte: porte && possedes.includes(porte) ? porte : null };
}

/** Pourquoi le serveur a refusé, en clair. */
export const REFUS_DES_CADRES: Readonly<Record<string, string>> = {
  not_signed_in: "Connectez-vous pour acheter.",
  suspended: "Ce compte est suspendu.",
  not_validated: "Réservé aux membres validés.",
  no_gaulois: "Créez d'abord votre Gaulois.",
  unknown_cadre: "Ce cadre n'existe pas.",
  deja_possede: "Vous avez déjà ce cadre.",
  pas_possede: "Vous n'avez pas ce cadre.",
  prix_change: "Le prix vient de changer : fermez cette fenêtre pour voir le nouveau.",
  solde_insuffisant: "Il vous manque des statères.",
  mode_god: "Pas d'achat de cadre pendant un essai en mode GOD.",
  rate_limited: "Trop de demandes : réessayez dans un instant.",
};
export const refusDeCadre = (code: string | null | undefined): string => (code && REFUS_DES_CADRES[code]) || "Le serveur n'a pas répondu comme prévu : réessayez.";
