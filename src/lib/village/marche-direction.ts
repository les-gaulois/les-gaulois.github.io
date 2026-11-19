/**
 * Le tableau du marché, dans l'onglet Village de la Direction (19 novembre 2026, « 5 pousse-le au maximum ») : ce que l'écran
 * lit de `get_village_marche` (migration 20261119000200_tableau_du_marche) et ses mots. Des totaux seulement, sans aucun nom
 * de membre, comme le reste de l'onglet ; le serveur compte tout, ici on ne fait que relire et écrire.
 */
import { ORDRE_RARETES, type Rarete } from "../gaulois";
import { fmtInt } from "../format";
import { objetDuMarche, type ObjetDuMarche } from "./ecran-marche";

/** Les chiffres d'une période, tirés du journal des statères. */
export interface PeriodeDuMarche {
  achats_boutique: number;
  stateres_boutique: number;
  pochettes: number;
  ventes_offres: number;
  ventes_demandes: number;
  stateres_echanges: number;
  vendeurs: number;
  acheteurs: number;
  demandes_posees: number;
  demandes_rendues: number;
  reventes: number;
  stateres_revendus: number;
  distribues: number;
}

export const CLES_DE_PERIODE = [
  "achats_boutique",
  "stateres_boutique",
  "pochettes",
  "ventes_offres",
  "ventes_demandes",
  "stateres_echanges",
  "vendeurs",
  "acheteurs",
  "demandes_posees",
  "demandes_rendues",
  "reventes",
  "stateres_revendus",
  "distribues",
] as const satisfies readonly (keyof PeriodeDuMarche)[];

export const PERIODES = ["sept_jours", "trente_jours", "total"] as const;
export type Periode = (typeof PERIODES)[number];

export interface JourDuMarche {
  jour: string;
  achats: number;
  pochettes: number;
  ventes: number;
  demandes: number;
  reventes: number;
  distribues: number;
}

export interface SemaineDuMarche {
  semaine: number;
  debut: string;
  achats: number;
  pochettes: number;
  ventes: number;
  demandes: number;
}

/** Un objet compté : les plus demandés (avec la meilleure demande), les plus en vente (avec l'offre la moins chère). */
export type ObjetCompte = ObjetDuMarche & { nombre: number; prix: number };

export interface VenteDuMarche extends ObjetDuMarche {
  le: string;
  prix: number;
  prixBoutique: number | null;
  voie: "offre" | "demande";
  /** L'objet n'était pas en rayon à l'heure de la vente ; `null` : vente d'avant la rotation, quand tout était en rayon. */
  horsRayon: boolean | null;
}

export interface MarcheDeLaDirection {
  luLe: string;
  /** `depuis` : l'heure où la rotation est en place au plus tard (le collage de sa migration). */
  rotation: { semaine: number; depuis: string; changeLe: string; enRayon: number; horsRayon: number };
  ouvert: {
    offres: number;
    vendeurs: number;
    valeur: number;
    valeurBoutique: number;
    demandes: number;
    demandeurs: number;
    misDeCote: number;
    parRarete: Record<Rarete, { offres: number; demandes: number }>;
  };
  periodes: Record<Periode, PeriodeDuMarche>;
  parJour: JourDuMarche[];
  parSemaine: SemaineDuMarche[];
  prix30: { rarete: Rarete; ventes: number; partMoyenne: number | null }[];
  /** La médiane, en secondes, du temps avant une vente ; `null` : aucune vente sur 30 jours. */
  delais30: { offres: number | null; demandes: number | null };
  plusDemandes: ObjetCompte[];
  plusOfferts: ObjetCompte[];
  dernieresVentes: VenteDuMarche[];
}

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const entier = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
/** Un compte qui peut être négatif ne l'est jamais ici : un nombre entier, ou rien. */
const entierSigne = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const date = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const estRarete = (v: unknown): v is Rarete => typeof v === "string" && (ORDRE_RARETES as readonly string[]).includes(v);

function lirePeriode(brut: unknown): PeriodeDuMarche | null {
  if (!estObjet(brut)) return null;
  const sortie = {} as PeriodeDuMarche;
  for (const cle of CLES_DE_PERIODE) {
    const n = entierSigne(brut[cle]);
    if (n === null) return null;
    sortie[cle] = n;
  }
  return sortie;
}

function lireObjetsComptes(brut: unknown): ObjetCompte[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((ligne) => {
    if (!estObjet(ligne)) return [];
    const objet = objetDuMarche(ligne["emplacement"], ligne["objet"]);
    const nombre = entier(ligne["nombre"]);
    const prix = entier(ligne["prix"]);
    return objet && nombre !== null && prix !== null ? [{ ...objet, nombre, prix }] : [];
  });
}

