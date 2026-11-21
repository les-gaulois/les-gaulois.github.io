/**
 * Les chiffres de clan de « Ma carte » (écran d'accueil du jeu « Mon Gaulois », 21 novembre 2026, fiche de projet validée
 * par le pilote : « ses vrais chiffres de clan, déjà calculés pour la fiche du membre »). Rien n'est calculé de neuf : ce
 * sont, pour chaque membre au pseudo public, les chiffres de sa fiche (`src/pages/membres/[id].astro`), chacun avec sa date :
 *
 * - ses victoires et défaites sous le tag (`stats.team`), d'où son palier (`paliers-de-victoires.ts`), à l'heure de la liste ;
 * - sa série en cours (`serie-en-cours.ts`), datée de son propre relevé comme sur la fiche, même sous les 5 victoires où la
 *   fiche n'allume pas encore la flamme, et sa plus longue série, comptée sur ses parties lues depuis un jour donné ;
 * - son utilité moyenne dans les parties à revoir (`rejeu/utiles-site.ts`, 100 étant la part moyenne d'un Gaulois), s'il
 *   est au classement « Les plus utiles », à l'heure de ce classement ;
 * - le niveau et le prestige de son compte OpenFront, tout le jeu, à part des stats du clan (`niveau.ts`).
 *
 * Ils sont publiés à la construction dans `/village/chiffres.json`, sous le pseudo public de chaque membre : des données
 * publiques, jamais un identifiant. Un pseudo porté par plusieurs membres ne désigne personne et n'y est pas ; un anonyme non
 * plus. La page retrouve le joueur connecté par le pseudo de son profil OpenFront lié (`openfront_username`, relevé à la
 * validation de son compte) et écrit ce pseudo à côté des chiffres : s'il a changé de pseudo depuis, il le voit. Ni Elo, ni
 * classé, ni note globale, ni valeur tirée des cosmétiques. Les points rapportés au clan ne sont pas ici : ce n'est pas un
 * chiffre de fiche ; la page ne les montre que si le serveur les donne au joueur lui-même (`points_total` de
 * `get_mes_stateres`).
 */
import type { RecordPersonnel, SerieEnCours } from "../serie-en-cours";
import type { AccountLevel, StoredMember } from "../schemas";

export interface ChiffresDeCarte {
  victoires: number;
  defaites: number;
  /** La série de victoires en cours sous le tag ; `auMoins` : un minimum ; `releve` : l'heure où elle est connue. `null` : pas de série relevée. */
  serie: { victoires: number; auMoins: boolean; releve: string } | null;
  /** Sa plus longue série, sur ses parties lues depuis `luesDepuis`. */
  record: { victoires: number; auMoins: boolean; luesDepuis: string } | null;
  /** Son utilité moyenne, et sur combien de parties à revoir. `null` : pas au classement. */
  utilite: { moyenne: number; parties: number } | null;
  /** Son compte OpenFront, tout le jeu. `null` : il ne le montre pas. */
  niveau: { niveau: number; prestige: number; legende: boolean } | null;
}

export interface ChiffresDesCartes {
  /** L'heure de la liste des membres d'où viennent victoires, défaites et niveau. */
  liste: string | null;
  /** L'heure du classement « Les plus utiles ». */
  utilite: string | null;
  joueurs: Record<string, ChiffresDeCarte>;
}

/** Une ligne du classement « Les plus utiles » : le pseudo, la moyenne et le nombre de parties. */
export interface LigneDUtilite {
  nom: string;
  utilite: number;
  parties: number;
}

/**
 * Les chiffres de tous les membres au pseudo public porté par lui seul et aux stats reçues. `utiles` : le classement et les
 * identifiants de ses pseudos (seule une ligne qui désigne ce membre compte, comme sur la fiche).
 */
export function chiffresDesCartes(
  membres: readonly StoredMember[],
  listeLe: string | null,
  series: ReadonlyMap<string, SerieEnCours>,
  records: ReadonlyMap<string, RecordPersonnel>,
  utiles: { lignes: readonly LigneDUtilite[]; ids: ReadonlyMap<string, string>; fait: string | null },
): ChiffresDesCartes {
  const porteurs = new Map<string, number>();
  for (const m of membres) if (m.username) porteurs.set(m.username, (porteurs.get(m.username) ?? 0) + 1);
  const joueurs: Record<string, ChiffresDeCarte> = {};
  for (const m of membres) {
    if (!m.username || !m.publicId || !m.team || porteurs.get(m.username) !== 1) continue;
    const serie = series.get(m.publicId) ?? null;
    const record = records.get(m.publicId) ?? null;
    const ligne = utiles.ids.get(m.username) === m.publicId ? (utiles.lignes.find((l) => l.nom === m.username) ?? null) : null;
    const compte: AccountLevel | null = m.account ?? null;
    joueurs[m.username] = {
      victoires: m.team.wins,
      defaites: m.team.losses,
      serie: serie ? { victoires: serie.victoires, auMoins: serie.auMoins, releve: serie.releve } : null,
      record: record ? { victoires: record.victoires, auMoins: record.auMoins, luesDepuis: record.luesDepuis } : null,
      utilite: ligne ? { moyenne: ligne.utilite, parties: ligne.parties } : null,
      niveau: compte ? { niveau: compte.level, prestige: compte.prestige, legende: compte.legend } : null,
    };
  }
  return { liste: listeLe, utilite: utiles.fait, joueurs };
}

