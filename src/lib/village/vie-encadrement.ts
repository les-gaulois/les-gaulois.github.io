/**
 * La lecture de l'encadrement : ce que l'onglet « Village » de la Direction lit des bulles des Gaulois (docs/DIRECTION.md,
 * « Le village des Gaulois »). À part du robot (`vie-releve.ts`), qui importe le SDK d'Anthropic : ce fichier-ci part au
 * navigateur avec l'écran de la Direction et ne dépend de rien d'autre que du langage. Des fonctions pures, testées dans
 * `tests/unit/village-direction.test.ts`.
 */

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * La réponse de `get_vie_du_village()` (migration 20261113002300), pour l'onglet « Village » de la Direction : les bulles,
 * le plafond du mois et ce qui a été dépensé chez Claude. Les sommes sont en dollars, la monnaie de la facture d'Anthropic,
 * calculées par le serveur au prix du modèle qu'il garde. Rien n'y désigne un joueur.
 */
export interface VieDuVillage {
  ok: true;
  /** Les bulles sont-elles permises par l'encadrement ? */
  bulles: boolean;
  /** Le plafond du mois, en dollars. */
  plafond: number;
  /** La dépense du mois a atteint le plafond : plus aucune nouvelle bulle jusqu'au 1er du mois suivant. */
  plafond_atteint: boolean;
  modele: string;
  /** Le prix du modèle, en dollars par million de jetons. */
  prix: { entree: number; sortie: number };
  /** Le 1er du mois en cours, à Paris (« 2026-11-01 »). */
  mois: string;
  depense: DepenseDuMois;
  /** Les douze mois d'avant, du plus récent au plus ancien, quand il y a eu une dépense. */
  historique: DepenseDuMois[];
  /** Les bulles montrées sur la place en ce moment (moins de 12 heures). */
  bulles_affichees: number;
  /** L'heure du dernier relevé vocal sur Discord et de la dernière bulle écrite ; `null` : jamais. */
  dernier_vocal: string | null;
  derniere_bulle: string | null;
}

export interface DepenseDuMois {
  mois: string;
  /** En dollars. */
  cout: number;
  appels: number;
  entree: number;
  sortie: number;
  /** Les bulles écrites et montrées. */
  repliques: number;
  /** Les phrases de Claude écartées par le contrôle du robot avant l'envoi. */
  ecartees: number;
}

const nombreLu = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function lireDepense(v: unknown): DepenseDuMois | null {
  if (!estObjet(v) || typeof v["mois"] !== "string") return null;
  const lus = (["cout", "appels", "entree", "sortie", "repliques", "ecartees"] as const).map((c) => nombreLu(v[c]));
  if (lus.some((n) => n === null || n < 0)) return null;
  const [cout, appels, entree, sortie, repliques, ecartees] = lus as number[];
  return { mois: v["mois"], cout: cout!, appels: appels!, entree: entree!, sortie: sortie!, repliques: repliques!, ecartees: ecartees! };
}

/** La réponse de `get_vie_du_village`, relue ; `null` si elle n'a pas la forme attendue. */
export function lireVieDuVillage(reponse: unknown): VieDuVillage | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const plafond = nombreLu(reponse["plafond"]);
  const prix = estObjet(reponse["prix"]) ? { entree: nombreLu(reponse["prix"]["entree"]), sortie: nombreLu(reponse["prix"]["sortie"]) } : null;
  const depense = lireDepense(reponse["depense"]);
  const affichees = nombreLu(reponse["bulles_affichees"]);
  if (typeof reponse["bulles"] !== "boolean" || plafond === null || typeof reponse["plafond_atteint"] !== "boolean" || typeof reponse["modele"] !== "string") return null;
  if (!prix || prix.entree === null || prix.sortie === null || typeof reponse["mois"] !== "string" || !depense || affichees === null) return null;
  if (!Array.isArray(reponse["historique"])) return null;
  const historique = reponse["historique"].map(lireDepense);
  if (historique.some((d) => d === null)) return null;
  const texte = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    ok: true,
    bulles: reponse["bulles"],
    plafond,
    plafond_atteint: reponse["plafond_atteint"],
    modele: reponse["modele"],
    prix: { entree: prix.entree, sortie: prix.sortie },
    mois: reponse["mois"],
    depense,
    historique: historique as DepenseDuMois[],
    bulles_affichees: affichees,
    dernier_vocal: texte(reponse["dernier_vocal"]),
    derniere_bulle: texte(reponse["derniere_bulle"]),
  };
}

/** Le plafond le plus haut que l'encadrement peut régler, en dollars (le pilote : « +50 € par mois » au plus). */
export const PLAFOND_MAX = 100;

/** Un plafond saisi, tel que le serveur l'accepte : de 0 à `PLAFOND_MAX` dollars, au centime. `null` sinon. */
export function lirePlafond(saisie: string): number | null {
  const propre = saisie.trim().replace(",", ".");
  if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(propre)) return null;
  const valeur = Number(propre);
  return valeur >= 0 && valeur <= PLAFOND_MAX ? valeur : null;
}
