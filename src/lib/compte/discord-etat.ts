/**
 * L'état d'un réglage de l'onglet Discord de la Direction, d'un coup d'œil (14 novembre 2026, demande du pilote : les
 * onglets « comme pour la section compte », avec des codes couleur). Une couleur et son mot, tirés de ce que le serveur
 * rend déjà (`set`, `last`, `check`…) : rien n'est deviné, et un état inconnu n'est jamais une réussite. Les phrases
 * complètes restent celles de `discord-appels.ts`, `discord-salons.ts` et `discord-message.ts`.
 *
 * Vert `ok` en règle, jaune `warn` à regarder, rouge `danger` en échec, bleu `ally` une information, gris `muted` rien à faire.
 * Du plus grave au moins grave : rouge, jaune, bleu, vert, gris (`TONS_DU_PLUS_GRAVE`).
 */
import type { DiscordCalls, LastSend } from "./discord-appels";
import type { SavedImage } from "./discord-images";
import type { MessageSalon, SentMessage } from "./discord-message";
import { checkFails, type RobotCheck, type RobotSalon, type RobotSalonId } from "./discord-salons";

export type EtatTon = "ok" | "warn" | "danger" | "ally" | "muted";

export interface Etat {
  ton: EtatTon;
  mot: string;
}

/** L'ordre des couleurs, de la plus grave à la moins grave : le trait d'un ensemble prend la première trouvée. */
export const TONS_DU_PLUS_GRAVE: readonly EtatTon[] = ["danger", "warn", "ally", "ok", "muted"];

const BRANCHE: Etat = { ton: "ok", mot: "Branché" };
const PAS_REGLE: Etat = { ton: "warn", mot: "Pas réglé" };
const SANS_REPONSE: Etat = { ton: "warn", mot: "Discord sans réponse" };
/** Discord a répondu, mais par une erreur qui ne dit pas que le lien est mauvais : trop de messages (429), panne (5xx)… */
const EN_ERREUR: Etat = { ton: "warn", mot: "Discord en erreur" };

const rang = (ton: EtatTon) => TONS_DU_PLUS_GRAVE.indexOf(ton);

/** Le plus grave de plusieurs états ; `null` s'il n'y en a aucun. À gravité égale, le premier donné. */
function lePlusGrave(etats: readonly (Etat | null)[]): Etat | null {
  let grave: Etat | null = null;
  for (const etat of etats) if (etat !== null && (grave === null || rang(etat.ton) < rang(grave.ton))) grave = etat;
  return grave;
}

/** Ce que le dernier envoi change à l'état d'un salon branché ; `null` : rien, l'envoi est accepté, oublié ou absent. */
function etatDuDernierEnvoi(last: LastSend | null): Etat | null {
  switch (last?.outcome.state) {
    case "refused":
      return { ton: "danger", mot: "Dernier envoi refusé" };
    case "unsent":
      return { ton: "danger", mot: "Dernier envoi non parti" };
    case "timeout":
    case "silent":
      return SANS_REPONSE;
    case "waiting":
      return { ton: "ally", mot: "Essai en cours" };
    default:
      return null;
  }
}

/**
 * Ce que dit le contrôle du robot quand ce n'est pas une réussite. `refus` : le mot d'un lien que Discord ne connaît pas
 * ou qui n'a pas la forme d'un webhook (`checkFails`). `null` : le webhook répond.
 */
function etatDuControle(check: RobotCheck, refus: Etat): Etat | null {
  if (checkFails(check)) return refus;
  if (check.status === null || (check.status >= 200 && check.status < 300)) return null;
  return check.status === 0 ? SANS_REPONSE : EN_ERREUR;
}

const temps = (iso: string) => Date.parse(iso);

/**
 * Un salon du robot.
 *
 * Branché ici : le plus grave du dernier essai et du dernier contrôle du robot sur ce lien, sinon « Branché ». Le plus
 * récent fait foi : un essai envoyé après le contrôle le remplace, sauf si sa réponse n'est plus gardée. Un contrôle qui
 * réussit n'efface pas un essai refusé, car il lit le webhook sans rien poster (un salon de type forum répond, mais refuse
 * les messages). Un contrôle d'un autre lien (le secret GitHub, ou aucun) date d'avant le réglage : il ne compte pas.
 *
 * Pas branché ici : le robot peut poster avec le secret GitHub, ce que dit son dernier contrôle ; sinon, rien ne part.
 */
