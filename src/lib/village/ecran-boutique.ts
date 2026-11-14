/**
 * Les calculs de l'écran « Mon Gaulois » du village (bourse, boutique, pochette surprise) : la lecture prudente de ce que
 * répond le serveur, ce qu'un objet coûte et ce qui manque pour l'acheter, et les mots de chaque refus. Le serveur décide
 * de tout (`contrat.ts`) : rien ici n'accorde un achat, l'écran ne fait que dire ce qu'il a reçu.
 *
 * Une réponse illisible vaut « pas de réponse » (`null`), jamais zéro : l'écran garde alors le vestiaire seul.
 */
import { errorMessage } from "../compte/errors";
import { EMPLACEMENTS_OBJETS, OBJETS, ORDRE_RARETES, RARETES, type Emplacement, type Objet, type Rarete, type Tenue } from "../gaulois";
import { parisParts } from "../time";
import type { MesStateres } from "../stateres";
import type { AchatReponse, MaBoutique, ObjetPossede, PochetteReponse, RefObjet } from "./contrat";

/** L'espace insécable, entre un nombre et son unité, et l'espace fine des milliers. */
const NBSP = String.fromCharCode(0xa0);
const FINE = String.fromCharCode(0x202f);

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** Un entier positif ou nul, tel qu'un solde, un prix ou une quantité. */
const entier = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
const date = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

/** Un nombre par rareté, toutes présentes. `valide` dit ce qu'un nombre doit être. */
function parRarete(v: unknown, valide: (n: number) => boolean): Record<Rarete, number> | null {
  if (!estObjet(v)) return null;
  const lu = {} as Record<Rarete, number>;
  for (const rarete of ORDRE_RARETES) {
    const n = v[rarete];
    if (typeof n !== "number" || !Number.isFinite(n) || !valide(n)) return null;
    lu[rarete] = n;
  }
  return lu;
}

/** L'objet du catalogue que désigne une réponse, s'il existe et se vend : un gratuit ou un inconnu ne compte pas. */
export function objetPayant(emplacement: unknown, id: unknown): (RefObjet & { fiche: Objet & { rarete: Rarete } }) | null {
  if (typeof emplacement !== "string" || typeof id !== "string") return null;
  if (!(EMPLACEMENTS_OBJETS as readonly string[]).includes(emplacement)) return null;
  const catalogue = OBJETS[emplacement as Emplacement];
  const fiche = Object.hasOwn(catalogue, id) ? catalogue[id] : undefined;
  if (!fiche || fiche.gratuit || fiche.rarete === null) return null;
  return { emplacement: emplacement as Emplacement, objet: id, fiche: fiche as Objet & { rarete: Rarete } };
}

const ORIGINES = ["achat", "pochette", "marche"] as const;

/** Une ligne de l'inventaire : ignorée si l'objet n'est pas au catalogue ou si la quantité n'est pas un entier d'au moins 1. */
function lireLigne(v: unknown): ObjetPossede | null {
  if (!estObjet(v)) return null;
  const ref = objetPayant(v["emplacement"], v["objet"]);
  const quantite = entier(v["quantite"]);
  if (!ref || quantite === null || quantite < 1) return null;
  const origine = ORIGINES.find((o) => o === v["origine"]) ?? "achat";
  return { emplacement: ref.emplacement, objet: ref.objet, quantite, origine, acquis_le: date(v["acquis_le"]) ?? "" };
}

/** `get_ma_boutique` : `null` si le solde, un prix ou une chance manque. Une ligne d'inventaire illisible est seulement ignorée. */
export function lireBoutique(reponse: unknown): MaBoutique | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const solde = entier(reponse["solde"]);
  const prix = parRarete(reponse["prix"], (n) => Number.isSafeInteger(n) && n > 0);
  const pochette = reponse["pochette"];
  if (solde === null || !prix || !estObjet(pochette)) return null;
  const prixPochette = entier(pochette["prix"]);
  const chances = parRarete(pochette["chances"], (n) => n >= 0 && n <= 100);
  if (prixPochette === null || prixPochette < 1 || !chances) return null;
  const lignes = Array.isArray(reponse["inventaire"]) ? reponse["inventaire"] : [];
  return {
    ok: true,
    solde,
    peut_acheter: reponse["peut_acheter"] === true,
    prix,
    pochette: { prix: prixPochette, chances },
    inventaire: lignes.map(lireLigne).filter((ligne): ligne is ObjetPossede => ligne !== null),
  };
}

