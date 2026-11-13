/**
 * La boutique et la pochette surprise du village (docs/DIRECTION.md, « Le village des Gaulois », lot 3), côté site : des
 * calculs purs, sans rien de Node, pour l'écran du village. Le serveur décide de tout (migration
 * `20261113001900_village_boutique.sql`) : les prix, le solde, le tirage de la pochette. Ici, la lecture prudente de ses
 * réponses (formes de `contrat.ts`) et ce que l'écran en déduit : le prix d'un objet, ce qui manque pour l'acheter, les
 * chances de la pochette et ce qu'elle vaut en moyenne. Les formules de la pochette sont celles de la mesure de l'économie
 * (`economie.ts`), appliquées aux chances réelles du tirage.
 */
import { EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, type Emplacement, type Objet, type Rarete } from "../gaulois";
import type { AchatReponse, MaBoutique, ObjetPossede, PochetteReponse, RefObjet } from "./contrat";
import { objetsParRarete, valeurMoyennePochette } from "./economie";

/** Le catalogue des objets, celui du dessin (`OBJETS`) ; un autre seulement dans les tests. */
export type Catalogue = Readonly<Record<Emplacement, Readonly<Record<string, Objet>>>>;

/** Une valeur par rareté : un prix en statères, ou une chance en pour cent. */
type Valeurs = Readonly<Record<Rarete, number>>;

const ORIGINES: readonly ObjetPossede["origine"][] = ["achat", "pochette", "marche"];

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const aCle = (objet: object, cle: string): boolean => Object.prototype.hasOwnProperty.call(objet, cle);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const estEmplacementObjet = (valeur: unknown): valeur is (typeof EMPLACEMENTS_OBJETS)[number] =>
  typeof valeur === "string" && (EMPLACEMENTS_OBJETS as readonly string[]).includes(valeur);

/**
 * L'objet payant du catalogue désigné par son emplacement et son identifiant, avec sa rareté ; `null` pour un objet gratuit,
 * sans rareté (le corps, les cases « rien »), inconnu ou hors des cinq emplacements d'objets.
 */
export function objetPayant(emplacement: unknown, objet: unknown, catalogue: Catalogue = OBJETS): (Objet & { rarete: Rarete }) | null {
  if (!estEmplacementObjet(emplacement) || typeof objet !== "string") return null;
  const liste = catalogue[emplacement];
  if (!aCle(liste, objet)) return null;
  const trouve = liste[objet];
  if (!trouve || trouve.gratuit || trouve.rarete === null) return null;
  return trouve as Objet & { rarete: Rarete };
}

/** Le prix d'un objet à la boutique : celui de sa rareté, tel que le serveur l'a donné ; `null` pour un objet qui ne s'achète pas. */
export function prixDeLObjet(emplacement: Emplacement, objet: string, prix: Valeurs, catalogue: Catalogue = OBJETS): number | null {
  const trouve = objetPayant(emplacement, objet, catalogue);
  return trouve ? prix[trouve.rarete] : null;
}

/** Les statères qui manquent pour payer `prix` avec `solde` : 0 quand le solde suffit. */
export function manquePourAcheter(solde: number, prix: number): number {
  return Math.max(0, prix - solde);
}

/** Le nombre d'exemplaires de cet objet dans l'inventaire : 0 s'il n'y est pas. */
export function quantitePossedee(inventaire: readonly ObjetPossede[], emplacement: Emplacement, objet: string): number {
  return inventaire.find((ligne) => ligne.emplacement === emplacement && ligne.objet === objet)?.quantite ?? 0;
}

/** Les objets payants d'une rareté, ceux que la pochette peut donner quand elle tire cette rareté, dans l'ordre du catalogue. */
export function objetsDeLaPochette(rarete: Rarete, catalogue: Catalogue = OBJETS): RefObjet[] {
  return objetsParRarete(catalogue)[rarete].map(({ emplacement, objet }) => ({ emplacement: emplacement as Emplacement, objet }));
}

/**
 * Les chances réelles de la pochette, en pour cent, par rareté : celles du serveur, sauf qu'une rareté sans aucun objet
 * payant est sautée et que les autres se partagent ses chances à proportion, comme le fait le tirage (`ouvrir_pochette`).
 * Aujourd'hui chaque rareté a des objets payants : ce sont les chances reçues. `null` si aucune rareté ne peut sortir.
 */
export function chancesEffectives(chances: Valeurs, catalogue: Catalogue = OBJETS): Record<Rarete, number> | null {
  const rangs = objetsParRarete(catalogue);
  const possibles = ORDRE_RARETES.filter((rarete) => chances[rarete] > 0 && rangs[rarete].length > 0);
  const total = possibles.reduce((somme, rarete) => somme + chances[rarete], 0);
  if (!(total > 0)) return null;
  const effectives = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, 0])) as Record<Rarete, number>;
  for (const rarete of possibles) effectives[rarete] = (chances[rarete] * 100) / total;
  return effectives;
}

/** La chance, en pour cent, que la pochette donne cet objet précis : celle de sa rareté, partagée à égalité entre ses objets payants. */
export function chanceDeLObjet(emplacement: Emplacement, objet: string, chances: Valeurs, catalogue: Catalogue = OBJETS): number {
  const trouve = objetPayant(emplacement, objet, catalogue);
  const effectives = chancesEffectives(chances, catalogue);
  if (!trouve || !effectives) return 0;
  return effectives[trouve.rarete] / objetsDeLaPochette(trouve.rarete, catalogue).length;
}

