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
  /** Ce que la finition montre, en une phrase : la fiche du rayon. */
  description: string;
  /** Animée en pixels sur ses deux toiles ; sinon, un reflet. */
  animee: boolean;
}

const NOMS_ET_RARETES: Readonly<Record<IdDeFinition, readonly [string, RareteDeBanniere, string]>> = {
  "arc-en-ciel": ["Arc-en-ciel", "commun", "Un arc-en-ciel en travers de la carte, qui glisse quand elle s'incline."],
  tricolore: ["Tricolore", "commun", "Une bande bleu, blanc, rouge qui traverse la carte avec l'inclinaison."],
  confettis: ["Confettis", "commun", "Des confettis de toutes les couleurs tombent, devant et derrière le Gaulois."],
  averse: ["Averse", "commun", "La pluie tombe en biais et éclabousse le bas de la carte."],
  bulles: ["Bulles", "commun", "Des bulles montent lentement, irisées."],
  "tube-neon": ["Tube néon", "commun", "Deux lumières font le tour de la carte, comme dans un tube."],
  "pluie-d-eclats": ["Pluie d'éclats", "peu-commun", "Une traînée de paillettes qui s'allume là où la carte accroche la lumière."],
  cristal: ["Cristal", "peu-commun", "Des facettes de cristal qui miroitent quand la carte tourne."],
  braise: ["Braise", "peu-commun", "Une lueur de braise monte du bas de la carte, avec ses étincelles."],
  "pluie-de-code": ["Pluie de code", "peu-commun", "Des colonnes de 0 et de 1 verts tombent derrière le Gaulois."],
  radar: ["Radar", "peu-commun", "Un balayage de radar tourne et allume ses échos."],
  "feu-d-artifice": ["Feu d'artifice", "peu-commun", "Des fusées montent et éclatent en gerbes de couleur."],
  blizzard: ["Blizzard", "peu-commun", "La neige file en travers, poussée par l'inclinaison de la carte."],
  "boule-a-facettes": ["Boule à facettes", "peu-commun", "Une boule à facettes et ses taches de lumière qui tournent."],
  "bain-de-canards": ["Bain de canards", "peu-commun", "Le Gaulois a les pieds dans l'eau, et trois canards passent devant lui."],
  "feuille-d-or": ["Feuille d'or", "epique", "Un reflet d'or massif qui balaie la carte."],
  prisme: ["Prisme", "epique", "Un éventail de couleurs qui tourne autour du Gaulois avec la carte."],
  hologramme: ["Hologramme", "epique", "Des lignes bleues et un balayage, comme une projection."],
  piratage: ["Piratage", "epique", "Un écran vert qui s'écrit tout seul, et des parasites par moments."],
  foudre: ["Foudre", "epique", "Des éclairs frappent derrière le Gaulois, un à la fois."],
  "coulee-de-lave": ["Coulée de lave", "epique", "La lave remue au bas de la carte et lance ses braises."],
  "vitesse-lumiere": ["Vitesse lumière", "epique", "Les étoiles filent depuis le centre de la carte."],
  lancement: ["Lancement", "epique", "Trois fusées décollent avec leur fumée ; l'une passe devant le Gaulois."],
  "pluie-de-stateres": ["Pluie de statères", "epique", "Des statères d'or tombent en tournant sur eux-mêmes."],
  aurore: ["Aurore", "mystique", "Des lueurs vertes, bleues et violettes qui se déplacent doucement."],
  cosmos: ["Cosmos", "mystique", "Un ciel d'étoiles et une nébuleuse rose et bleue."],
  "trou-noir": ["Trou noir", "mystique", "Un disque de poussières tourne et tombe dans un trou noir."],
  portail: ["Portail", "mystique", "Des anneaux de couleur s'ouvrent sans fin derrière le Gaulois."],
  "voile-boreal": ["Voile boréal", "mystique", "Trois voiles d'aurore ondulent sous les étoiles."],
  plasma: ["Plasma", "mystique", "Des nappes de couleur vive qui se mêlent sur toute la carte."],
  "champignon-atomique": ["Champignon atomique", "legendaire", "Un éclair, puis la colonne et le nuage montent derrière le Gaulois."],
  explosion: ["Explosion", "legendaire", "Une boule de feu, des ondes, des éclats devant le Gaulois et un « BOUM »."],
  supernova: ["Supernova", "legendaire", "Des rayons de toutes les couleurs tournent autour d'une étoile qui pulse."],
};

const ANIMEES: ReadonlySet<string> = new Set(FINITIONS_ANIMEES);

/** Les finitions du rayon, de la plus commune à la plus rare, dans l'ordre de la liste ci-dessus. */
export const CARTES: readonly FinitionDuRayon[] = (Object.keys(NOMS_ET_RARETES) as IdDeFinition[]).map((id) => {
  const [nom, rarete, description] = NOMS_ET_RARETES[id];
  return { id, nom, rarete, description, animee: ANIMEES.has(id) };
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
