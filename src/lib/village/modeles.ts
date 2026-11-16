/**
 * Les Gaulois uniques côté site (contrat : `contrat.ts`, « Les Gaulois uniques » ; serveur : migration
 * 20261115001000_gaulois_uniques ; dessins : `supabase/functions/code-discord/modeles/`). Des calculs purs, sans rien de
 * Node : la lecture prudente des réponses du serveur, ce que l'écran déduit de ce qu'il a reçu (l'état d'un modèle, les
 * chances réelles de la pochette pour ce compte, la raison d'un achat impossible) et les dessins d'aperçu. Le serveur décide
 * de tout : le prix, le solde, l'achat, le tirage, et ce que la tenue peut porter.
 *
 * Le modèle porté est la clé `modele` de la tenue : pour le porter, l'écran enregistre la tenue (`enregistrer_mon_gaulois`,
 * avec `tenueAvecModele`), comme pour un objet ; le serveur vérifie que le compte le possède.
 */
import { FAMILLES_DES_MODELES, MODELES, RARETES_DES_MODELES, modeleParId, type ModeleRange } from "../../../supabase/functions/code-discord/modeles/index";
import { errorMessage } from "../compte/errors";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, ORDRE_RARETES, RARETES, TENUE_NUE, casesDuGaulois, changerModele, modeleDuGaulois, type Rarete, type Tenue } from "../gaulois";
import type { AchatModeleReponse, MesModeles, ModelePossede, PochetteModelesReponse } from "./contrat";
import { manque, messageDuRefus, stateres } from "./ecran-boutique";

export { FAMILLES_DES_MODELES, MODELES, RARETES_DES_MODELES, modeleParId, type ModeleRange };

type Valeurs = Readonly<Record<Rarete, number>>;

/** L'ancre de la section des Gaulois uniques dans « La boutique » : `/village#gaulois-uniques` ouvre l'onglet et y descend. */
export const ANCRE_MODELES = "gaulois-uniques";

/** L'adresse demande-t-elle les Gaulois uniques ? */
export const demandeLesModeles = (hash: string): boolean => hash === `#${ANCRE_MODELES}`;

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const estRarete = (valeur: unknown): valeur is Rarete => typeof valeur === "string" && (ORDRE_RARETES as readonly string[]).includes(valeur);

/** Le texte d'un refus propre aux Gaulois uniques ; les autres ont ceux de tout le site. */
export function messageDesModeles(code: string): string {
  if (code === "deja_possede") return "Vous avez déjà ce Gaulois unique.";
  if (code === "tout_possede") return "Vous avez déjà tous les Gaulois uniques : la pochette n'a plus rien à vous donner.";
  return errorMessage(code);
}

/** Les mots d'un refus, à la boutique comme dans la pochette. `manque` : les statères qui manquent, quand l'écran le sait. */
export function messageDuRefusDesModeles(code: string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant" || code === "not_validated" || code === "no_gaulois") return messageDuRefus(code, contexte);
  return messageDesModeles(code);
}

/** Un entier d'au moins 1 statère pour chaque rareté ; sinon `null`. */
function lirePrix(valeur: unknown): Record<Rarete, number> | null {
  if (!estObjetJson(valeur)) return null;
  const prix: Partial<Record<Rarete, number>> = {};
  for (const rarete of ORDRE_RARETES) {
    const p = valeur[rarete];
    if (!entier(p, 1)) return null;
    prix[rarete] = p;
  }
  return prix as Record<Rarete, number>;
}

/** Un nombre de 0 à 100 par rareté, 100 en tout ; sinon `null`. */
function lireChances(valeur: unknown): Record<Rarete, number> | null {
  if (!estObjetJson(valeur)) return null;
  const chances: Partial<Record<Rarete, number>> = {};
  let total = 0;
  for (const rarete of ORDRE_RARETES) {
    const c = valeur[rarete];
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 100) return null;
    chances[rarete] = c;
    total += c;
  }
  return Math.abs(total - 100) < 1e-6 ? (chances as Record<Rarete, number>) : null;
}

/**
 * La réponse de `get_mes_modeles`, vérifiée : `null` si le solde, `peut_acheter`, les prix, le prix de la pochette ou ses
 * chances sont illisibles. Un modèle inconnu de ce dessin, déjà lu ou mal daté est écarté ; `porte` qui n'est pas un
 * modèle possédé et connu se lit `null` (le corps humain).
 */
