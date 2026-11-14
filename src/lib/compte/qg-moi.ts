/**
 * L'onglet « Moi » du QG, en tableau de bord (14 novembre 2026, à la demande du pilote : « comme pour la section compte »).
 * Ici, les calculs purs de l'écran (`src/components/compte/QgMoi.tsx`) : les lignes de « ce qui m'attend au QG », avec leur
 * couleur d'état, et les chiffres du membre lus dans les données publiques du site. Rien n'est inventé : les nombres des
 * lignes viennent du serveur (`get_qg`, `get_qg_tools`, le relevé des appels), les chiffres de `/data/members.json` et de
 * `/semaine-du-clan.json`. Stats du clan : `team` seulement ; le niveau du compte, « tout le jeu », reste à part.
 */
import { fmtCount, fmtInt } from "../format";
import { gamesOf, placeOf, rateOf, type MemberPlace } from "../members";
import { nextTier, type NextTier } from "../paliers";
import type { AccountLevel, StoredMember, StoredMembers } from "../schemas";
import type { ClanWeekFile } from "../semaine-du-clan";
import { closesLabel, liveMine, memberOfPseudo, planLabel } from "./outils";
import { counted } from "./qg";

/** Les couleurs d'état des pastilles (`data-dir-ton`, pièces communes de la Direction) : jamais sans leur mot. */
export type MoiTon = "ok" | "warn" | "danger" | "ally" | "muted";

/** Les onglets du QG vers lesquels une ligne peut mener. */
export type MoiOnglet = "salons" | "decisions" | "semaine" | "ce-soir" | "idees";

/** Le nom de chaque onglet, comme dans le menu des parties du QG. */
export const MOI_ONGLETS: Record<MoiOnglet, string> = {
  salons: "Salons",
  decisions: "Décisions",
  semaine: "La semaine",
  "ce-soir": "Ce soir",
  idees: "Idées",
};

/** Ce que le QG sait déjà de ce qui attend le membre. */
export interface MoiAttente {
  /** Les autres Gaulois qui attendent dans un salon. */
  waiting: number;
  /** Les sondages ouverts où le membre n'a pas voté. */
  notVoted: number;
  /** La semaine ouverte aux pronostics. `null` : aucune, ou les outils ne la donnent pas. */
  prediction: { mine: number | null; closesAt: string } | null;
  /** L'heure annoncée par le membre, et le nombre d'autres Gaulois qui ont dit la leur. */
  plan: { mine: string | null; others: number };
  /** Les idées à trancher. `null` : le membre n'est pas de l'encadrement. */
  ideasToDecide: number | null;
}

export interface MoiLigne {
  onglet: MoiOnglet;
  ton: MoiTon;
  /** Le mot de la pastille. */
  etat: string;
  /** La phrase de la ligne : c'est elle qui porte le lien vers l'onglet. */
  texte: string;
}

/** L'ordre des couleurs : ce qui est à faire d'abord, puis ce qui se passe, ce qui est fait, et ce qui n'appelle rien. */
const ORDRE_DES_TONS: Record<MoiTon, number> = { danger: 0, warn: 1, ally: 2, ok: 3, muted: 4 };

/**
 * Le pronostic s'enregistre encore : la règle de l'onglet « La semaine » (`QgSemaine.tsx`), où le bouton se ferme dès que
 * l'heure atteint `closesAt`. Le QG relit alors ses outils, qui donnent la semaine suivante.
 */
export const pronosticOuvert = (closesAt: string, now: Date): boolean => now.getTime() < Date.parse(closesAt);

/**
 * Les lignes de « ce qui m'attend au QG » : une par sujet, seulement s'il y a quelque chose à en dire. Un sondage voté, un
 * salon vide ou une idée tranchée ne laissent pas de ligne. Le pronostic et l'heure de ce soir gardent la leur une fois
 * faits, en vert. À couleur égale, l'ordre est celui d'ici : salons, décisions, semaine, ce soir, idées.
 * Chaque nombre est celui que le QG donne déjà à l'onglet de la ligne : `notVoted` à « Décisions » (un sondage ouvert
 * suppose cet onglet), `plan.others` à « Ce soir », `ideasToDecide` à « Idées » (`null` tant que le QG n'est pas lu, donc
 * sans cet onglet). Une heure de jeu finie ne compte plus (`liveMine`) : la ligne repasse à « À dire » ou « Pas dite ».
 */
