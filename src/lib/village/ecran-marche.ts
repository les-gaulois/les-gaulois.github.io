/**
 * L'écran du marché du village (onglet « Le marché » de `/village`) : ce que la page calcule à partir des réponses du
 * serveur (`get_marche`, `get_ma_boutique`, contrat dans `contrat.ts`). Le serveur décide de tout, achat, vente et prix ;
 * ici, seulement la lecture des réponses, les filtres, ce qui s'annonce avant de confirmer, et les mots des refus.
 */
import { EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, RARETES, type Emplacement, type Rarete } from "../gaulois";
import { ERROR_MESSAGES } from "../compte/errors";
import { fmtInt } from "../format";
import type { MaBoutique, Marche, ObjetPossede, OffreDuMarche, RefusMarche } from "./contrat";

/** Un objet payant du catalogue, avec ce qu'il faut pour dessiner sa case. */
export interface ObjetDuMarche {
  emplacement: Emplacement;
  objet: string;
  nom: string;
  rarete: Rarete;
}

/** Une offre dont l'objet est au catalogue. */
export type OffreLisible = OffreDuMarche & ObjetDuMarche;
/** Une ligne de l'inventaire dont l'objet est au catalogue. */
export type PossedeLisible = ObjetPossede & ObjetDuMarche;

const estEmplacement = (valeur: unknown): valeur is Emplacement => typeof valeur === "string" && (EMPLACEMENTS_OBJETS as readonly string[]).includes(valeur);
const entier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isInteger(valeur);

/** L'objet payant que désignent un emplacement et un identifiant ; `null` s'il n'est pas au catalogue, ou s'il est gratuit. */
export function objetDuMarche(emplacement: unknown, objet: unknown): ObjetDuMarche | null {
  if (!estEmplacement(emplacement) || typeof objet !== "string") return null;
  const fiche = OBJETS[emplacement][objet];
  if (!fiche || fiche.gratuit || !fiche.rarete) return null;
  return { emplacement, objet, nom: fiche.nom, rarete: fiche.rarete };
}

/** Le marché relu : son solde, ses offres lisibles, dans l'ordre du serveur. `null` : la réponse n'a pas la forme du contrat. */
export interface MarcheLu {
  solde: number;
  offres: OffreLisible[];
  offresMax: number;
}

export function lireMarche(reponse: unknown): MarcheLu | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Partial<Marche> & Record<string, unknown>;
  if (!entier(brut.solde) || brut.solde < 0 || !Array.isArray(brut.offres) || !entier(brut.offres_max)) return null;
  const offres: OffreLisible[] = [];
  for (const ligne of brut.offres as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const o = ligne as Record<string, unknown>;
    const objet = objetDuMarche(o["emplacement"], o["objet"]);
    if (!objet || !entier(o["id"]) || !entier(o["prix"]) || o["prix"] < 1 || typeof o["vendeur"] !== "string" || typeof o["expire_le"] !== "string") continue;
    offres.push({ ...objet, id: o["id"], prix: o["prix"], vendeur: o["vendeur"], a_moi: o["a_moi"] === true, expire_le: o["expire_le"] });
  }
  return { solde: brut.solde, offres, offresMax: brut.offres_max };
}

/** Ce que le marché lit de `get_ma_boutique` : les prix de la boutique par rareté et l'inventaire lisible. */
export interface BoutiqueLue {
  prix: Record<Rarete, number>;
  inventaire: PossedeLisible[];
}

export function lireBoutique(reponse: unknown): BoutiqueLue | null {
  if (reponse === null || typeof reponse !== "object") return null;
  const brut = reponse as Partial<MaBoutique> & Record<string, unknown>;
  if (brut.prix === null || typeof brut.prix !== "object" || !Array.isArray(brut.inventaire)) return null;
  const prix = {} as Record<Rarete, number>;
  for (const rarete of ORDRE_RARETES) {
    const valeur = (brut.prix as Record<string, unknown>)[rarete];
    if (!entier(valeur) || valeur < 1) return null;
    prix[rarete] = valeur;
  }
  const inventaire: PossedeLisible[] = [];
  for (const ligne of brut.inventaire as unknown[]) {
    if (ligne === null || typeof ligne !== "object") continue;
    const o = ligne as Record<string, unknown>;
    const objet = objetDuMarche(o["emplacement"], o["objet"]);
    if (!objet || !entier(o["quantite"]) || o["quantite"] < 1) continue;
    const origine = o["origine"] === "pochette" || o["origine"] === "marche" ? o["origine"] : "achat";
    inventaire.push({ ...objet, quantite: o["quantite"], origine, acquis_le: typeof o["acquis_le"] === "string" ? o["acquis_le"] : "" });
  }
  // Du plus rare au plus courant, puis par nom : ce qui se vend le plus cher d'abord.
  inventaire.sort((a, b) => RARETES[b.rarete].rang - RARETES[a.rarete].rang || a.nom.localeCompare(b.nom, "fr"));
  return { prix, inventaire };
}

/** Le filtre du marché : tout, ou un seul emplacement. */
export type FiltreDuMarche = "tout" | Emplacement;

