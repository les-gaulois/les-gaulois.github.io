/**
 * L'onglet « Idées » du QG : filtres, comptes et couleurs d'état. Calculs purs, à partir des idées que rend le serveur
 * (`get_qg`) : rien n'est inventé, un compte à zéro est un vrai zéro.
 */
import type { IdeaStatus, QgIdea } from "./qg";

/** Les couleurs d'état des pièces communes (`direction-kit.tsx`, attribut `data-dir-ton`). */
export type IdeaTone = "ok" | "warn" | "danger" | "ally" | "muted";

/**
 * Une couleur par statut, dans le sens des pièces communes, et toujours avec son mot :
 * - « À l'étude » en jaune : l'idée attend une décision de l'encadrement (à regarder, à faire) ;
 * - « Retenue » en bleu : une information, l'idée est acceptée mais pas encore réalisée ;
 * - « Faite » en vert : c'est fait ;
 * - « Écartée » en gris : plus rien à faire. Pas de rouge : une idée écartée n'est ni un blocage ni un échec, et le rouge
 *   montrerait du doigt le membre qui l'a proposée.
 */
export const IDEA_TONES: Record<IdeaStatus, IdeaTone> = { open: "warn", kept: "ally", done: "ok", declined: "muted" };

/** L'ordre des statuts à l'écran (filtres, choix d'une décision) : de ce qui attend à ce qui est clos. */
export const IDEA_STATUS_ORDER: readonly IdeaStatus[] = ["open", "kept", "done", "declined"];

export type IdeaFilter = IdeaStatus | "mine";

/** Les filtres, dans l'ordre de la barre. `tone` absent : blanc, le filtre ne dit pas un état. */
export const IDEA_FILTERS: readonly { id: IdeaFilter; label: string; tone?: IdeaTone }[] = [
  { id: "open", label: "À l'étude", tone: IDEA_TONES.open },
  { id: "kept", label: "Retenues", tone: IDEA_TONES.kept },
  { id: "done", label: "Faites", tone: IDEA_TONES.done },
  { id: "declined", label: "Écartées", tone: IDEA_TONES.declined },
  { id: "mine", label: "Mes idées" },
];

/** Ce que l'encadrement décide d'une idée à l'étude, dit par un verbe sur le bouton de la ligne, dans l'ordre des boutons. */
export const IDEA_DECISION_VERBS: Record<Exclude<IdeaStatus, "open">, string> = { kept: "Retenir", done: "Faite", declined: "Écarter" };

/** La recherche ne paraît qu'à partir de ce nombre d'idées : en dessous, tout se lit d'un coup d'œil. */
export const IDEA_SEARCH_FROM = 8;

/**
 * Au-delà, le texte d'une idée est coupé à trois lignes, avec « Lire la suite ». Mesuré au banc le 14 novembre 2026 : 241
 * caractères de phrases font au moins quatre lignes de 360 à 1 920 px, le bouton a donc quelque chose à déplier.
 */
export const IDEA_LONG_FROM = 240;

const matches = (idea: QgIdea, filter: IdeaFilter) => (filter === "mine" ? idea.mine : idea.status === filter);

/** Le nombre d'idées de chaque filtre. */
export function ideaCounts(ideas: readonly QgIdea[]): Record<IdeaFilter, number> {
  const counts: Record<IdeaFilter, number> = { open: 0, kept: 0, done: 0, declined: 0, mine: 0 };
  for (const idea of ideas) {
    counts[idea.status] += 1;
    if (idea.mine) counts.mine += 1;
  }
  return counts;
}

/** Le filtre ouvert à l'arrivée : « À l'étude », ou le premier statut qui a des idées quand rien n'est à l'étude. */
export function defaultIdeaFilter(counts: Record<IdeaFilter, number>): IdeaFilter {
  return IDEA_STATUS_ORDER.find((status) => counts[status] > 0) ?? "open";
}

/** Minuscules, sans accents ni ligatures : « Événement » se trouve en tapant « evenement », « cœur » en tapant « coeur ». */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .trim();

/** Les idées dont le texte ou l'auteur contient tous les mots cherchés, dans l'ordre reçu. Une recherche vide ne retire rien. */
export function searchIdeas(ideas: readonly QgIdea[], query = ""): QgIdea[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...ideas];
  return ideas.filter((idea) => {
    const text = plain(`${idea.body} ${idea.author}`);
    return words.every((word) => text.includes(word));
  });
}

/** Les idées d'un filtre, dans l'ordre reçu, réduites à celles que trouve la recherche (`searchIdeas`). */
export function filterIdeas(ideas: readonly QgIdea[], filter: IdeaFilter, query = ""): QgIdea[] {
  return searchIdeas(ideas, query).filter((idea) => matches(idea, filter));
}

/** Une idée longue se replie : plus de `IDEA_LONG_FROM` caractères, ou plus de trois lignes écrites. */
export function isLongIdea(body: string): boolean {
  return body.length > IDEA_LONG_FROM || body.split("\n").length > 3;
}

/** Ce que l'écran envoie à `decide_idea` : le statut, et le mot de l'encadrement ou `null`. */
export interface IdeaDecision {
  status: IdeaStatus;
  note: string | null;
}

/**
 * La décision à envoyer, ou `null` quand elle ne changerait rien (l'envoi reste alors inactif). Le mot part sans ses
 * espaces autour, comme le serveur le garde ; vide, il part `null`. Remise à l'étude : jamais de mot, même s'il en reste un
 * dans le champ caché, puisque le serveur efface alors le mot et la date de la décision (`decide_idea`).
 */
export function ideaDecision(idea: Pick<QgIdea, "status" | "staff_note">, status: IdeaStatus, note: string): IdeaDecision | null {
  const sent = status === "open" ? null : note.trim() || null;
  if (status === idea.status && sent === (idea.staff_note?.trim() || null)) return null;
  return { status, note: sent };
}

/**
 * Après une action sur une idée (décision, suppression), l'idée où remettre le focus du clavier : la même si elle est encore
 * affichée, sinon celle qui a pris sa place, ou la dernière si elle était en bas. `null` : plus aucune idée affichée.
 * `shown` : les idées affichées après l'action ; `index` : la place de l'idée avant l'action.
 */
export function ideaFocusAfter(shown: readonly number[], id: number, index: number): number | null {
  if (shown.includes(id)) return id;
  if (shown.length === 0) return null;
  return shown[Math.min(Math.max(index, 0), shown.length - 1)] ?? null;
}

/**
 * Le filtre après l'envoi d'une idée. Elle est à l'étude, et « Mes idées » la montre aussi ; ailleurs, la liste passe à
 * « À l'étude », où elle paraît en tête : sinon, le membre ne verrait pas ce qu'il vient d'envoyer.
 */
export const filterAfterSend = (filter: IdeaFilter): IdeaFilter => (filter === "mine" ? "mine" : "open");