export function lignesAttente(attente: MoiAttente, now: Date): MoiLigne[] {
  const lignes: MoiLigne[] = [];
  if (attente.waiting > 0) {
    lignes.push({ onglet: "salons", ton: "ally", etat: "Maintenant", texte: counted(attente.waiting, "Gaulois attend dans un salon", "Gaulois attendent dans un salon") });
  }
  if (attente.notVoted > 0) {
    lignes.push({ onglet: "decisions", ton: "warn", etat: "À voter", texte: counted(attente.notVoted, "sondage attend votre voix", "sondages attendent votre voix") });
  }
  const prediction = attente.prediction;
  if (prediction !== null) {
    // Accordé comme « Enregistré : … » dans l'onglet « La semaine » : « 0 victoire », « 2 victoires ».
    if (prediction.mine !== null) {
      lignes.push({ onglet: "semaine", ton: "ok", etat: "Fait", texte: `Votre pronostic de la semaine : ${fmtCount(prediction.mine, "victoire")}` });
    } else if (pronosticOuvert(prediction.closesAt, now)) {
      lignes.push({ onglet: "semaine", ton: "warn", etat: "À faire", texte: `Pronostic de la semaine, ${closesLabel(prediction.closesAt)}` });
    }
  }
  const heure = liveMine(attente.plan.mine, now);
  if (heure !== null) {
    const label = planLabel(heure, now);
    lignes.push({ onglet: "ce-soir", ton: "ok", etat: "Dite", texte: `Votre heure de jeu : ${label === "Maintenant" ? "maintenant" : label}` });
  } else if (attente.plan.others > 0) {
    lignes.push({ onglet: "ce-soir", ton: "warn", etat: "À dire", texte: counted(attente.plan.others, "autre Gaulois a dit son heure", "autres Gaulois ont dit leur heure") });
  } else {
    lignes.push({ onglet: "ce-soir", ton: "muted", etat: "Pas dite", texte: "Votre heure de jeu" });
  }
  if (attente.ideasToDecide !== null && attente.ideasToDecide > 0) {
    lignes.push({ onglet: "idees", ton: "warn", etat: "À trancher", texte: counted(attente.ideasToDecide, "idée attend une décision", "idées attendent une décision") });
  }
  // Tri stable : à couleur égale, l'ordre d'écriture reste.
  return lignes.sort((a, b) => ORDRE_DES_TONS[a.ton] - ORDRE_DES_TONS[b.ton]);
}

/**
 * Le nom du lien d'une ligne, pour un lecteur d'écran : l'état, la phrase et l'onglet, dans l'ordre où la ligne se lit.
 * L'état n'est jamais dit par la couleur seule. Le texte visible du lien (la phrase, puis l'onglet) y reste d'un seul
 * tenant, pour qui commande à la voix (WCAG 2.5.3) : rien ne s'intercale entre les deux, que la virgule.
 */
export const nomDuLien = (ligne: MoiLigne): string => `${ligne.etat} : ${ligne.texte}, ${MOI_ONGLETS[ligne.onglet]}`;

/** Le nombre de lignes qui demandent quelque chose au membre (en jaune ou en rouge). */
export const aFaire = (lignes: readonly MoiLigne[]): number => lignes.filter((ligne) => ligne.ton === "warn" || ligne.ton === "danger").length;

/** Le résumé en tête de l'onglet : « 2 à faire », ou « À jour ». */
export function resumeAttente(lignes: readonly MoiLigne[]): { ton: MoiTon; texte: string } {
  const n = aFaire(lignes);
  return n > 0 ? { ton: "warn", texte: `${fmtInt(n)} à faire` } : { ton: "ok", texte: "À jour" };
}

/** Une jauge : sa part, de 0 à 100, toujours tirée de deux nombres lus. */
const partDe = (fait: number, total: number): number => (total > 0 ? Math.max(0, Math.min(100, (fait / total) * 100)) : 0);