export function etatDuSalon(salon: RobotSalon): Etat {
  const { check, last } = salon;
  if (salon.set) {
    const essaiPlusRecent = check !== null && last !== null && last.outcome.state !== "forgotten" && temps(last.at) >= temps(check.at);
    const controle = check?.source === "direction" && !essaiPlusRecent ? etatDuControle(check, { ton: "danger", mot: "Lien refusé" }) : null;
    return lePlusGrave([controle, etatDuDernierEnvoi(last)]) ?? BRANCHE;
  }
  if (check?.source !== "secret") return PAS_REGLE;
  return etatDuControle(check, { ton: "danger", mot: "Secret GitHub refusé" }) ?? { ton: "ally", mot: "Par le secret GitHub" };
}

/** Les appels du QG sur Discord. */
export function etatDesAppels(calls: DiscordCalls): Etat {
  if (!calls.set) return PAS_REGLE;
  return etatDuDernierEnvoi(calls.last) ?? BRANCHE;
}

/** Le ping des appels : possible seulement avec un rôle réglé. `null` : pas de salon, donc rien à dire. */
export function etatDuPing(calls: DiscordCalls): Etat | null {
  if (!calls.set) return null;
  return calls.role ? { ton: "ally", mot: "Ping possible" } : { ton: "muted", mot: "Sans ping" };
}

/** Le lien du salon vocal, lu par `get_qg_tools` (`null` : pas de lien). */
export const etatDuVocal = (voice: string | null): Etat => (voice === null ? PAS_REGLE : { ton: "ok", mot: "Réglé" });

/** L'inventaire d'images : son nombre, et les images dont le fichier manque. Un inventaire vide ne dit rien. */
export function etatsDesImages(images: readonly SavedImage[]): Etat[] {
  const missing = images.filter((image) => image.missing).length;
  const etats: Etat[] = [];
  if (images.length > 0) etats.push({ ton: "muted", mot: images.length === 1 ? "1 image" : `${images.length} images` });
  if (missing > 0) etats.push({ ton: "warn", mot: missing === 1 ? "1 fichier manquant" : `${missing} fichiers manquants` });
  return etats;
}

/**
 * Un salon ajouté pour les messages : ce que Discord a répondu à la lecture de son webhook. Comme pour les salons du robot,
 * seul un lien que Discord ne connaît pas (400, 401, 403, 404) est refusé ; une autre erreur (429, 5xx) est à revoir.
 */
export function etatDuSalonAjoute(salon: MessageSalon): Etat {
  if (salon.checking) return { ton: "ally", mot: "Vérification" };
  const status = salon.checkStatus;
  if (status === null) return { ton: "muted", mot: "Pas vérifié" };
  if (status === 0) return SANS_REPONSE;
  if (status >= 200 && status < 300) return { ton: "ok", mot: "Lien vérifié" };
  return status === 400 || status === 401 || status === 403 || status === 404 ? { ton: "danger", mot: "Lien refusé" } : EN_ERREUR;
}

/** Un message envoyé : retiré du salon, sinon ce que Discord a répondu à l'envoi. */
export function etatDuMessage(message: SentMessage): Etat {
  if (message.remove.state === "done") return { ton: "muted", mot: "Retiré" };
  switch (message.outcome.state) {
    case "accepted":
      return { ton: "ok", mot: "Accepté" };
    case "refused":
      return { ton: "danger", mot: "Refusé" };
    case "unsent":
    case "unreached":
      return { ton: "danger", mot: "Non parti" };
    case "timeout":
    case "silent":
      return { ton: "warn", mot: "Sans réponse" };
    case "waiting":
      return { ton: "ally", mot: "En attente" };
    case "forgotten":
      return { ton: "muted", mot: "Envoyé" };
  }
}

/** Le plus grave de plusieurs états, pour le trait de couleur d'un ensemble : rouge, puis jaune, bleu, vert et gris. */
export function tonLePlusGrave(etats: readonly Etat[]): EtatTon {
  return lePlusGrave(etats)?.ton ?? "muted";
}