/**
 * Ce que vaut en moyenne une pochette, au prix de la boutique, d'après les chances reçues et le catalogue : la valeur de la
 * mesure de l'économie (`valeurMoyennePochette` de `economie.ts` : pour chaque rareté, sa chance fois son prix), calculée
 * sur les chances réelles du tirage (`chancesEffectives`). Un double compte comme un objet, au prix de la boutique, même s'il
 * ne se vend qu'au marché, au prix que choisit son vendeur. `null` si rien ne peut sortir.
 */
export function valeurMoyenneDeLaPochette(chances: Valeurs, prix: Valeurs, catalogue: Catalogue = OBJETS): number | null {
  const effectives = chancesEffectives(chances, catalogue);
  return effectives ? valeurMoyennePochette(effectives, prix) : null;
}

/** Les cinq prix par rareté : chacun un entier d'au moins 1 statère, sinon `null`. Une rareté inconnue est ignorée. */
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

/** Les cinq chances, chacune de 0 à 100 pour cent, 100 en tout ; sinon `null`. Une rareté inconnue est ignorée. */
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

/** Une ligne de l'inventaire : un objet payant du catalogue, une quantité, une origine et une date lisibles ; sinon `null`. */
function lireObjetPossede(valeur: unknown, catalogue: Catalogue): ObjetPossede | null {
  if (!estObjetJson(valeur)) return null;
  const { emplacement, objet, quantite, origine, acquis_le } = valeur;
  if (!estEmplacementObjet(emplacement) || typeof objet !== "string" || !objetPayant(emplacement, objet, catalogue)) return null;
  if (!entier(quantite, 1)) return null;
  if (typeof origine !== "string" || !(ORIGINES as readonly string[]).includes(origine)) return null;
  if (typeof acquis_le !== "string" || !Number.isFinite(Date.parse(acquis_le))) return null;
  return { emplacement, objet, quantite, origine: origine as ObjetPossede["origine"], acquis_le };
}

/**
 * La réponse de `get_ma_boutique`, vérifiée : `null` si le solde, `peut_acheter`, les prix ou la pochette sont illisibles
 * (l'écran dit alors que la boutique ne répond pas, plutôt que d'afficher des prix faux). Dans l'inventaire, une ligne
 * illisible, un objet inconnu ou gratuit, ou un objet déjà lu, sont écartés : le reste se montre.
 */
export function lireMaBoutique(reponse: unknown, catalogue: Catalogue = OBJETS): MaBoutique | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const solde = reponse["solde"];
  const peutAcheter = reponse["peut_acheter"];
  if (!entier(solde, 0) || typeof peutAcheter !== "boolean") return null;
  const prix = lirePrix(reponse["prix"]);
  const pochette = reponse["pochette"];
  if (!prix || !estObjetJson(pochette)) return null;
  const prixPochette = pochette["prix"];
  const chances = lireChances(pochette["chances"]);
  if (!entier(prixPochette, 1) || !chances) return null;
  const lignes = reponse["inventaire"];
  if (!Array.isArray(lignes)) return null;
  const inventaire: ObjetPossede[] = [];
  const vus = new Set<string>();
  for (const ligne of lignes) {
    const lue = lireObjetPossede(ligne, catalogue);
    const cle = lue ? `${lue.emplacement}/${lue.objet}` : "";
    if (!lue || vus.has(cle)) continue;
    vus.add(cle);
    inventaire.push(lue);
  }
  return { ok: true, solde, peut_acheter: peutAcheter, prix, pochette: { prix: prixPochette, chances }, inventaire };
}

/** La réponse de `acheter_objet`, vérifiée : l'objet acheté doit être un objet payant du catalogue ; sinon `null`. */
export function lireAchat(reponse: unknown, catalogue: Catalogue = OBJETS): AchatReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0)) return null;
  const objet = reponse["objet"];
  if (!estObjetJson(objet) || !estEmplacementObjet(objet["emplacement"]) || typeof objet["objet"] !== "string") return null;
  if (!objetPayant(objet["emplacement"], objet["objet"], catalogue)) return null;
  return { ok: true, solde: reponse["solde"], objet: { emplacement: objet["emplacement"], objet: objet["objet"] } };
}

/**
 * La réponse de `ouvrir_pochette`, vérifiée : un objet payant du catalogue, avec la rareté que le catalogue lui donne, et
 * `double` vrai ou faux ; sinon `null`.
 */
export function lirePochette(reponse: unknown, catalogue: Catalogue = OBJETS): PochetteReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0)) return null;
  const objet = reponse["objet"];
  if (!estObjetJson(objet) || !estEmplacementObjet(objet["emplacement"]) || typeof objet["objet"] !== "string") return null;
  const trouve = objetPayant(objet["emplacement"], objet["objet"], catalogue);
  if (!trouve || objet["rarete"] !== trouve.rarete || typeof objet["double"] !== "boolean") return null;
  return {
    ok: true,
    solde: reponse["solde"],
    objet: { emplacement: objet["emplacement"], objet: objet["objet"], rarete: trouve.rarete, double: objet["double"] },
  };
}