const entier = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const objet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const heure = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

/** Ce que la page sait des chiffres d'un joueur : lus, absents du fichier (son pseudo n'y est pas), ou illisibles. */
export type LectureDesChiffres =
  | { kind: "lus"; chiffres: ChiffresDeCarte; liste: string | null; utilite: string | null }
  | { kind: "absent" }
  | { kind: "illisible" };

/**
 * Les chiffres d'un joueur, lus dans `/village/chiffres.json`. Une partie illisible (série, record, utilité, niveau) se lit
 * `null` : elle ne s'affiche pas, ce n'est pas zéro. Une série ou un record sans date valide ne s'affiche pas non plus.
 */
export function lireChiffresDuJoueur(raw: unknown, pseudo: string | null | undefined): LectureDesChiffres {
  if (!objet(raw) || !objet(raw["joueurs"])) return { kind: "illisible" };
  if (!pseudo) return { kind: "absent" };
  const j = Object.hasOwn(raw["joueurs"], pseudo) ? (raw["joueurs"] as Record<string, unknown>)[pseudo] : undefined;
  if (j === undefined) return { kind: "absent" };
  if (!objet(j) || !entier(j["victoires"]) || !entier(j["defaites"])) return { kind: "illisible" };
  const s = j["serie"];
  const r = j["record"];
  const u = j["utilite"];
  const n = j["niveau"];
  const releve = objet(s) ? heure(s["releve"]) : null;
  const luesDepuis = objet(r) ? heure(r["luesDepuis"]) : null;
  return {
    kind: "lus",
    chiffres: {
      victoires: j["victoires"],
      defaites: j["defaites"],
      serie: objet(s) && entier(s["victoires"]) && typeof s["auMoins"] === "boolean" && releve ? { victoires: s["victoires"], auMoins: s["auMoins"], releve } : null,
      record: objet(r) && entier(r["victoires"]) && typeof r["auMoins"] === "boolean" && luesDepuis ? { victoires: r["victoires"], auMoins: r["auMoins"], luesDepuis } : null,
      utilite: objet(u) && typeof u["moyenne"] === "number" && Number.isFinite(u["moyenne"]) && entier(u["parties"]) ? { moyenne: u["moyenne"], parties: u["parties"] } : null,
      niveau: objet(n) && entier(n["niveau"]) && n["niveau"] > 0 && entier(n["prestige"]) && typeof n["legende"] === "boolean" ? { niveau: n["niveau"], prestige: n["prestige"], legende: n["legende"] } : null,
    },
    liste: heure(raw["liste"]),
    utilite: heure(raw["utilite"]),
  };
}

/** Le taux de victoire sous le tag, en pour cent comme sur la fiche (`rateOf`) ; `null` sans partie (« — », pas zéro). */
export const tauxDeVictoire = (c: Pick<ChiffresDeCarte, "victoires" | "defaites">): number | null => (c.victoires + c.defaites > 0 ? (100 * c.victoires) / (c.victoires + c.defaites) : null);

/**
 * Les points rapportés au clan par les parties du joueur, si le serveur les lui donne (`points_total` de `get_mes_stateres`),
 * avec le jour d'où ils se comptent (`depart` de la même réponse) : le journal des statères ne les garde que depuis le 1er du
 * mois de création de son Gaulois, et rien pendant une suspension. Ce n'est donc pas le total de toutes ses parties, et
 * l'écran le dit. Sans l'un des deux : `null`, rien ne s'affiche.
 */
export function pointsDuServeur(raw: unknown): { points: number; depuis: string } | null {
  if (!objet(raw)) return null;
  const p = raw["points_total"];
  const depuis = heure(raw["depart"]);
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && depuis ? { points: p, depuis } : null;
}

/** « 1 victoire », « 4 victoires » : un nombre et son nom, accordé. */
export const victoiresEnMots = (n: number): string => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${n > 1 ? "victoires" : "victoire"}`;