export interface MoiChiffres {
  member: StoredMember;
  place: MemberPlace;
  losses: number;
  /** Le taux de victoires en équipe sous le tag, en pourcentage. `null` : aucune partie. */
  rate: number | null;
  /** Le prochain palier de victoires. `null` : le dernier est atteint. */
  tier: NextTier | null;
  /** La jauge du palier : du palier d'où part le membre au suivant. */
  tierShare: number;
  /** La jauge vers le membre de devant : ses victoires rapportées à celles qu'il faut pour le dépasser. `null` : personne devant. */
  nextShare: number | null;
  /** Le niveau du compte OpenFront, tout le jeu confondu : à part des chiffres du clan. `null` : non visible. */
  account: AccountLevel | null;
  /** La date de la liste des membres lue. */
  fetchedAt: string;
}

/**
 * Les chiffres du membre, ou la raison de leur absence :
 * - `absent` : le serveur ne trouve pas son pseudo dans la liste du clan ;
 * - `lecture` : les données publiques ne sont pas encore lues ;
 * - `illisible` : elles n'ont pas pu être lues ;
 * - `inconnu` : son pseudo n'est pas dans la liste publique (ou porté par plusieurs), ou l'API n'a pas donné ses stats ;
 * - `sans-partie` : aucune partie sous le tag, donc pas de place ;
 * - `pret` : ses chiffres.
 * Aucun calcul neuf : place, réussite, membre à dépasser, membre de derrière et palier sortent des fonctions de « Ma place
 * dans le clan » de l'accueil (`Result`, `src/components/MyPlace.tsx` : `placeOf`, `gamesOf`, `rateOf`, `nextTier`), dans le
 * même ordre de tri ; la jauge vers le membre de devant est la sienne (victoires rapportées à celles du membre de devant).
 * Seule la jauge du palier est propre au QG, tirée de `nextTier`.
 */
export type MoiEtat =
  | { etat: "absent" }
  | { etat: "lecture"; pseudo: string }
  | { etat: "illisible"; pseudo: string }
  | { etat: "inconnu"; pseudo: string }
  | { etat: "sans-partie"; pseudo: string; member: StoredMember }
  | { etat: "pret"; pseudo: string; chiffres: MoiChiffres };

export function etatDeMoi(pseudo: string | null, members: StoredMembers | null | undefined): MoiEtat {
  if (pseudo === null) return { etat: "absent" };
  if (members === undefined) return { etat: "lecture", pseudo };
  if (members === null) return { etat: "illisible", pseudo };
  const member = memberOfPseudo(members.members, pseudo);
  const place = member ? placeOf(members.members, member) : null;
  if (!member || !place) return { etat: "inconnu", pseudo };
  if ((gamesOf(member) ?? 0) === 0) return { etat: "sans-partie", pseudo, member };
  const tier = nextTier(place.wins);
  const target = place.next?.team?.wins ?? null;
  return {
    etat: "pret",
    pseudo,
    chiffres: {
      member,
      place,
      losses: member.team?.losses ?? 0,
      rate: rateOf(member),
      tier,
      tierShare: tier ? partDe(place.wins - tier.from, tier.wins - tier.from) : 100,
      nextShare: target === null ? null : partDe(place.wins, target),
      account: member.account ?? null,
      fetchedAt: members.fetchedAt,
    },
  };
}

export interface MoiSemaine {
  /** Les victoires sous le tag gagnées depuis le relevé du lundi. Zéro est un vrai zéro : le membre était dans le relevé. */
  wins: number;
  since: string;
  until: string;
}

/**
 * Les victoires de la semaine du membre. `null` : pas de relevé du lundi, fichier illisible ou pas encore lu, ou membre
 * absent du relevé (sans identifiant public, ou arrivé depuis) : pas de données n'est pas zéro.
 */
export function semaineDeMoi(member: StoredMember | null, file: ClanWeekFile | null | undefined): MoiSemaine | null {
  const gains = file?.gains;
  if (!member?.publicId || !gains || typeof gains.wins !== "object" || gains.wins === null) return null;
  const wins = Object.hasOwn(gains.wins, member.publicId) ? gains.wins[member.publicId] : undefined;
  if (typeof wins !== "number" || !Number.isFinite(wins) || wins < 0) return null;
  return { wins, since: gains.since, until: gains.until };
}