/** La réponse de `get_village_marche`, relue. `null` : illisible. Une ligne d'un objet inconnu de ce code est sautée. */
export function lireMarcheDeLaDirection(reponse: unknown): MarcheDeLaDirection | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const luLe = date(reponse["lu_le"]);
  const r = reponse["rotation"];
  const o = reponse["ouvert"];
  const p = reponse["periodes"];
  if (!luLe || !estObjet(r) || !estObjet(o) || !estObjet(p)) return null;

  const semaine = entierSigne(r["semaine"]);
  const depuis = date(r["depuis"]);
  const changeLe = date(r["change_le"]);
  const enRayon = entier(r["en_rayon"]);
  const horsRayon = entier(r["hors_rayon"]);
  if (semaine === null || !depuis || !changeLe || enRayon === null || horsRayon === null) return null;

  const champs = ["offres", "vendeurs", "valeur", "valeur_boutique", "demandes", "demandeurs", "mis_de_cote"] as const;
  const n = Object.fromEntries(champs.map((c) => [c, entier(o[c])])) as Record<(typeof champs)[number], number | null>;
  if (champs.some((c) => n[c] === null)) return null;
  const parRarete = {} as Record<Rarete, { offres: number; demandes: number }>;
  const brutRarete = estObjet(o["par_rarete"]) ? o["par_rarete"] : {};
  for (const rarete of ORDRE_RARETES) {
    const ligne = brutRarete[rarete];
    parRarete[rarete] = { offres: estObjet(ligne) ? (entier(ligne["offres"]) ?? 0) : 0, demandes: estObjet(ligne) ? (entier(ligne["demandes"]) ?? 0) : 0 };
  }

  const periodes = {} as Record<Periode, PeriodeDuMarche>;
  for (const nom of PERIODES) {
    const lue = lirePeriode(p[nom]);
    if (!lue) return null;
    periodes[nom] = lue;
  }

  const parJour: JourDuMarche[] = (Array.isArray(reponse["par_jour"]) ? reponse["par_jour"] : []).flatMap((ligne: unknown) => {
    if (!estObjet(ligne) || typeof ligne["jour"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ligne["jour"])) return [];
    const valeurs = (["achats", "pochettes", "ventes", "demandes", "reventes", "distribues"] as const).map((c) => entier(ligne[c]));
    if (valeurs.some((v) => v === null)) return [];
    const [achats, pochettes, ventes, demandes, reventes, distribues] = valeurs as number[];
    return [{ jour: ligne["jour"], achats: achats!, pochettes: pochettes!, ventes: ventes!, demandes: demandes!, reventes: reventes!, distribues: distribues! }];
  });

  const parSemaine: SemaineDuMarche[] = (Array.isArray(reponse["par_semaine"]) ? reponse["par_semaine"] : []).flatMap((ligne: unknown) => {
    if (!estObjet(ligne)) return [];
    const s = entierSigne(ligne["semaine"]);
    const debut = date(ligne["debut"]);
    const valeurs = (["achats", "pochettes", "ventes", "demandes"] as const).map((c) => entier(ligne[c]));
    if (s === null || !debut || valeurs.some((v) => v === null)) return [];
    const [achats, pochettes, ventes, demandes] = valeurs as number[];
    return [{ semaine: s, debut, achats: achats!, pochettes: pochettes!, ventes: ventes!, demandes: demandes! }];
  });

  const prix30 = (Array.isArray(reponse["prix_30"]) ? reponse["prix_30"] : []).flatMap((ligne: unknown) => {
    if (!estObjet(ligne) || !estRarete(ligne["rarete"])) return [];
    const ventes = entier(ligne["ventes"]);
    if (ventes === null) return [];
    return [{ rarete: ligne["rarete"], ventes, partMoyenne: entier(ligne["part_moyenne"]) }];
  });

  const d = estObjet(reponse["delais_30"]) ? reponse["delais_30"] : {};
  const dernieresVentes: VenteDuMarche[] = (Array.isArray(reponse["dernieres_ventes"]) ? reponse["dernieres_ventes"] : []).flatMap((ligne: unknown) => {
    if (!estObjet(ligne)) return [];
    const objet = objetDuMarche(ligne["emplacement"], ligne["objet"]);
    const le = date(ligne["le"]);
    const prix = entier(ligne["prix"]);
    const voie = ligne["voie"];
    if (!objet || !le || prix === null || (voie !== "offre" && voie !== "demande")) return [];
    const horsRayon = typeof ligne["hors_rayon"] === "boolean" ? ligne["hors_rayon"] : null;
    return [{ ...objet, le, prix, prixBoutique: entier(ligne["prix_boutique"]), voie, horsRayon }];
  });

  return {
    luLe,
    rotation: { semaine, depuis, changeLe, enRayon, horsRayon },
    ouvert: { offres: n.offres!, vendeurs: n.vendeurs!, valeur: n.valeur!, valeurBoutique: n.valeur_boutique!, demandes: n.demandes!, demandeurs: n.demandeurs!, misDeCote: n.mis_de_cote!, parRarete },
    periodes,
    parJour,
    parSemaine,
    prix30,
    delais30: { offres: entier(d["offres"]), demandes: entier(d["demandes"]) },
    plusDemandes: lireObjetsComptes(reponse["plus_demandes"]),
    plusOfferts: lireObjetsComptes(reponse["plus_offerts"]),
    dernieresVentes,
  };
}

