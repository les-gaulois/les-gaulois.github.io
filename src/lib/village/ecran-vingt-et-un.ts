/**
 * Ce que l'écran du vingt-et-un calcule (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote le 22 novembre
 * 2026) : les mots du croupier pendant et à la fin d'une main, la pastille du total, l'étiquette posée sur chaque main, les
 * gestes permis compte tenu de la bourse et du reste du jour, et le coup à rendre au casino à la fin de la main.
 *
 * Rien ici ne décide d'un résultat : chaque carte, chaque issue et chaque somme viennent du serveur (`TableDuVingtEtUn`,
 * `contrat-casino.ts`). Les totaux ne sont que ce que valent les cartes déjà montrées (`total` des règles).
 */
import { nombreEcrit } from "../jeu/ecriture";
import { NOMS_DES_RANGS, nomDeLaCarte, total, vingtEtUnDEntree } from "./casino/vingt-et-un";
import type { CarteDuVingtEtUn, CoupDuCasino, CoupDuVingtEtUn, CoupsPermis, FaitDuVingtEtUn, IssueDuVingtEtUn, ReponseDuVingtEtUn, TableDuVingtEtUn } from "./contrat-casino";
import { motsDuRefus } from "./ecran-casino";

/** Les quatre gestes : le mot du bouton, puis son nom entier (lu aux lecteurs d'écran, bulle du survol). */
export const NOMS_DES_GESTES: Readonly<Record<CoupDuVingtEtUn, readonly [string, string]>> = {
  tirer: ["Tirer", "Tirer une carte"],
  rester: ["Rester", "Rester : garder sa main"],
  doubler: ["Doubler", "Doubler la mise, une seule carte de plus"],
  separer: ["Séparer", "Séparer en deux mains"],
};
/** Ce que dit le druide : le mot en or, puis la phrase lue aux lecteurs d'écran (« Le druide conseille de … »). */
export const MOTS_DU_DRUIDE: Readonly<Record<CoupDuVingtEtUn, readonly [string, string]>> = {
  tirer: ["Tire une carte", "tirer une carte"],
  rester: ["Reste", "rester"],
  doubler: ["Double", "doubler"],
  separer: ["Sépare", "séparer"],
};
/** Le croupier au repos. */
export const REPOS_DU_VINGT_ET_UN: readonly [string, string] = ["Faites vos jeux", "Posez votre mise"];

/* ---------- Les gestes permis ---------- */

/** Ce qui peut empêcher de doubler ou de séparer, en plus des règles : la bourse, ou ce qu'il reste à miser aujourd'hui. */
export type RaisonDuGeste = "" | "bourse" | "plafond_du_jour";
export interface GestesPermis extends CoupsPermis {
  /** Pourquoi doubler et séparer sont fermés alors que les règles les permettent. */
  raison: RaisonDuGeste;
}
/** Ce que l'écran sait des limites du compte : la bourse de la barre, le reste du jour, l'essai du mode GOD. */
export interface LimitesDuGeste {
  bourse: number | null;
  reste: number | null;
  god: boolean;
}
const AUCUN: GestesPermis = { tirer: false, rester: false, doubler: false, separer: false, raison: "" };

/**
 * Les gestes permis sur la main en cours : ceux que le serveur permet (`table.permis`), puis, pour doubler et séparer, le
 * complément (`table.complement`) comparé à la bourse et au reste du jour, comme le serveur le fera (sauf en essai GOD, où rien
 * n'est pris). Le serveur revérifie tout.
 */
export function gestesPermis(table: TableDuVingtEtUn | null, l: LimitesDuGeste): GestesPermis {
  if (!table || table.phase !== "joueur") return AUCUN;
  const p = table.permis;
  const g: GestesPermis = { tirer: p.tirer, rester: p.rester, doubler: p.doubler, separer: p.separer, raison: "" };
  if ((g.doubler || g.separer) && !(l.god || table.god)) {
    const raison: RaisonDuGeste = l.bourse !== null && table.complement > l.bourse ? "bourse" : l.reste !== null && table.complement > l.reste ? "plafond_du_jour" : "";
    if (raison) {
      g.doubler = false;
      g.separer = false;
      g.raison = raison;
    }
  }
  return g;
}

/** Le nom entier d'un geste, avec la raison quand la bourse ou le plafond du jour le ferment. */
export function nomDuGeste(geste: CoupDuVingtEtUn, permis: GestesPermis, regles: CoupsPermis | null): string {
  const nom = NOMS_DES_GESTES[geste][1];
  if (permis[geste] || !permis.raison || (geste !== "doubler" && geste !== "separer") || !regles?.[geste]) return nom;
  return nom + (permis.raison === "bourse" ? " (la bourse ne suffit pas)" : " (le plafond du jour ne suffit pas)");
}

/** Ce que dit le croupier quand le serveur refuse un geste en pleine main. */
export function motsDuRefusEnMain(code: string, reste?: number): [string, string] {
  if (code === "solde_insuffisant" || code === "bourse") return ["À vous", "La bourse ne suffit pas"];
  if (code === "casino_plafond" || code === "plafond_du_jour") return ["À vous", "Le plafond du jour ne suffit pas"];
  return motsDuRefus(code, reste);
}

/* ---------- Les mots pendant la main ---------- */

const dit = (t: number): string => (t > 21 ? "plus de 21" : String(t));

/** La pastille d'une main : ce que valent ses cartes montrées (« 7 ou 17 » pour une main souple du joueur encore ouverte). */
export function pastille(cartes: readonly CarteDuVingtEtUn[], joueurOuvert: boolean): { texte: string; rouge: boolean } | null {
  if (!cartes.length) return null;
  const t = total(cartes);
  return { texte: joueurOuvert && t.souple && t.t < 21 ? `${t.dur} ou ${t.t}` : String(t.t), rouge: t.t > 21 };
}