/** Les offres des autres membres, pour le filtre choisi. Les siennes sont à part (`mesOffres`). */
export function offresAAcheter(offres: readonly OffreLisible[], filtre: FiltreDuMarche): OffreLisible[] {
  return offres.filter((o) => !o.a_moi && (filtre === "tout" || o.emplacement === filtre));
}

export const mesOffres = (offres: readonly OffreLisible[]): OffreLisible[] => offres.filter((o) => o.a_moi);

/** Les emplacements où une offre d'un autre membre attend : seuls ceux-là ont un filtre. */
export function emplacementsEnVente(offres: readonly OffreLisible[]): Emplacement[] {
  return EMPLACEMENTS_OBJETS.filter((emplacement) => offres.some((o) => !o.a_moi && o.emplacement === emplacement));
}

/**
 * Ce que l'écran annonce avant de confirmer un achat : le solde après, ou ce qui l'empêche. Le serveur revérifie tout :
 * ce calcul évite seulement un clic voué au refus. `inventaire` à `null` : pas lu, l'écran ne sait pas si l'objet est déjà
 * possédé.
 */
export interface ExamenAchat {
  soldeApres: number;
  refus: "solde_insuffisant" | "deja_possede" | null;
  /** Les statères qui manquent, quand le solde ne suffit pas. */
  manque: number;
}

export function examinerAchat(offre: Pick<OffreLisible, "prix" | "emplacement" | "objet">, solde: number, inventaire: readonly Pick<ObjetPossede, "emplacement" | "objet">[] | null): ExamenAchat {
  const soldeApres = solde - offre.prix;
  if (inventaire?.some((p) => p.emplacement === offre.emplacement && p.objet === offre.objet)) return { soldeApres, refus: "deja_possede", manque: 0 };
  if (soldeApres < 0) return { soldeApres, refus: "solde_insuffisant", manque: -soldeApres };
  return { soldeApres, refus: null, manque: 0 };
}

/**
 * Un objet de l'inventaire peut-il se mettre en vente ? Pas son seul exemplaire s'il vient du marché : un objet acheté au
 * marché ne se remet pas en vente (contrat). Avec plusieurs exemplaires, l'écran ne sait pas d'où vient chacun : il laisse
 * choisir, et le serveur décide (`achete_au_marche`).
 */
export const seVend = (objet: Pick<ObjetPossede, "quantite" | "origine">): boolean => !(objet.quantite === 1 && objet.origine === "marche");

/** Le prix tapé par le vendeur : un nombre entier de 1 au prix de la boutique. `null` : pas un prix accepté. */
export function lirePrix(texte: string, prixBoutique: number): number | null {
  const net = texte.trim();
  if (!/^\d{1,7}$/.test(net)) return null;
  const prix = Number(net);
  return prix >= 1 && prix <= prixBoutique ? prix : null;
}

const JOUR = 86_400_000;

/** La fin d'une offre, en mots : « Fin dans 3 jours ». */
export function finDeLOffre(expireLe: string, maintenant: Date): string {
  const reste = new Date(expireLe).getTime() - maintenant.getTime();
  if (Number.isNaN(reste)) return "";
  if (reste <= 0) return "Offre finie";
  const jours = Math.floor(reste / JOUR);
  if (jours < 1) return "Fin dans moins d'un jour";
  return jours === 1 ? "Fin dans 1 jour" : `Fin dans ${jours} jours`;
}

/** « 1 statère », « 250 statères ». */
export const enStateres = (nombre: number): string => `${fmtInt(nombre)} ${Math.abs(nombre) > 1 ? "statères" : "statère"}`;

/**
 * Les mots du marché pour chaque refus du contrat (`RefusMarche`). Ceux qui n'existent qu'au marché sont dans
 * `errors.ts` ; ceux que le marché partage avec le reste du site sont redits ici pour le marché.
 */
export const MESSAGES_DU_MARCHE: Readonly<Record<RefusMarche, string>> = {
  not_validated: "Le marché s'ouvre une fois votre compte validé.",
  pas_possede: ERROR_MESSAGES["pas_possede"]!,
  objet_porte: ERROR_MESSAGES["objet_porte"]!,
  achete_au_marche: ERROR_MESSAGES["achete_au_marche"]!,
  prix_invalide: ERROR_MESSAGES["prix_invalide"]!,
  trop_d_offres: ERROR_MESSAGES["trop_d_offres"]!,
  offre_fermee: ERROR_MESSAGES["offre_fermee"]!,
  offre_a_soi: ERROR_MESSAGES["offre_a_soi"]!,
  deja_possede: "Vous avez déjà cet objet.",
  solde_insuffisant: "Vous n'avez pas assez de statères pour cette offre.",
};

/** Les mots du marché pour un refus ; `null` : ce n'est pas un refus du marché, le message courant du refus convient. */
export function messageDuMarche(code: string): string | null {
  return code in MESSAGES_DU_MARCHE ? MESSAGES_DU_MARCHE[code as RefusMarche] : null;
}
