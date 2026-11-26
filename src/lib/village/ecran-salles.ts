/**
 * L'écran des salles en direct du duel (vague 2, 22 novembre 2026), sans navigateur : ce que l'écran calcule à partir de
 * l'état que rend le serveur (`EtatDesSalles` de `contrat-salles.ts`). Rien n'est décidé ici : le serveur apparie, garde
 * les mises et les cartes posées, compte le temps et partage le pot. Ici, seulement :
 * - lire sa réponse sans se fier à sa forme ;
 * - dire quel écran montrer (le hall, l'attente, le match, la fin) ;
 * - compter les secondes de la manche sur l'horloge du serveur, pas sur celle de l'appareil ;
 * - remettre le match de mon côté : moi à gauche, l'autre à droite (le moteur rend le même résultat dans les deux sens) ;
 * - dire l'issue en mots, sans signes.
 */
import { EMPLACEMENTS_DE_LA_MAIN } from "./ecran-duel";
import type { MainDuDuel, OptionsDUnCamp } from "./contrat-duel";
import { SALLES_DU_DUEL, gainDuGagnant, partDeLaCagnotte, type EtatDesSalles, type MatchDeSalle, type MiseDeSalle } from "./contrat-salles";

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estMise = (v: unknown): v is MiseDeSalle => typeof v === "number" && (SALLES_DU_DUEL as readonly number[]).includes(v);
const estDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const estMain = (v: unknown): v is MainDuDuel => estObjet(v) && EMPLACEMENTS_DE_LA_MAIN.every((e) => typeof v[e] === "string");
const estCarte = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;

/** Un match de la réponse, relu ; `null` s'il ne se lit pas. */
function lireMatch(v: unknown): MatchDeSalle | null {
  if (!estObjet(v)) return null;
  const mains = v["mains"], options = v["options"], vies = v["vies"], coups = v["coups"];
  if (!Number.isInteger(v["match"]) || !estMise(v["mise"]) || typeof v["essai"] !== "boolean" || (v["moi"] !== "a" && v["moi"] !== "b")) return null;
  if (!estObjet(mains) || !estMain(mains["a"]) || !estMain(mains["b"]) || !estObjet(options) || !estObjet(options["a"]) || !estObjet(options["b"])) return null;
  if (!Array.isArray(coups) || !coups.every((c) => Array.isArray(c) && c.length === 2 && estCarte(c[0]) && estCarte(c[1]))) return null;
  if (!estObjet(vies) || typeof vies["a"] !== "number" || typeof vies["b"] !== "number") return null;
  if (!Number.isInteger(v["manche"]) || !estDate(v["ouverte_le"]) || !estDate(v["limite"]) || typeof v["fini"] !== "boolean") return null;
  const verdict = v["verdict"];
  if (verdict !== null && verdict !== -1 && verdict !== 0 && verdict !== 1) return null;
  const fin = v["fin"];
  if (fin !== null && fin !== "combat" && fin !== "temps" && fin !== "quitte" && fin !== "ferme") return null;
  const adv = v["adversaire"];
  return {
    match: v["match"] as number,
    mise: v["mise"],
    essai: v["essai"],
    moi: v["moi"],
    adversaire: estObjet(adv) && typeof adv["nom"] === "string" ? (adv as unknown as MatchDeSalle["adversaire"]) : null,
    banniere: typeof v["banniere"] === "string" ? v["banniere"] : null,
    mains: { a: mains["a"], b: mains["b"] },
    options: { a: options["a"] as unknown as OptionsDUnCamp, b: options["b"] as unknown as OptionsDUnCamp },
    coups: coups as [number, number][],
    manche: v["manche"] as number,
    vies: { a: vies["a"], b: vies["b"] },
    pose: estCarte(v["pose"]) ? v["pose"] : null,
    adverse_pose: v["adverse_pose"] === true,
    ouverte_le: v["ouverte_le"],
    limite: v["limite"],
    fini: v["fini"],
    verdict,
    fin,
    gain: typeof v["gain"] === "number" ? v["gain"] : null,
    cagnotte: typeof v["cagnotte"] === "number" ? v["cagnotte"] : null,
    commence_le: estDate(v["commence_le"]) ? v["commence_le"] : "",
    fini_le: estDate(v["fini_le"]) ? v["fini_le"] : null,
  };
}