/** `get_mes_stateres` : `null` si le solde manque. Un crédit illisible est ignoré. */
export function lireStateres(reponse: unknown): MesStateres | null {
  if (!estObjet(reponse) || reponse["ok"] !== true) return null;
  const solde = entier(reponse["solde"]);
  if (solde === null) return null;
  const credits: MesStateres["credits"] = [];
  for (const c of Array.isArray(reponse["credits"]) ? reponse["credits"] : []) {
    if (!estObjet(c)) continue;
    const debut = date(c["debut"]);
    const stateres = entier(c["stateres"]);
    const points = c["points"];
    if (!debut || stateres === null || typeof points !== "number" || !Number.isFinite(points)) continue;
    credits.push({ partie: typeof c["partie"] === "string" ? c["partie"] : "", debut, points, gaulois: entier(c["gaulois"]) ?? 0, stateres, regle: typeof c["regle"] === "string" ? c["regle"] : "" });
  }
  return {
    ok: true,
    valide: reponse["valide"] === true,
    lie: reponse["lie"] === true,
    gaulois: reponse["gaulois"] === true,
    depart: date(reponse["depart"]),
    solde,
    credits,
    releve: date(reponse["releve"]),
    regle: typeof reponse["regle"] === "string" ? reponse["regle"] : "",
  };
}

/** `acheter_objet` : le nouveau solde et l'objet acheté. */
export function lireAchat(reponse: unknown): AchatReponse | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !estObjet(reponse["objet"])) return null;
  const solde = entier(reponse["solde"]);
  const ref = objetPayant(reponse["objet"]["emplacement"], reponse["objet"]["objet"]);
  if (solde === null || !ref) return null;
  return { ok: true, solde, objet: { emplacement: ref.emplacement, objet: ref.objet } };
}

/**
 * `ouvrir_pochette` : le nouveau solde et l'objet tiré. La rareté montrée est celle du catalogue, que le serveur partage ;
 * `double` vient du serveur seul.
 */
export function lirePochette(reponse: unknown): PochetteReponse | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !estObjet(reponse["objet"])) return null;
  const solde = entier(reponse["solde"]);
  const ref = objetPayant(reponse["objet"]["emplacement"], reponse["objet"]["objet"]);
  if (solde === null || !ref) return null;
  return { ok: true, solde, objet: { emplacement: ref.emplacement, objet: ref.objet, rarete: ref.fiche.rarete, double: reponse["objet"]["double"] === true } };
}

/** Combien d'exemplaires d'un objet sont dans l'inventaire : 0 s'il n'y est pas. */
export function quantitePossedee(inventaire: readonly ObjetPossede[], emplacement: Emplacement, id: string): number {
  return inventaire.reduce((somme, ligne) => (ligne.emplacement === emplacement && ligne.objet === id ? somme + ligne.quantite : somme), 0);
}

/** L'inventaire après un achat ou une pochette : un exemplaire de plus, sans attendre la relecture du serveur. */
export function avecUnExemplaire(inventaire: readonly ObjetPossede[], ref: RefObjet, origine: ObjetPossede["origine"], quand: string): ObjetPossede[] {
  const deja = inventaire.some((l) => l.emplacement === ref.emplacement && l.objet === ref.objet);
  if (!deja) return [...inventaire, { emplacement: ref.emplacement, objet: ref.objet, quantite: 1, origine, acquis_le: quand }];
  return inventaire.map((l) => (l.emplacement === ref.emplacement && l.objet === ref.objet ? { ...l, quantite: l.quantite + 1, origine, acquis_le: quand } : l));
}

/** Le prix d'un objet à la boutique, d'après les prix reçus du serveur. `null` : il ne se vend pas, ou les prix manquent. */
export function prixDeLObjet(prix: Readonly<Record<Rarete, number>> | null | undefined, emplacement: Emplacement, id: string): number | null {
  const ref = objetPayant(emplacement, id);
  return ref && prix ? (prix[ref.fiche.rarete] ?? null) : null;
}

