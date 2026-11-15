/**
 * Les familiers du Gaulois côté site (contrat : `contrat.ts`, « Les familiers du Gaulois » ; serveur : migration
 * 20261115000800_familiers_du_gaulois ; dessins : `supabase/functions/code-discord/familiers/`). Des calculs purs, sans
 * rien de Node : la lecture prudente des réponses du serveur, les chances réelles de la pochette pour un compte (qui ne
 * reçoit jamais un familier qu'il a déjà), et ce que l'écran en déduit. Le serveur décide de tout : le prix, le solde, le
 * tirage, le familier montré.
 */
import { familierAPoser, gauloisEtFamilier, tailleDuFamilier, TAILLES, type Familier, type FamilierAPoser, type Taille } from "../../../supabase/functions/code-discord/familiers/familier";
import { FAMILIERS, FAMILLES, familierDe } from "../../../supabase/functions/code-discord/familiers/index";
import { casesDuGaulois, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, ORDRE_RARETES, RARETES, type Rarete, type Tenue } from "../gaulois";
import { errorMessage } from "../compte/errors";
import type { ChoixFamilierReponse, FamilierPossede, MesFamiliers, PochetteFamiliersReponse } from "./contrat";

export { FAMILIERS, FAMILLES, familierDe, familierAPoser, tailleDuFamilier, TAILLES, type Familier, type FamilierAPoser, type Taille };

type Valeurs = Readonly<Record<Rarete, number>>;

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const estRarete = (valeur: unknown): valeur is Rarete => typeof valeur === "string" && (ORDRE_RARETES as readonly string[]).includes(valeur);

/** Le nombre de familiers de chaque rareté dans la liste. */
export function familiersParRarete(liste: readonly Familier[] = FAMILIERS): Record<Rarete, number> {
  const compte = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const familier of liste) compte[familier.rarete]++;
  return compte;
}

/** Les familiers qu'un compte n'a pas encore, par rareté : ceux que la pochette peut encore lui donner. */
export function restantsParRarete(possedes: ReadonlySet<string>, liste: readonly Familier[] = FAMILIERS): Record<Rarete, number> {
  return familiersParRarete(liste.filter((familier) => !possedes.has(familier.id)));
}

/**
 * Les chances réelles de la pochette des familiers pour ce compte, en pour cent, par rareté : celles du serveur, sauf qu'une
 * rareté où il a déjà tout est sautée et que les autres se partagent ses chances à proportion, comme le fait le tirage.
 * `null` s'il n'y a plus rien à recevoir (ou plus aucune chance).
 */
export function chancesPourMoi(chances: Valeurs, possedes: ReadonlySet<string>, liste: readonly Familier[] = FAMILIERS): Record<Rarete, number> | null {
  const restants = restantsParRarete(possedes, liste);
  const possibles = ORDRE_RARETES.filter((rarete) => chances[rarete] > 0 && restants[rarete] > 0);
  const total = possibles.reduce((somme, rarete) => somme + chances[rarete], 0);
  if (!(total > 0)) return null;
  const effectives = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const rarete of possibles) effectives[rarete] = (chances[rarete] * 100) / total;
  return effectives;
}

/** La chance, en pour cent, que la prochaine pochette donne ce familier à ce compte : 0 s'il l'a déjà. */
export function chanceDuFamilier(id: string, chances: Valeurs, possedes: ReadonlySet<string>, liste: readonly Familier[] = FAMILIERS): number {
  const familier = liste.find((f) => f.id === id);
  if (!familier || possedes.has(id)) return 0;
  const effectives = chancesPourMoi(chances, possedes, liste);
  const restants = restantsParRarete(possedes, liste)[familier.rarete];
  return effectives && restants > 0 ? effectives[familier.rarete] / restants : 0;
}

/** Les statères qui manquent pour ouvrir une pochette : 0 quand le solde suffit. */
export const manquePourOuvrir = (solde: number, prix: number): number => Math.max(0, prix - solde);