export function lireMesModeles(reponse: unknown, liste: readonly ModeleRange[] = MODELES): MesModeles | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const solde = reponse["solde"];
  const peutAcheter = reponse["peut_acheter"];
  const prix = lirePrix(reponse["prix"]);
  const pochette = reponse["pochette"];
  const lignes = reponse["modeles"];
  if (!entier(solde, 0) || typeof peutAcheter !== "boolean" || !prix || !estObjetJson(pochette) || !Array.isArray(lignes)) return null;
  const prixPochette = pochette["prix"];
  const chances = lireChances(pochette["chances"]);
  if (!entier(prixPochette, 1) || !chances) return null;
  const connus = new Set(liste.map((modele) => modele.id));
  const modeles: ModelePossede[] = [];
  const vus = new Set<string>();
  for (const ligne of lignes) {
    if (!estObjetJson(ligne)) continue;
    const { modele, acquis_le } = ligne;
    if (typeof modele !== "string" || !connus.has(modele) || vus.has(modele)) continue;
    if (typeof acquis_le !== "string" || !Number.isFinite(Date.parse(acquis_le))) continue;
    vus.add(modele);
    modeles.push({ modele, acquis_le });
  }
  const porte = reponse["porte"];
  return {
    ok: true,
    solde,
    peut_acheter: peutAcheter,
    prix,
    pochette: { prix: prixPochette, chances },
    modeles,
    porte: typeof porte === "string" && vus.has(porte) ? porte : null,
  };
}

/** Un modèle reçu, vérifié : connu, avec la rareté que la liste lui donne ; sinon `null`. */
function lireRecu(recu: unknown, liste: readonly ModeleRange[]): { modele: string; rarete: Rarete } | null {
  if (!estObjetJson(recu) || typeof recu["modele"] !== "string" || !estRarete(recu["rarete"])) return null;
  const modele = liste.find((m) => m.id === recu["modele"]);
  return modele && modele.rarete === recu["rarete"] ? { modele: modele.id, rarete: modele.rarete } : null;
}

/** La réponse de `acheter_modele`, vérifiée ; sinon `null`. */
export function lireAchatModele(reponse: unknown, liste: readonly ModeleRange[] = MODELES): AchatModeleReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0)) return null;
  const modele = lireRecu(reponse["modele"], liste);
  return modele ? { ok: true, solde: reponse["solde"], modele } : null;
}

/** La réponse de `ouvrir_pochette_modeles`, vérifiée ; sinon `null`. */
export function lirePochetteModeles(reponse: unknown, liste: readonly ModeleRange[] = MODELES): PochetteModelesReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0) || !entier(reponse["reste"], 0)) return null;
  const modele = lireRecu(reponse["modele"], liste);
  return modele ? { ok: true, solde: reponse["solde"], modele, reste: reponse["reste"] } : null;
}

/** Les identifiants des Gaulois uniques du compte. */
export const idsDesModeles = (mes: Pick<MesModeles, "modeles"> | null): ReadonlySet<string> => new Set((mes?.modeles ?? []).map((ligne) => ligne.modele));

/** Ce qu'un Gaulois unique est pour ce compte : à obtenir, à lui, ou porté. */
export type EtatDuModele = "a-obtenir" | "a-moi" | "porte";

export function etatDuModele(id: string, mes: Pick<MesModeles, "modeles" | "porte"> | null): EtatDuModele {
  if (mes?.porte === id) return "porte";
  return mes?.modeles.some((ligne) => ligne.modele === id) ? "a-moi" : "a-obtenir";
}

/** Les modèles rangés par famille, dans l'ordre de la galerie. */
export function modelesParFamille(liste: readonly ModeleRange[] = MODELES): { famille: string; modeles: ModeleRange[] }[] {
  const familles: { famille: string; modeles: ModeleRange[] }[] = [];
  for (const modele of liste) {
    const deja = familles.find((f) => f.famille === modele.famille);
    if (deja) deja.modeles.push(modele);
    else familles.push({ famille: modele.famille, modeles: [modele] });
  }
  return familles;
}

/** Le nombre de modèles de chaque rareté dans la liste. */
export function modelesParRarete(liste: readonly ModeleRange[] = MODELES): Record<Rarete, number> {
  const compte = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const modele of liste) compte[modele.rarete]++;
  return compte;
}

/** Les modèles qu'un compte n'a pas encore, par rareté : ceux que la pochette peut encore lui donner. */
export function restantsParRarete(possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): Record<Rarete, number> {
  return modelesParRarete(liste.filter((modele) => !possedes.has(modele.id)));
}

/**
 * Les chances réelles de la pochette des Gaulois uniques pour ce compte, en pour cent, par rareté : celles du serveur, sauf
 * qu'une rareté où il a déjà tout est sautée et que les autres se partagent ses chances à proportion, comme le fait le
 * tirage. `null` s'il n'y a plus rien à recevoir (ou plus aucune chance).
 */