/* ---------- Les mots ---------- */

/** « 1 vente », « 3 ventes », « 0 vente » : le mot accordé au nombre (zéro et un au singulier). */
export const accorde = (n: number, un: string, plusieurs: string): string => `${fmtInt(n)} ${n > 1 ? plusieurs : un}`;

/** Un délai en mots, de la minute aux jours : « moins d'une heure », « 5 heures », « 1 jour et demi », « 2 jours ». */
export function delaiEnMots(secondes: number): string {
  const heures = secondes / 3600;
  if (heures < 1) return "moins d'une heure";
  if (heures < 36) return accorde(Math.round(heures), "heure", "heures");
  const jours = Math.round((heures / 24) * 2) / 2;
  return Number.isInteger(jours) ? accorde(jours, "jour", "jours") : `${accorde(Math.floor(jours), "jour", "jours")} et demi`;
}

/** La remise des offres ouvertes : ce qu'elles coûtent de moins qu'à la boutique, en pour cent ; `null` sans offre. */
export function remiseDesOffres(ouvert: Pick<MarcheDeLaDirection["ouvert"], "valeur" | "valeurBoutique">): number | null {
  if (ouvert.valeurBoutique <= 0) return null;
  return Math.round(((ouvert.valeurBoutique - ouvert.valeur) / ouvert.valeurBoutique) * 100);
}

/** La part des demandes posées qui ont trouvé un vendeur, sur une période ; `null` tant qu'aucune n'est close. */
export function partDesDemandesServies(periode: PeriodeDuMarche): number | null {
  const closes = periode.ventes_demandes + periode.demandes_rendues;
  return closes > 0 ? Math.round((periode.ventes_demandes / closes) * 100) : null;
}

/** Les lignes du tableau des échanges, dans l'ordre de l'écran : le libellé, la clé, et si c'est une somme de statères. */
export const LIGNES_DES_ECHANGES: readonly { label: string; cle: keyof PeriodeDuMarche; stateres?: true }[] = [
  { label: "Offres achetées", cle: "ventes_offres" },
  { label: "Demandes servies", cle: "ventes_demandes" },
  { label: "Statères passés d'un membre à l'autre", cle: "stateres_echanges", stateres: true },
  { label: "Membres qui ont vendu", cle: "vendeurs" },
  { label: "Membres qui ont acheté", cle: "acheteurs" },
  { label: "Demandes posées", cle: "demandes_posees" },
  { label: "Demandes fermées sans vendeur", cle: "demandes_rendues" },
  { label: "Objets revendus au jeu", cle: "reventes" },
  { label: "Statères rendus par la revente", cle: "stateres_revendus", stateres: true },
  { label: "Achats à la boutique", cle: "achats_boutique" },
  { label: "Statères payés à la boutique", cle: "stateres_boutique", stateres: true },
  { label: "Pochettes ouvertes", cle: "pochettes" },
  { label: "Statères distribués", cle: "distribues", stateres: true },
];

/** Les quatre séries des jours, chacune son petit graphique : le libellé, la clé, le mot accordé. */
export const SERIES_DES_JOURS: readonly { label: string; cle: "achats" | "pochettes" | "ventes" | "demandes"; un: string; plusieurs: string }[] = [
  { label: "Achats à la boutique", cle: "achats", un: "achat", plusieurs: "achats" },
  { label: "Pochettes ouvertes", cle: "pochettes", un: "pochette", plusieurs: "pochettes" },
  { label: "Ventes au marché", cle: "ventes", un: "vente", plusieurs: "ventes" },
  { label: "Demandes posées", cle: "demandes", un: "demande", plusieurs: "demandes" },
];
