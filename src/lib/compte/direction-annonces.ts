/**
 * Les règles de l'onglet Annonces de la Direction (`DirectionAnnonces.tsx`) : l'état d'une ligne et sa couleur, les
 * compteurs des champs, l'extrait du texte et le nom du site d'un lien. Rien n'est inventé : tout vient des lignes de
 * `get_direction_overview` et des limites écrites dans le SQL.
 */
import type { DirTon } from "../../components/compte/direction-kit";
import { fmtInt } from "../format";
import { safeUrl } from "./news";

/** Les limites de `save_announcement` et de `internal.check_news_url` (migration 20261105000900_direction.sql). */
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;
export const ANNOUNCEMENT_URL_MAX = 500;

/**
 * Les annonces que l'accueil montre : `get_site_news` donne les 10 plus récentes (`order by created_at desc limit 10`,
 * dernière version dans 20261109000200_gaulois_de_la_semaine.sql), sans autre filtre, et `NewsBoard.tsx` les affiche
 * toutes, mêlées à celles du dépôt qui n'en cachent aucune. `get_direction_overview` liste les 50 plus récentes, dans le
 * même ordre (`order by created_at desc limit 50`, 20261105000900_direction.sql). `tests/unit/direction-annonces.test.ts`
 * relit ces deux nombres dans les migrations.
 */
export const HOME_ANNOUNCEMENTS = 10;
export const LISTED_ANNOUNCEMENTS = 50;

/**
 * La place d'une annonce à l'accueil. `unsure` : deux annonces de la même heure, à la microseconde, se partagent la dixième
 * place ; le serveur peut alors donner l'une ou l'autre à l'accueil, et l'onglet ne le sait pas.
 */
export type HomePlace = "home" | "off" | "unsure";

/**
 * La place de chaque annonce, dans l'ordre du serveur (la plus récente d'abord), d'après leurs heures de création telles
 * que le serveur les écrit : deux heures égales ont la même écriture dans une même réponse.
 */
export function homePlaces(createdAt: readonly string[]): HomePlace[] {
  const last = createdAt[HOME_ANNOUNCEMENTS - 1];
  const tie = last !== undefined && createdAt[HOME_ANNOUNCEMENTS] === last ? last : null;
  return createdAt.map((at, index) => (tie !== null && at === tie ? "unsure" : index < HOME_ANNOUNCEMENTS ? "home" : "off"));
}

export interface AnnouncementState {
  ton: DirTon;
  label: string;
  /** Vrai pour l'annonce ouverte dans le formulaire. */
  editing: boolean;
}

/**
 * L'état d'une annonce. Jaune : ouverte dans le formulaire. Vert : parmi les 10 dernières, donc sur l'accueil. Gris : plus
 * ancienne, l'accueil ne la montre plus, ou sa place n'est pas sûre (`homePlaces`).
 */
export function announcementState(place: HomePlace, editing: boolean): AnnouncementState {
  if (editing) return { ton: "warn", label: "En modification", editing: true };
  if (place === "home") return { ton: "ok", label: "Sur l'accueil", editing: false };
  if (place === "unsure") return { ton: "muted", label: "Accueil incertain", editing: false };
  return { ton: "muted", label: "Hors de l'accueil", editing: false };
}

/**
 * Vrai si l'annonce ouverte dans le formulaire n'est plus dans la liste relue (supprimée, ou sortie des 50 dernières) :
 * le formulaire se vide.
 */
export const draftGone = (editingId: number | null, listed: readonly number[]): boolean => editingId !== null && !listed.includes(editingId);

export interface FieldCount {
  /** « 12 sur 120 ». */
  text: string;
  /** À neuf dixièmes de la limite ou plus : le compteur passe au jaune. */
  near: boolean;
}

/**
 * Le compteur d'un champ limité, en mots. Il compte comme `maxlength`, en unités UTF-16 (`length`) : une lettre accentuée
 * en vaut une, un émoji deux. Le serveur compte en caractères (`char_length`) : il n'en refuse jamais plus que le champ.
 */
export function fieldCount(value: string, max: number): FieldCount {
  return { text: `${fmtInt(value.length)} sur ${fmtInt(max)}`, near: value.length >= max * 0.9 };
}

/** Le texte d'une annonce sur une seule ligne : retours à la ligne et espaces répétés deviennent une espace. */
export const announcementExcerpt = (body: string): string => body.replace(/\s+/g, " ").trim();

/** Le lien d'une annonce et le nom de son site (« example.org »), ou `null` si le lien manque ou n'est pas en https. */
export function announcementLink(url: string | null): { href: string; host: string } | null {
  const href = safeUrl(url);
  if (!href) return null;
  try {
    return { href, host: new URL(href).hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** « 1 annonce », « 8 annonces » : le nombre de lignes reçues, jamais écrit pour une liste vide. */
export const announcementCount = (count: number): string => (count === 1 ? "1 annonce" : `${fmtInt(count)} annonces`);

/** Vrai si la liste est peut-être coupée : le serveur ne donne que les 50 dernières. */
export const announcementsCapped = (count: number): boolean => count >= LISTED_ANNOUNCEMENTS;
