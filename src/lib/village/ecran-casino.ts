/**
 * Ce que l'écran du casino de « Mon Gaulois » calcule (22 novembre 2026, maquette « Le Palais d'or » validée par le pilote) :
 * le hall (ses jeux, leurs catégories, leur rendement), la lecture de `get_casino`, la ligne de chaque partie dans « Vos
 * dernières parties », les mots du croupier quand le serveur refuse, le niveau d'un tour et les règles du pupitre de mise.
 *
 * Rien ici ne décide d'un résultat ni d'un solde : ce sont les nombres du serveur (`contrat-casino.ts`), tels quels. Le
 * pupitre ne fait que prévenir avant d'envoyer une mise que le serveur refuserait de toute façon.
 */
import { nombreEcrit } from "../jeu/ecriture";
import { ROUGES } from "../jeu/casino-roue";
import type { Croupier } from "../jeu/casino-dessins";
import {
  type CoupDuCasino,
  JETONS_DU_CASINO,
  MISE_DE_DEPART_AU_PLUS,
  PLAFOND_DU_JOUR_DU_CASINO,
  type EtatDuCasino,
  type IssueDuVingtEtUn,
  type JeuDuCasino,
  type PartieDuCasino,
  type ResumeDePartie,
} from "./contrat-casino";

/** Les catégories du hall. */
export type CategorieDuCasino = "tout" | "tables" | "machines" | "courses";
export const CATEGORIES_DU_CASINO: readonly { id: CategorieDuCasino; nom: string; icone: string }[] = [
  { id: "tout", nom: "Tous les jeux", icone: "tout" },
  { id: "tables", nom: "Tables", icone: "table" },
  { id: "machines", nom: "Machines", icone: "machine" },
  { id: "courses", nom: "Courses", icone: "course" },
];

/** Un jeu du hall : son nom, sa catégorie, ce qu'il rend en moyenne (celui des règles validées), son croupier. */
export interface JeuDuHall {
  id: JeuDuCasino;
  nom: string;
  cat: Exclude<CategorieDuCasino, "tout">;
  rend: string;
  croupier: Croupier;
}
/** Les six jeux, dans l'ordre du hall de la maquette validée. */
export const JEUX_DU_HALL: readonly JeuDuHall[] = [
  { id: "vingt-et-un", nom: "Le vingt-et-un", cat: "tables", rend: "Rend 99,4 % joué au mieux", croupier: "donneur" },
  { id: "roue", nom: "La roue du charron", cat: "tables", rend: "Rend 100 %", croupier: "roue" },
  { id: "machine", nom: "La machine du forgeron", cat: "machines", rend: "Rend 100 %", croupier: "forgeron" },
  { id: "course", nom: "La course des familiers", cat: "courses", rend: "Rend 100 %", croupier: "course" },
  { id: "palissade", nom: "La palissade", cat: "machines", rend: "Rend 100 %", croupier: "palissade" },
  { id: "des", nom: "Les dés", cat: "tables", rend: "Rend 100 %", croupier: "des" },
];
export const jeuDuHall = (id: JeuDuCasino): JeuDuHall => JEUX_DU_HALL.find((j) => j.id === id) ?? JEUX_DU_HALL[1]!;
/** Les jeux d'une catégorie. */
export const jeuxDeLaCategorie = (cat: CategorieDuCasino): JeuDuHall[] => JEUX_DU_HALL.filter((j) => cat === "tout" || j.cat === cat);

/* ---------- Qui voit l'onglet ---------- */

/**
 * L'onglet « Le casino » paraît-il ? À tous quand le casino est ouvert à tous (`CASINO_POUR_TOUS` d'`acces.ts`) ; sinon au
 * seul titulaire du mode GOD (le pilote), que le serveur reconnaît par `get_village_god` (`permis`). Une réponse illisible : non.
 */
export function casinoMontre(pourTous: boolean, god: { permis: boolean } | null): boolean {
  return pourTous || god?.permis === true;
}