/** La réponse du serveur relue ; `null` si elle ne se lit pas (l'écran le dit et réessaie). */
export function lireLesSalles(brut: unknown): EtatDesSalles | null {
  if (!estObjet(brut) || brut["ok"] !== true || !Array.isArray(brut["salles"]) || !estDate(brut["maintenant"])) return null;
  const salles = brut["salles"].filter((s): s is Record<string, unknown> => estObjet(s) && estMise(s["mise"]));
  if (salles.length !== SALLES_DU_DUEL.length) return null;
  const regles = estObjet(brut["regles"]) ? brut["regles"] : {};
  const jour = estObjet(brut["jour"]) ? brut["jour"] : {};
  const cagnotte = estObjet(brut["cagnotte"]) ? brut["cagnotte"] : {};
  const attente = brut["attente"];
  const nombre = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    ok: true,
    ouvert: brut["ouvert"] === true,
    maintenant: brut["maintenant"],
    solde: nombre(brut["solde"], 0),
    salles: salles.map((s) => ({ mise: s["mise"] as MiseDeSalle, attente: s["attente"] === true, permise: s["permise"] === true })),
    regles: {
      secondes: nombre(regles["secondes"], 30),
      revelation: nombre(regles["revelation"], 4),
      part_cagnotte: nombre(regles["part_cagnotte"], 10),
      par_jour: nombre(regles["par_jour"], 10),
      meme_adversaire: nombre(regles["meme_adversaire"], 3),
    },
    jour: { jour: typeof jour["jour"] === "string" ? jour["jour"] : "", joues: nombre(jour["joues"], 0), au_plus: nombre(jour["au_plus"], 10) },
    cagnotte: { saison: typeof cagnotte["saison"] === "string" ? cagnotte["saison"] : "", nom: typeof cagnotte["nom"] === "string" ? cagnotte["nom"] : null, montant: nombre(cagnotte["montant"], 0) },
    attente: estObjet(attente) && estMise(attente["mise"]) && estMain(attente["main"]) ? { mise: attente["mise"], depuis: estDate(attente["depuis"]) ? attente["depuis"] : brut["maintenant"], main: attente["main"] } : null,
    match: lireMatch(brut["match"]),
    dernier: lireMatch(brut["dernier"]),
  };
}

/* ---------- Quel écran ---------- */

export type EcranDesSalles = { kind: "hall" } | { kind: "attente"; mise: MiseDeSalle } | { kind: "match"; match: MatchDeSalle } | { kind: "fin"; match: MatchDeSalle };

/**
 * L'écran à montrer : le match en cours d'abord, puis l'attente, puis la fin du dernier match tant qu'on ne l'a pas
 * refermée (`vus` : les numéros des fins déjà refermées sur cet écran), sinon le hall.
 */
export function ecranDesSalles(e: EtatDesSalles, vus: ReadonlySet<number>): EcranDesSalles {
  if (e.match) return { kind: "match", match: e.match };
  if (e.attente) return { kind: "attente", mise: e.attente.mise };
  if (e.dernier && !vus.has(e.dernier.match)) return { kind: "fin", match: e.dernier };
  return { kind: "hall" };
}

/** Le refus d'une salle pendant un essai du mode GOD, en clair. */
export const CADENAS_DU_MODE_GOD = "Le mode GOD est allumé : pas de mise pendant un essai. Éteins-le dans la Direction, onglet Village, pour entrer.";

/**
 * Pourquoi des salles ont un cadenas, dit en rouge sous les salles (le pilote, 26 novembre 2026 : six cadenas, rien pour
 * dire pourquoi). Le serveur ferme une salle du duel ouvert pour trois raisons (`permise` de `SalleDuDuel`) : les matchs du
 * jour joués, une mise plus haute que le solde, un essai du mode GOD. Une salle fermée alors qu'il reste des matchs et que
 * le solde couvre sa mise ne l'est donc que par le mode GOD. `null` : rien n'est fermé, le duel est en essai, ou la raison
 * est déjà à l'écran (« Cette main ne se joue plus », « Reviens demain »).
 */
export function raisonDuCadenas(e: Pick<EtatDesSalles, "ouvert" | "salles" | "jour" | "solde">, mainValide: boolean): string | null {
  if (!e.ouvert || !mainValide || e.jour.joues >= e.jour.au_plus) return null;
  const fermees = e.salles.filter((s) => !s.permise);
  if (fermees.length === 0) return null;
  if (fermees.some((s) => s.mise <= e.solde)) return CADENAS_DU_MODE_GOD;
  if (fermees.length < e.salles.length) return "Les salles au cadenas demandent plus de statères que tu n'en as.";
  return `Il te faut au moins ${stateresEnMots(Math.min(...e.salles.map((s) => s.mise)))} pour entrer dans une salle.`;
}

/* ---------- Le temps de la manche ---------- */

/** L'écart entre l'horloge du serveur et celle de l'appareil, mesuré à la réception d'une réponse (en millisecondes). */
export const ecartDHorloge = (maintenantDuServeur: string, recuLe: number): number => Date.parse(maintenantDuServeur) - recuLe;

export interface TempsDeLaManche {
  /** « revelation » : la manche précédente se montre encore ; « pose » : on peut poser ; « echu » : le temps est passé. */
  phase: "revelation" | "pose" | "echu";
  /** Les secondes entières qui restent pour poser (de 30 à 0), arrondies vers le haut. */
  secondes: number;
  /** La part du temps de pose qui reste, de 1 à 0 (le sable du sablier). */
  part: number;
}