/** Ce qu'entend un lecteur d'écran quand c'est au joueur : les cartes de la main qui se joue, en mots (la couche des cartes lui est cachée). */
export function cartesDites(table: TableDuVingtEtUn): string {
  const m = table.mains[table.courante] ?? table.mains[0];
  return m && m.cartes.length ? `Vos cartes : ${m.cartes.map(nomDeLaCarte).join(", ")}.` : "";
}

/** L'annonce du croupier quand c'est au joueur : sa main, et la carte que montre le croupier. */
export function motsDeLaSuite(table: TableDuVingtEtUn): [string, string] {
  const m = table.mains[table.courante] ?? table.mains[0]!;
  const t = total(m.cartes);
  const v = table.tavernier[0];
  const n = v ? NOMS_DES_RANGS[v.r]! : "";
  const titre = table.mains.length > 1 ? (table.courante ? "Seconde main" : "Première main") : "À vous";
  const montre = n ? `. Le croupier montre ${n === "dame" ? "une dame" : "un " + n}` : "";
  return [titre, `Vous avez ${t.souple ? `${t.dur} ou ${t.t}` : t.t}${montre}`];
}

/** L'étiquette posée sur une main à son bilan, et son ton. */
export function rubanDuBilan(f: Extract<FaitDuVingtEtUn, { t: "bilan" }>): { mot: string; ton: "rouge" | "bleu" | "or"; fete: boolean } {
  if (f.issue === "perdu") return { mot: f.saute ? "Plus de 21" : "Perdu", ton: "rouge", fete: false };
  if (f.issue === "egal") return { mot: "Égalité", ton: "bleu", fete: false };
  if (f.issue === "vingt-et-un") return { mot: "21 d'entrée", ton: "or", fete: true };
  return { mot: "Gagné", ton: "or", fete: false };
}

/* ---------- La fin de la main ---------- */

export interface FinDeLaMain {
  titre: string;
  sous: string;
  /** Le chiffre de la plaque (le total de la main), vide après une séparation. */
  signe: string;
  ton: "rouge" | "bleue" | "or" | "feutre";
  /** Ce qu'entend un lecteur d'écran. */
  dire: string;
  /** Un 21 d'entrée : la lueur, le visage ébahi, la pluie lente. */
  fete: boolean;
}

const ISSUES_DITES: Readonly<Record<IssueDuVingtEtUn, string>> = { gagne: "gagnée", egal: "à égalité", perdu: "perdue", "vingt-et-un": "à 21" };

/** L'annonce du croupier, la plaque et la phrase lue, une fois la main finie (les nombres du serveur). */
export function finDeLaMain(table: TableDuVingtEtUn): FinDeLaMain {
  const mains = table.mains;
  const rendu = table.rendu;
  const mise = table.misee;
  const tt = total(table.tavernier).t;
  const tBJ = vingtEtUnDEntree(table.tavernier);
  const tj = mains.map((m) => total(m.cartes).t);
  const tous = tj.every((t) => t > 21);
  const sous = tous ? "" : `Croupier : ${tBJ ? "21 d'entrée" : dit(tt)}`;
  let titre: string;
  let signe = "";
  let ton: FinDeLaMain["ton"] = "feutre";
  let fete = false;
  if (mains.length === 1) {
    const i = mains[0]!.issue ?? "perdu";
    fete = i === "vingt-et-un";
    titre = ({ gagne: "Gagné", perdu: tj[0]! > 21 ? "Plus de 21" : "Perdu", egal: "Égalité", "vingt-et-un": "21 d'entrée" } as const)[i];
    signe = String(tj[0]);
    ton = i === "perdu" ? "rouge" : i === "egal" ? "bleue" : "or";
  } else titre = rendu > mise ? "Gagné" : rendu === mise ? "Mise rendue" : rendu ? "Une main sur deux" : "Perdu";
  const somme = !rendu ? "Rien cette fois." : rendu === mise ? `Mise rendue : ${nombreEcrit(rendu)} statères.` : rendu < mise ? `Rendu : ${nombreEcrit(rendu)} statères sur ${nombreEcrit(mise)} misés.` : `Rendu : ${nombreEcrit(rendu)} statères, mise comprise.`;
  // Après une séparation, chaque main a son issue, que les étiquettes de la table ne disent qu'aux yeux.
  const dire = mains.length > 1 ? `Première main ${ISSUES_DITES[mains[0]!.issue ?? "perdu"]}, seconde ${ISSUES_DITES[mains[1]!.issue ?? "perdu"]}. ${somme}` : somme;
  return { titre, sous, signe, ton, dire, fete };
}

/** Le coup du vingt-et-un, tel que le casino l'attend à la fin du tour (et `issues`, pour « Vos dernières parties »). */
export type CoupFiniDuVingtEtUn = CoupDuCasino & { jeu: "vingt-et-un"; issues: IssueDuVingtEtUn[] };
export function coupDuVingtEtUn(r: ReponseDuVingtEtUn): CoupFiniDuVingtEtUn {
  const t = r.table;
  return {
    ok: true,
    partie: t.partie,
    jeu: "vingt-et-un",
    mise: t.misee,
    rendu: t.rendu,
    god: t.god,
    solde_apres: r.solde_apres,
    mise_du_jour: r.mise_du_jour,
    reste_du_jour: r.reste_du_jour,
    issues: t.mains.map((m) => m.issue).filter((i): i is IssueDuVingtEtUn => i !== null),
  };
}