/* ---------- La lecture de get_casino ---------- */

const entier = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const estJeu = (v: unknown): v is JeuDuCasino => typeof v === "string" && JEUX_DU_HALL.some((j) => j.id === v);

/** Une partie lue, ou `null` si elle ne ressemble pas au contrat. Le résumé reste tel quel : `resumeDeLaPartie` le lit. */
function lirePartie(v: unknown): PartieDuCasino | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const partie = entier(p["partie"]);
  const mise = entier(p["mise"]);
  const rendu = entier(p["rendu"]);
  if (partie === null || mise === null || rendu === null || mise < 0 || rendu < 0 || !estJeu(p["jeu"])) return null;
  const resume = p["resume"] && typeof p["resume"] === "object" ? (p["resume"] as ResumeDePartie) : ({ jeu: p["jeu"] } as ResumeDePartie);
  return { partie, jeu: p["jeu"], mise, rendu, god: p["god"] === true, le: typeof p["le"] === "string" ? p["le"] : "", resume };
}

/** La réponse de `get_casino`, lue : `null` si elle ne ressemble pas au contrat (l'onglet ne paraît pas). */
export function lireEtatDuCasino(reponse: unknown): EtatDuCasino | null {
  if (!reponse || typeof reponse !== "object" || Array.isArray(reponse)) return null;
  const r = reponse as Record<string, unknown>;
  if (r["ok"] !== true || typeof r["ouvert"] !== "boolean") return null;
  const solde = entier(r["solde"]);
  const miseDuJour = entier(r["mise_du_jour"]);
  const resteDuJour = entier(r["reste_du_jour"]);
  if (solde === null || miseDuJour === null || resteDuJour === null) return null;
  const jetons = Array.isArray(r["jetons"]) && r["jetons"].every((j) => entier(j) !== null && (j as number) > 0) ? (r["jetons"] as number[]) : [...JETONS_DU_CASINO];
  const parties = Array.isArray(r["parties"]) ? r["parties"].map(lirePartie).filter((p): p is PartieDuCasino => p !== null) : [];
  return {
    ok: true,
    ouvert: r["ouvert"],
    peut_jouer: r["peut_jouer"] === true,
    god: r["god"] === true,
    solde,
    jour: typeof r["jour"] === "string" ? r["jour"] : "",
    plafond: entier(r["plafond"]) ?? PLAFOND_DU_JOUR_DU_CASINO,
    mise_au_plus: entier(r["mise_au_plus"]) ?? MISE_DE_DEPART_AU_PLUS,
    jetons,
    mise_du_jour: miseDuJour,
    reste_du_jour: resteDuJour,
    parties,
    main: r["main"] && typeof r["main"] === "object" ? (r["main"] as EtatDuCasino["main"]) : null,
  };
}

/* ---------- Les mots ---------- */

/** Rouge ou bleu, d'après le numéro de la roue. */
export const couleurDuNumero = (n: number): "rouge" | "bleu" => (ROUGES.has(n) ? "rouge" : "bleu");

const TITRES_DE_LA_MACHINE: readonly string[] = ["Trois statères", "Trois torques", "Trois enseignes", "Trois amphores", "Brin de gui"];
const FOIS_DE_LA_MACHINE: readonly number[] = [100, 20, 5, 2, 1];
/** Les coupes de la palissade, de la case 0 (tout à gauche) à la case 8 (tout à droite), et leur nom court. */
const COUPES_DE_LA_PALISSADE = ["19 fois la mise", "4 fois la mise", "Une fois et demie", "La moitié", "Le cinquième", "La moitié", "Une fois et demie", "4 fois la mise", "19 fois la mise"] as const;
const ISSUES: Readonly<Record<IssueDuVingtEtUn, string>> = { gagne: "gagnée", egal: "égalité", perdu: "perdue", "vingt-et-un": "21 d'entrée" };

/**
 * La ligne d'une partie dans « Vos dernières parties » : ce qui est sorti, en mots courts, comme les jeux de la maquette
 * l'écrivaient à la fin d'un tour. Rien si le résumé ne se lit pas.
 */