/** Les statères qui manquent pour payer : 0 quand le solde suffit. */
export const manque = (solde: number, prix: number): number => Math.max(0, prix - solde);

/**
 * Les objets que le membre a lui-même mis en vente au marché, lus dans `get_marche` (ses offres `a_moi`). Sortis de son
 * inventaire jusqu'à la fin de l'offre, ils ne s'achètent pas pour autant à la boutique : le serveur répond `deja_possede`.
 * Une réponse illisible, ou un refus, ne donne rien : l'écran ne devine pas.
 */
export function objetsEnVente(reponse: unknown): RefObjet[] {
  if (!estObjet(reponse) || reponse["ok"] !== true || !Array.isArray(reponse["offres"])) return [];
  const liste: RefObjet[] = [];
  for (const offre of reponse["offres"] as unknown[]) {
    if (!estObjet(offre) || offre["a_moi"] !== true) continue;
    const ref = objetPayant(offre["emplacement"], offre["objet"]);
    if (ref && !estEnVente(liste, ref.emplacement, ref.objet)) liste.push({ emplacement: ref.emplacement, objet: ref.objet });
  }
  return liste;
}

/** Cet objet est-il dans les objets que le membre a en vente ? */
export const estEnVente = (enVente: readonly RefObjet[], emplacement: Emplacement, id: string): boolean => enVente.some((r) => r.emplacement === emplacement && r.objet === id);

/** Ce que dit l'essayage d'un objet que le membre a en vente au marché. */
export const RAISON_EN_VENTE = "Vous l'avez mis en vente au marché.";

/** Les objets d'une tenue qui ne sont ni gratuits ni dans l'inventaire : le serveur refuserait de l'enregistrer. */
export function objetsNonPossedes(tenue: Tenue, inventaire: readonly ObjetPossede[]): RefObjet[] {
  return EMPLACEMENTS_OBJETS.flatMap((emplacement) => {
    const id = tenue[emplacement] ?? "";
    return objetPayant(emplacement, id) && quantitePossedee(inventaire, emplacement, id) === 0 ? [{ emplacement, objet: id }] : [];
  });
}

/** Un nombre entier à la française : 2 500 s'écrit avec une espace fine, qui ne se coupe pas. */
export function nombre(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, FINE);
}

/**
 * Le mot qui suit un nombre de statères, avec la règle du site (`fmtCount` de `format.ts`) : le pluriel à partir de 2,
 * « 0 statère », « 1 statère », « 2 statères ». Une seule écriture partout dans le village.
 */
export const motStatere = (n: number): string => (n > 1 ? "statères" : "statère");

/** « 0 statère », « 1 statère », « 250 statères ». */
export const stateres = (n: number): string => `${nombre(n)}${NBSP}${motStatere(n)}`;

/** « 2 exemplaires » : le nombre d'exemplaires d'un objet possédé, en mots (règle du pilote : pas de « × 2 »). */
export const exemplaires = (n: number): string => `${nombre(n)}${NBSP}${n > 1 ? "exemplaires" : "exemplaire"}`;

/** Les points d'une partie, à la française : 1,67. */
export const points = (n: number): string => String(Math.round(n * 100) / 100).replace(".", ",");

/** Une chance en pour cent, à la française : « 50 % », « 0,5 % ». */
export const pourcent = (n: number): string => `${String(Math.round(n * 100) / 100).replace(".", ",")}${NBSP}%`;

