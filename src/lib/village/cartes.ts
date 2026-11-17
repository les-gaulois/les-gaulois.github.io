/**
 * Le rayon « Cartes » de la boutique (demande du pilote, 17 novembre 2026 : « des idées d'achats dans la boutique Mon
 * Gaulois pour avoir accès à des animations différentes », « +20 finitions avec leur rareté », puis « Oui, le rayon
 * Cartes ») : les finitions de la carte d'un membre, celle qui paraît en haut de l'accueil quand il est sur le podium de la
 * semaine (`src/lib/cartes-podium.ts`). Trente-trois finitions : dix reflets (une feuille holographique, dans la feuille de
 * style `04-poste.css`) et vingt-trois animations en pixels (`src/lib/fx/finitions-carte.ts`).
 *
 * Les règles, décidées par le serveur (migration `20261117001200_cartes_du_gaulois.sql`, docs/DIRECTION.md, « Le rayon
 * Cartes ») : une finition s'achète à la boutique au prix d'une bannière de sa rareté, en un seul exemplaire ; jamais au
 * marché, en pochette ni à la revente. Le membre en montre une, ou aucune : sans choix, sa carte du podium porte la
 * finition de sa place. La liste ci-dessous et celle du serveur sont les mêmes : un test les compare.
 */
import type { RareteDeBanniere } from "../../../supabase/functions/code-discord/bannieres/commun.ts";
import { FINITIONS_ANIMEES, type FinitionDeCarte } from "../fx/finitions-carte";

/** Les reflets : des feuilles holographiques sans toile, dessinées par la feuille de style. */
export const REFLETS = ["arc-en-ciel", "tricolore", "pluie-d-eclats", "cristal", "braise", "feuille-d-or", "prisme", "hologramme", "aurore", "cosmos"] as const;
export type RefletDeCarte = (typeof REFLETS)[number];

export type IdDeFinition = RefletDeCarte | FinitionDeCarte;

export interface FinitionDuRayon {
  id: IdDeFinition;
  nom: string;
  rarete: RareteDeBanniere;
  /** Animée en pixels sur ses deux toiles ; sinon, un reflet. */
  animee: boolean;
}

const NOMS_ET_RARETES: Readonly<Record<IdDeFinition, readonly [string, RareteDeBanniere]>> = {
  "arc-en-ciel": ["Arc-en-ciel", "commun"],
  tricolore: ["Tricolore", "commun"],
  confettis: ["Confettis", "commun"],
  averse: ["Averse", "commun"],
  bulles: ["Bulles", "commun"],
  "tube-neon": ["Tube néon", "commun"],
  "pluie-d-eclats": ["Pluie d'éclats", "peu-commun"],
  cristal: ["Cristal", "peu-commun"],
  braise: ["Braise", "peu-commun"],
  "pluie-de-code": ["Pluie de code", "peu-commun"],
  radar: ["Radar", "peu-commun"],
  "feu-d-artifice": ["Feu d'artifice", "peu-commun"],
  blizzard: ["Blizzard", "peu-commun"],
  "boule-a-facettes": ["Boule à facettes", "peu-commun"],
  "bain-de-canards": ["Bain de canards", "peu-commun"],
  "feuille-d-or": ["Feuille d'or", "epique"],
  prisme: ["Prisme", "epique"],
  hologramme: ["Hologramme", "epique"],
  piratage: ["Piratage", "epique"],
  foudre: ["Foudre", "epique"],
  "coulee-de-lave": ["Coulée de lave", "epique"],
  "vitesse-lumiere": ["Vitesse lumière", "epique"],
  lancement: ["Lancement", "epique"],
  "pluie-de-stateres": ["Pluie de statères", "epique"],
  aurore: ["Aurore", "mystique"],
  cosmos: ["Cosmos", "mystique"],
  "trou-noir": ["Trou noir", "mystique"],
  portail: ["Portail", "mystique"],
  "voile-boreal": ["Voile boréal", "mystique"],
  plasma: ["Plasma", "mystique"],
  "champignon-atomique": ["Champignon atomique", "legendaire"],
  explosion: ["Explosion", "legendaire"],
  supernova: ["Supernova", "legendaire"],
};

const ANIMEES: ReadonlySet<string> = new Set(FINITIONS_ANIMEES);

/** Les finitions du rayon, de la plus commune à la plus rare, dans l'ordre de la liste ci-dessus. */
export const CARTES: readonly FinitionDuRayon[] = (Object.keys(NOMS_ET_RARETES) as IdDeFinition[]).map((id) => {
  const [nom, rarete] = NOMS_ET_RARETES[id];
  return { id, nom, rarete, animee: ANIMEES.has(id) };
});

const PAR_ID: ReadonlyMap<string, FinitionDuRayon> = new Map(CARTES.map((c) => [c.id, c]));

/** La finition de ce nom, ou `null` : un nom que le rayon ne connaît pas est ignoré. */
export const finitionParId = (id: string | null | undefined): FinitionDuRayon | null => (id ? (PAR_ID.get(id) ?? null) : null);

/* ---------- Ce que le serveur répond ---------- */

/** `get_mes_cartes` : le solde du membre, les prix par rareté, ses finitions et celle qu'il montre. */
export interface MesCartes {
  solde: number;
  peutAcheter: boolean;
  prix: Readonly<Partial<Record<RareteDeBanniere, number>>>;
  possedees: readonly IdDeFinition[];
  porte: IdDeFinition | null;
}

const objet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entier = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Lit la réponse de `get_mes_cartes`. `null` : illisible. Une finition ou une rareté inconnue est ignorée. */
export function lireMesCartes(raw: unknown): MesCartes | null {
  if (!objet(raw) || raw["ok"] !== true || !entier(raw["solde"]) || typeof raw["peut_acheter"] !== "boolean" || !objet(raw["prix"]) || !Array.isArray(raw["finitions"])) return null;
  const prix: Partial<Record<RareteDeBanniere, number>> = {};
  for (const { rarete } of CARTES) {
    const p = raw["prix"][rarete];
    if (entier(p) && p > 0) prix[rarete] = p;
  }
  const possedees = raw["finitions"].flatMap((f) => {
    const connue = objet(f) && typeof f["finition"] === "string" ? finitionParId(f["finition"]) : null;
    return connue ? [connue.id] : [];
  });
  const porte = typeof raw["porte"] === "string" ? (finitionParId(raw["porte"])?.id ?? null) : null;
  return { solde: raw["solde"], peutAcheter: raw["peut_acheter"], prix, possedees, porte: porte && possedees.includes(porte) ? porte : null };
}

/** Pourquoi le serveur a refusé, en clair. */
export const REFUS_DES_CARTES: Readonly<Record<string, string>> = {
  not_signed_in: "Connectez-vous pour acheter.",
  suspended: "Ce compte est suspendu.",
  not_validated: "Réservé aux membres validés.",
  no_gaulois: "Créez d'abord votre Gaulois.",
  unknown_finition: "Cette finition n'existe pas.",
  deja_possede: "Vous avez déjà cette finition.",
  pas_possede: "Vous n'avez pas cette finition.",
  prix_change: "Le prix vient de changer : fermez cette fenêtre pour voir le nouveau.",
  solde_insuffisant: "Il vous manque des statères.",
  mode_god: "Pas d'achat de carte pendant un essai en mode GOD.",
  rate_limited: "Trop de demandes : réessayez dans un instant.",
};
export const refusDeCarte = (code: string | null | undefined): string => (code && REFUS_DES_CARTES[code]) || "Le serveur n'a pas répondu comme prévu : réessayez.";