export function resumeDeLaPartie(r: ResumeDePartie): string {
  switch (r.jeu) {
    case "roue":
      return typeof r.numero === "number" ? `Sorti : le ${r.numero}, ${couleurDuNumero(r.numero)}` : "";
    case "machine": {
      if (typeof r.resultat !== "number") return "";
      if (r.resultat < 0) return "Pas de trio";
      if (r.resultat === 4) return "Gui : mise rendue";
      return `${TITRES_DE_LA_MACHINE[r.resultat] ?? ""} : ${FOIS_DE_LA_MACHINE[r.resultat] ?? ""} fois`;
    }
    case "course":
      return typeof r.gagnant === "number" ? `Couloir ${r.gagnant + 1}` : "";
    case "palissade":
      return COUPES_DE_LA_PALISSADE[r.coupe] ?? "";
    case "des": {
      if (!Array.isArray(r.faces) || r.faces.length !== 2) return "";
      const [a, b] = r.faces;
      return `Sorti : ${a === b ? `double ${a}` : `${a} et ${b}`}, soit ${a + b}`;
    }
    case "vingt-et-un": {
      if (!Array.isArray(r.issues) || !r.issues.length) return "";
      const mots = r.issues.map((i) => ISSUES[i] ?? "");
      return mots.length > 1 ? `Deux mains : ${mots.join(" et ")}` : mots[0]!.charAt(0).toUpperCase() + mots[0]!.slice(1);
    }
  }
  return "";
}

/**
 * Le résumé d'un coup que le serveur vient de jouer, tel que `get_casino` le rendra ensuite dans les parties : le hall
 * l'inscrit aussitôt, avant de relire le serveur. `null` pour un coup qui ne se lit pas.
 */
export function resumeDuCoup(coup: CoupDuCasino & Record<string, unknown>): ResumeDePartie | null {
  switch (coup.jeu) {
    case "roue":
      return typeof coup["numero"] === "number" ? { jeu: "roue", numero: coup["numero"] } : null;
    case "machine":
      return typeof coup["resultat"] === "number" ? ({ jeu: "machine", resultat: coup["resultat"] } as ResumeDePartie) : null;
    case "course":
      return typeof coup["couloir"] === "number" && typeof coup["gagnant"] === "number" ? { jeu: "course", couloir: coup["couloir"], gagnant: coup["gagnant"] } : null;
    case "palissade":
      return typeof coup["coupe"] === "number" ? { jeu: "palissade", coupe: coup["coupe"] } : null;
    case "des":
      return Array.isArray(coup["faces"]) && coup["faces"].length === 2 ? { jeu: "des", faces: coup["faces"] as [number, number] } : null;
    case "vingt-et-un":
      return Array.isArray(coup["issues"]) && coup["issues"].length ? { jeu: "vingt-et-un", issues: coup["issues"] as IssueDuVingtEtUn[] } : null;
    default:
      return null;
  }
}

/** Le solde d'une partie : `+n` pour un gain, `-n` pour une perte, et ce qu'en entend un lecteur d'écran. */
export function netDeLaPartie(mise: number, rendu: number): { texte: string; dit: string; gagne: boolean } {
  const net = rendu - mise;
  return { texte: `${net >= 0 ? "+" : "-"}${nombreEcrit(Math.abs(net))}`, dit: `${net >= 0 ? "plus" : "moins"} ${Math.abs(net)} statères`, gagne: net > 0 };
}