export function chancesPourMoi(chances: Valeurs, possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): Record<Rarete, number> | null {
  const restants = restantsParRarete(possedes, liste);
  const possibles = ORDRE_RARETES.filter((rarete) => chances[rarete] > 0 && restants[rarete] > 0);
  const total = possibles.reduce((somme, rarete) => somme + chances[rarete], 0);
  if (!(total > 0)) return null;
  const effectives = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const rarete of possibles) effectives[rarete] = (chances[rarete] * 100) / total;
  return effectives;
}

/**
 * Ce qui empêche d'acheter ce modèle à ce prix, d'après ce que le serveur a dit du compte : `null` si rien. Le serveur
 * vérifie de toute façon.
 */
export function raisonDeLAchat(mes: Pick<MesModeles, "peut_acheter" | "modeles">, id: string, solde: number, prix: number): string | null {
  if (!mes.peut_acheter) return messageDuRefus("not_validated");
  if (mes.modeles.some((ligne) => ligne.modele === id)) return messageDesModeles("deja_possede");
  const reste = manque(solde, prix);
  return reste > 0 ? `Il vous manque ${stateres(reste)}.` : null;
}

/** Pourquoi ce compte ne peut pas ouvrir la pochette, dans l'ordre où le serveur refuserait ; `null` s'il le peut. */
export function raisonPochetteFermee(mes: Pick<MesModeles, "peut_acheter" | "pochette" | "modeles">, solde: number, liste: readonly ModeleRange[] = MODELES): string | null {
  if (!mes.peut_acheter) return messageDuRefus("not_validated");
  if (!chancesPourMoi(mes.pochette.chances, idsDesModeles(mes), liste)) return messageDesModeles("tout_possede");
  const reste = manque(solde, mes.pochette.prix);
  return reste > 0 ? `Il vous manque ${stateres(reste)}.` : null;
}

/** Les modèles du compte après un achat : le nouveau en tête (les plus récents d'abord), le solde du serveur. */
export function apresLAchat(mes: MesModeles, achat: AchatModeleReponse, maintenant: string): MesModeles {
  const recu = achat.modele.modele;
  return { ...mes, solde: achat.solde, modeles: [{ modele: recu, acquis_le: maintenant }, ...mes.modeles.filter((ligne) => ligne.modele !== recu)] };
}

/** Les modèles du compte après une pochette ouverte : le nouveau solde, et le modèle reçu en tête. */
export function apresLaPochette(mes: MesModeles, reponse: PochetteModelesReponse, maintenant: string): MesModeles {
  const recu = reponse.modele.modele;
  return { ...mes, solde: reponse.solde, modeles: [{ modele: recu, acquis_le: maintenant }, ...mes.modeles.filter((ligne) => ligne.modele !== recu)] };
}

/** Les modèles du compte après l'enregistrement de sa tenue : celui qu'elle porte, ou aucun. */
export const apresLaTenue = (mes: MesModeles, tenue: Tenue): MesModeles => ({ ...mes, porte: modeleDuGaulois(tenue)?.id ?? null });

/** La tenue qui porte ce Gaulois unique (`null` : le corps humain), à enregistrer par `enregistrer_mon_gaulois`. */
export const tenueAvecModele = (tenue: Tenue, id: string | null): Tenue => changerModele(tenue, id);

/** Un dessin prêt à peindre : ses cases, rangée par rangée. */
export interface DessinDuModele {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** Le Gaulois du membre avec ce modèle (`null` : le corps humain) : pour l'essayer avant de l'acheter ou de le porter. */
export function apercuDuModele(tenue: Tenue, id: string | null): DessinDuModele {
  return { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDuGaulois(tenueAvecModele(tenue, id)) };
}

/** Le modèle seul, sans cheveux, barbe ni objet ; `null` pour un modèle inconnu. */
export function modeleNu(id: string): DessinDuModele | null {
  return modeleParId(id) ? apercuDuModele(TENUE_NUE, id) : null;
}

/** La couleur de la silhouette d'un modèle encore à découvrir : l'écriture marine du site. */
export const COULEUR_SILHOUETTE = "#0a1230";

/** La silhouette d'un modèle seul, d'une seule couleur, pour la pochette : on devine la créature sans la voir. */
export function silhouetteDuModele(id: string): DessinDuModele | null {
  const nu = modeleNu(id);
  return nu ? { ...nu, cases: nu.cases.map((c) => (c ? COULEUR_SILHOUETTE : null)) } : null;
}

/** « Lézard, Gaulois unique commun » : ce qu'un lecteur d'écran entend d'un modèle. */
export function decrireLeModele(id: string): string {
  const modele = modeleParId(id);
  return modele ? `${modele.nom}, Gaulois unique ${RARETES[modele.rarete].nom.toLowerCase()}` : "";
}