/** Le nom d'une rareté, au féminin d'un « familier » : « Commun », « Légendaire »… */
export const nomDeLaRarete = (rarete: Rarete): string => RARETES[rarete].nom;

/** Le Gaulois et son familier sur une seule grille, pour un aperçu du site ; sans familier, le Gaulois seul. */
export function apercuAvecFamilier(tenue: Tenue, familier: Familier | null): { largeur: number; hauteur: number; cases: (string | null)[] } {
  return gauloisEtFamilier(casesDuGaulois(tenue), familier ? familierAPoser(familier) : null, GAULOIS_LARGEUR, GAULOIS_HAUTEUR);
}

/** Le texte d'un refus des familiers : `pas_possede` a ses mots ici, les autres ceux de tout le site. */
export function messageDesFamiliers(code: string): string {
  if (code === "pas_possede") return "Vous n'avez pas ce familier : il ne s'obtient que dans la pochette des familiers.";
  return errorMessage(code);
}

/** Les chances : un nombre de 0 à 100 par rareté, 100 en tout ; sinon `null`. */
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
 * La réponse de `get_mes_familiers`, vérifiée : `null` si le solde, `peut_ouvrir`, le prix ou les chances sont illisibles.
 * Un familier inconnu de ce dessin, déjà lu ou mal daté est écarté ; `porte` qui n'est pas un familier possédé et connu se
 * lit `null`.
 */
export function lireMesFamiliers(reponse: unknown, liste: readonly Familier[] = FAMILIERS): MesFamiliers | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const solde = reponse["solde"];
  const peutOuvrir = reponse["peut_ouvrir"];
  const pochette = reponse["pochette"];
  if (!entier(solde, 0) || typeof peutOuvrir !== "boolean" || !estObjetJson(pochette)) return null;
  const prix = pochette["prix"];
  const chances = lireChances(pochette["chances"]);
  if (!entier(prix, 1) || !chances) return null;
  const lignes = reponse["familiers"];
  if (!Array.isArray(lignes)) return null;
  const connus = new Set(liste.map((familier) => familier.id));
  const familiers: FamilierPossede[] = [];
  const vus = new Set<string>();
  for (const ligne of lignes) {
    if (!estObjetJson(ligne)) continue;
    const { familier, acquis_le } = ligne;
    if (typeof familier !== "string" || !connus.has(familier) || vus.has(familier)) continue;
    if (typeof acquis_le !== "string" || !Number.isFinite(Date.parse(acquis_le))) continue;
    vus.add(familier);
    familiers.push({ familier, acquis_le });
  }
  const porte = reponse["porte"];
  return {
    ok: true,
    solde,
    peut_ouvrir: peutOuvrir,
    pochette: { prix, chances },
    familiers,
    porte: typeof porte === "string" && vus.has(porte) ? porte : null,
  };
}

/** La réponse de `ouvrir_pochette_familiers`, vérifiée : un familier connu, avec la rareté que la liste lui donne ; sinon `null`. */
export function lirePochetteFamiliers(reponse: unknown, liste: readonly Familier[] = FAMILIERS): PochetteFamiliersReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0) || !entier(reponse["reste"], 0)) return null;
  const recu = reponse["familier"];
  if (!estObjetJson(recu) || typeof recu["familier"] !== "string" || !estRarete(recu["rarete"])) return null;
  const familier = liste.find((f) => f.id === recu["familier"]);
  if (!familier || familier.rarete !== recu["rarete"]) return null;
  return { ok: true, solde: reponse["solde"], familier: { familier: familier.id, rarete: familier.rarete }, reste: reponse["reste"] };
}

/** La réponse de `choisir_familier`, vérifiée : un familier connu, ou `null` (aucun) ; sinon `null` pour toute la réponse. */
export function lireChoixFamilier(reponse: unknown, liste: readonly Familier[] = FAMILIERS): ChoixFamilierReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !("porte" in reponse)) return null;
  const porte = reponse["porte"];
  if (porte === null) return { ok: true, porte: null };
  return typeof porte === "string" && liste.some((f) => f.id === porte) ? { ok: true, porte } : null;
}