/* ---------- Le menu de l'onglet ---------- */

/** Une lecture du serveur pour le menu : `undefined` pas encore faite, `null` impossible ou illisible. */
export type Lu<T> = T | null | undefined;

/** Un état sur une ligne du menu : son mot, précédé au besoin du nom de ce qu'il décrit. `plain` : le point et le mot seuls. */
export interface EtatDuMenu extends Etat {
  nom?: string;
  plain?: boolean;
}

/** Une lecture ratée : l'état n'est pas connu, ce qui n'est ni une réussite ni un échec. */
export const ETAT_NON_LU: EtatDuMenu = { ton: "muted", mot: "État non lu" };

/** Le nom court d'un salon du robot, devant son état sur la ligne du menu. */
export const NOMS_COURTS: Readonly<Record<RobotSalonId, string>> = { nouvelles: "Nouvelles", encadrement: "Encadrement", victoires: "Victoires", alliance: "Alliance" };

/** La ligne « Salons du robot » : l'état de chaque salon, avec son nom. Rien tant que la lecture n'est pas faite. */
export function etatsDuMenuSalons(salons: Lu<readonly RobotSalon[]>): EtatDuMenu[] {
  if (salons === undefined) return [];
  if (salons === null) return [ETAT_NON_LU];
  return salons.map((salon) => ({ ...etatDuSalon(salon), nom: NOMS_COURTS[salon.id] }));
}

/** La ligne « Appels sur Discord » : le salon, puis le ping, en point seul (il ne colore pas la ligne). */
export function etatsDuMenuAppels(calls: Lu<DiscordCalls>): EtatDuMenu[] {
  if (calls === undefined) return [];
  if (calls === null) return [ETAT_NON_LU];
  const ping = etatDuPing(calls);
  return ping ? [etatDesAppels(calls), { ...ping, plain: true }] : [etatDesAppels(calls)];
}

/** La ligne « Salon vocal ». `false` : la lecture dit qu'il n'y a pas de lien. */
export function etatsDuMenuVocal(voice: Lu<string | false>): EtatDuMenu[] {
  if (voice === undefined) return [];
  if (voice === null) return [ETAT_NON_LU];
  return [etatDuVocal(voice === false ? null : voice)];
}

/** La ligne « Inventaire d'images » : le nombre d'images en point seul (ce n'est pas un état), puis les fichiers manquants. */
export function etatsDuMenuImages(images: readonly SavedImage[] | null, problem: string | null): EtatDuMenu[] {
  if (images !== null) return etatsDesImages(images).map((etat) => (etat.ton === "muted" ? { ...etat, plain: true } : etat));
  return problem !== null ? [ETAT_NON_LU] : [];
}

/** Le trait au bord d'une ligne du menu : la couleur la plus grave de ses réglages, sans les points seuls. `undefined` : pas de trait. */
export function traitDuMenu(etats: readonly EtatDuMenu[]): EtatTon | undefined {
  const reglages = etats.filter((etat) => !etat.plain);
  return reglages.length > 0 ? tonLePlusGrave(reglages) : undefined;
}

/* ---------- Les boutons qui effacent au second clic ---------- */

/**
 * Un clic sur un bouton qui efface au second clic : le premier arme, le suivant confirme. Le second clic d'un double clic
 * (`detail` de l'évènement, 2 ou plus) ne confirme pas : un double clic par habitude n'efface rien. Au clavier, `detail`
 * vaut 0.
 */
export function clicSurBoutonArme(armed: boolean, detail: number): "armer" | "confirmer" | "rien" {
  if (!armed) return "armer";
  return detail > 1 ? "rien" : "confirmer";
}

/**
 * Le focus quitte un bouton armé : il se désarme si le focus va ailleurs dans la page. Une perte sans destination
 * (`relatedTarget` nul) ne compte pas : Safari et Firefox sur Mac la donnent au clic sur le bouton lui-même, et le
 * second clic n'aboutirait jamais.
 */
export const desarmerALaPerte = (relatedTarget: EventTarget | null): boolean => relatedTarget !== null;