/** Les chances de la pochette, de la rareté la plus courante à la plus rare, avec le nom et le rang de chacune. */
export function chancesDeLaPochette(chances: Readonly<Record<Rarete, number>>): { rarete: Rarete; nom: string; rang: number; chance: number }[] {
  return ORDRE_RARETES.map((rarete) => ({ rarete, nom: RARETES[rarete].nom, rang: RARETES[rarete].rang, chance: chances[rarete] }));
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Un jour à Paris : « 13 novembre », « 1er mars ». */
export function jour(iso: string): string {
  const [, mois, j] = parisParts(iso).date.split("-").map(Number);
  return `${j === 1 ? "1er" : String(j)} ${MOIS[(mois ?? 1) - 1] ?? ""}`;
}

/** Un instant à Paris : « 13 novembre à 21 h 05 ». */
export function instant(iso: string): string {
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const lu = (type: string): string => heure.find((p) => p.type === type)?.value ?? "00";
  return `${jour(iso)} à ${Number(lu("hour"))}${NBSP}h${NBSP}${lu("minute")}`;
}

/**
 * Où en est la bourse d'un compte, dans l'ordre de ce qu'il peut faire lui-même : créer son Gaulois, attendre sa
 * validation, faire relier son joueur OpenFront. `jamais-relu` : tout est en ordre, mais le serveur n'a encore relu aucune
 * partie. `prete` : le solde se lit tel quel.
 */
export type EtatBourse = "sans-gaulois" | "pas-valide" | "pas-lie" | "jamais-relu" | "prete";

export function etatDeLaBourse(s: Pick<MesStateres, "valide" | "lie" | "gaulois" | "releve">): EtatBourse {
  if (!s.gaulois) return "sans-gaulois";
  if (!s.valide) return "pas-valide";
  if (!s.lie) return "pas-lie";
  return s.releve === null ? "jamais-relu" : "prete";
}

/** Ce que la bourse dit de chaque état, en peu de mots : quoi faire. Rien quand elle est prête. */
export const MESSAGES_BOURSE: Readonly<Record<EtatBourse, string | null>> = {
  "sans-gaulois": "Créez votre Gaulois pour recevoir des statères.",
  "pas-valide": "Vos statères arriveront quand un officier aura validé votre compte.",
  "pas-lie": "Votre compte n'est relié à aucun joueur OpenFront : demandez à un officier de le relier.",
  "jamais-relu": "Vos parties n'ont pas encore été relues.",
  prete: null,
};

/**
 * Le solde à écrire, ou `null` quand il ne se sait pas encore. Un zéro n'est une vérité que si les parties ont été relues
 * pour un compte qui peut recevoir des statères ; un solde positif se montre toujours.
 */
export function soldeAMontrer(s: Pick<MesStateres, "valide" | "lie" | "gaulois" | "releve" | "solde">): number | null {
  return s.solde > 0 || etatDeLaBourse(s) === "prete" ? s.solde : null;
}

/** Ce que les deux bourses, « Mon Gaulois » et le marché, écrivent à la place d'un solde qui ne se sait pas encore. */
export const SOLDE_INCONNU = "Pas encore de statères comptés";

/**
 * Le solde à écrire au marché, avec la règle de la bourse de « Mon Gaulois » (`soldeAMontrer`) : le solde que le marché
 * vient de lire, et l'état de la bourse (`get_mes_stateres`). Sans cet état, un solde nul ne s'écrit pas : « pas de
 * données » n'est pas zéro.
 */
export function soldeDuMarche(solde: number, bourse: Pick<MesStateres, "valide" | "lie" | "gaulois" | "releve"> | null): number | null {
  if (bourse === null) return solde > 0 ? solde : null;
  return soldeAMontrer({ ...bourse, solde });
}

/**
 * Les mots de chaque refus de la boutique (`RefusBoutique`). Les autres refus gardent leur message de `errors.ts`.
 * `manque` : les statères qui manquent, quand l'écran le sait.
 */
export function messageDuRefus(code: string, contexte: { manque?: number | null } = {}): string {
  switch (code) {
    case "not_validated":
      return "La boutique s'ouvre quand un officier a validé votre compte.";
    case "no_gaulois":
      return "Créez d'abord votre Gaulois : la boutique s'ouvre ensuite.";
    case "unknown_objet":
      return "Cet objet n'est plus à la boutique. Rechargez la page.";
    case "objet_gratuit":
      return "Cet objet est gratuit : il se porte sans l'acheter.";
    case "deja_possede":
      return "Vous avez déjà cet objet : il ne s'achète pas deux fois à la boutique.";
    case "solde_insuffisant":
      return contexte.manque ? `Il vous manque ${stateres(contexte.manque)}.` : "Vous n'avez pas assez de statères.";
    default:
      return errorMessage(code);
  }
}

/** Pourquoi la boutique ne s'ouvre pas à ce compte (`peut_acheter` faux), d'après ce que l'écran sait de lui. */
export function raisonBoutiqueFermee(gauloisCree: boolean): string {
  return messageDuRefus(gauloisCree ? "not_validated" : "no_gaulois");
}