/** Le temps de la manche en cours, à l'instant `maintenant` de l'appareil, corrigé de l'écart d'horloge. */
export function tempsDeLaManche(m: Pick<MatchDeSalle, "ouverte_le" | "limite">, maintenant: number, ecart: number): TempsDeLaManche {
  const t = maintenant + ecart;
  const ouverte = Date.parse(m.ouverte_le);
  const limite = Date.parse(m.limite);
  const duree = Math.max(1, limite - ouverte);
  if (t < ouverte) return { phase: "revelation", secondes: Math.ceil(duree / 1000), part: 1 };
  if (t >= limite) return { phase: "echu", secondes: 0, part: 0 };
  const reste = limite - t;
  return { phase: "pose", secondes: Math.ceil(reste / 1000), part: reste / duree };
}

/* ---------- Mon côté ---------- */

/** Le côté de l'autre. */
export const luiDe = (m: Pick<MatchDeSalle, "moi">): "a" | "b" => (m.moi === "a" ? "b" : "a");

/** Une main en liste, dans l'ordre de la scène : arme, tête, haut, pieds, bas. */
export const mainEnListe = (main: MainDuDuel): string[] => EMPLACEMENTS_DE_LA_MAIN.map((e) => main[e]);

/** Les manches résolues, de mon côté : [ma carte, la sienne]. Le moteur rend la même manche dans les deux sens. */
export const coupsDeMonCote = (m: Pick<MatchDeSalle, "moi" | "coups">): [number, number][] => m.coups.map(([a, b]) => (m.moi === "a" ? [a, b] : [b, a]));

/** La carte qu'il a posée à la manche `manche` (la première est 1), une fois la manche résolue ; sinon `null`. */
export function saCarteALaManche(m: Pick<MatchDeSalle, "moi" | "coups">, manche: number): number | null {
  const c = m.coups[manche - 1];
  if (!c) return null;
  return m.moi === "a" ? c[1] : c[0];
}

/* ---------- En mots ---------- */

/** L'espace qui ne se coupe pas, entre les milliers et avant le mot. */
const INSECABLE = String.fromCharCode(160);

/** Un nombre de statères, avec ses espaces insécables : « 1 800 statères ». */
export function stateresEnMots(n: number): string {
  const chiffres = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, INSECABLE);
  return `${chiffres}${INSECABLE}${Math.abs(n) > 1 ? "statères" : "statère"}`;
}

/** Ce que contient le pot d'une salle et ce qu'en reçoit le gagnant. */
export const potDeLaSalle = (mise: number): { pot: number; gagnant: number; cagnotte: number } => ({ pot: 2 * mise, gagnant: gainDuGagnant(mise), cagnotte: partDeLaCagnotte(mise) });

export interface IssueEnMots {
  /** « Gagné », « Perdu », « Égalité ». */
  titre: string;
  /** Ce que tu reçois ou perds, en une phrase ; pendant un essai, qu'il n'y avait rien en jeu. */
  argent: string;
  /** Pourquoi le match a fini, s'il n'a pas fini au combat ; sinon `null`. */
  raison: string | null;
  /** Ce qui est allé à la cagnotte, ou `null`. */
  cagnotte: string | null;
}

/** L'issue d'un match fini, de mon côté, en mots courts et sans signes. */
export function issueEnMots(m: Pick<MatchDeSalle, "verdict" | "fin" | "gain" | "mise" | "essai" | "cagnotte">): IssueEnMots {
  const v = m.verdict ?? 0;
  const titre = v > 0 ? "Gagné" : v < 0 ? "Perdu" : "Égalité";
  const argent = m.essai
    ? "Essai : rien n'était misé."
    : v > 0
      ? `Tu reçois ${stateresEnMots(m.gain ?? gainDuGagnant(m.mise))}.`
      : v < 0
        ? `Ta mise de ${stateresEnMots(m.mise)} est perdue.`
        : `Ta mise de ${stateresEnMots(m.mise)} t'est rendue.`;
  const raison =
    m.fin === "temps"
      ? v > 0
        ? "L'autre n'a pas posé à temps."
        : v < 0
          ? "Temps écoulé : ta carte n'était pas posée."
          : "Aucun des deux n'a posé à temps."
      : m.fin === "quitte"
        ? v > 0
          ? "L'autre Gaulois est parti."
          : "Tu as quitté le match."
        : m.fin === "ferme"
          ? "Le duel a été fermé pendant le match."
          : null;
  const cagnotte = !m.essai && m.cagnotte ? `${stateresEnMots(m.cagnotte)} vont à la cagnotte de la saison.` : null;
  return { titre, argent, raison, cagnotte };
}