/** Ce que dit le croupier quand le serveur refuse un coup (titre, sous-titre). Un refus ne prend rien. */
export function motsDuRefus(code: string, reste?: number): [string, string] {
  switch (code) {
    case "solde_insuffisant":
    case "bourse":
      return ["Faites vos jeux", "La bourse ne suffit pas"];
    case "casino_plafond":
    case "plafond_du_jour":
      return ["Plafond du jour", reste !== undefined && reste > 0 ? `Encore ${nombreEcrit(reste)} aujourd'hui` : `${nombreEcrit(PLAFOND_DU_JOUR_DU_CASINO)} misés aujourd'hui`];
    case "plafond":
    case "mise_trop_haute":
      return ["Faites vos jeux", `${MISE_DE_DEPART_AU_PLUS} au plus sur la table`];
    case "casino_ferme":
      return ["Le casino est fermé", "Revenez bientôt"];
    case "not_validated":
      return ["Pas encore", "Votre compte attend sa validation"];
    case "no_gaulois":
      return ["Pas encore", "Créez d'abord votre Gaulois"];
    case "rate_limited":
      return ["Doucement", "Un instant entre deux tours"];
    case "not_signed_in":
      return ["Pas encore", "Reconnectez-vous"];
    case "suspended":
      return ["Pas de jeu", "Votre compte est suspendu"];
    case "pari_invalide":
      return ["Faites vos jeux", "Ce pari n'est pas sur la table"];
    case "main_en_cours":
      return ["Une main attend", "Finissez-la d'abord"];
    case "pas_de_main":
      return ["Pas de main", "Distribuez d'abord"];
    case "main_changee":
      return ["Un instant", "La table a changé"];
    case "coup_refuse":
      return ["Pas ce coup-là", "Les règles ne le permettent pas"];
    case "mode_god":
      return ["Essai en cours", "Cette main attend la fin de l'essai"];
    case "rien":
      return ["Faites vos jeux", "Posez vos jetons"];
    default:
      return ["Rien ne part", "Le serveur ne répond pas"];
  }
}

/* ---------- Le niveau d'un tour ---------- */

/** Le niveau d'un tour : rien, moins que la mise, la mise, plus que la mise, un grand gain. */
export type NiveauDuTour = "perdu" | "partiel" | "rendue" | "gain" | "grand";
export function niveauDuTour(rendu: number, mise: number, grand = false): NiveauDuTour {
  return !rendu ? "perdu" : rendu < mise ? "partiel" : rendu === mise ? "rendue" : grand ? "grand" : "gain";
}
/** La note de la plaque du résultat, sous le chiffre. */
export function noteDuNiveau(n: NiveauDuTour, mise: number): string {
  return { perdu: "Rien cette fois", partiel: `Rendus sur ${nombreEcrit(mise)} misés`, rendue: "Mise rendue", gain: "Mise comprise", grand: "Mise comprise" }[n];
}

/* ---------- Le pupitre de mise ---------- */

/** Ce que regarde le pupitre avant de poser un jeton : ce qu'il y a sur la table, et ce que le serveur permet. */
export interface LimitesDuPupitre {
  /** Ce que la table prend au plus (200). */
  plafond: number;
  /** La bourse, d'après le dernier solde du serveur ; `null` si on ne la connaît pas encore (le serveur dira). */
  bourse: number | null;
  /** Ce qui reste à miser aujourd'hui ; `null` si on ne le sait pas. */
  reste: number | null;
  /** L'essai du pilote (mode GOD) : rien n'est pris, seule la table compte. */
  god: boolean;
}
/** Le refus d'un jeton, ou `null` s'il peut se poser. */
export type RefusDuPupitre = "plafond" | "bourse" | "plafond_du_jour" | null;
export function refusDuJeton(total: number, jeton: number, l: LimitesDuPupitre): RefusDuPupitre {
  if (total + jeton > l.plafond) return "plafond";
  if (l.god) return null;
  if (l.reste !== null && total + jeton > l.reste) return "plafond_du_jour";
  if (l.bourse !== null && total + jeton > l.bourse) return "bourse";
  return null;
}
/** Les mises reposées par « mêmes mises » : refusées si elles ne tiennent plus (bourse, reste du jour). */
export function refusDesMemesMises(mises: Readonly<Record<string, number>>, l: LimitesDuPupitre): RefusDuPupitre {
  return refusDuJeton(0, Object.values(mises).reduce((a, b) => a + b, 0), l);
}
