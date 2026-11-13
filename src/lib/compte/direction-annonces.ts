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

/** `get_site_news` ne donne à l'accueil que les 10 annonces les plus récentes ; `get_direction_overview` en liste 50. */
export const HOME_ANNOUNCEMENTS = 10;
export const LISTED_ANNOUNCEMENTS = 50;

export interface AnnouncementState {
  ton: DirTon;
  label: string;
  /** Vrai pour l'annonce ouverte dans le formulaire. */
  editing: boolean;
}

/**
 * L'état d'une annonce, à son rang dans la liste (0 : la plus récente, l'ordre du serveur). Jaune : ouverte dans le
 * formulaire. Vert : parmi les 10 dernières, donc sur l'accueil. Gris : plus ancienne, l'accueil ne la montre plus.
 */
export function announcementState(index: number, id: number, editingId: number | null): AnnouncementState {
  if (editingId !== null && id === editingId) return { ton: "warn", label: "En modification", editing: true };
  return index < HOME_ANNOUNCEMENTS ? { ton: "ok", label: "Sur l'accueil", editing: false } : { ton: "muted", label: "Hors de l'accueil", editing: false };
}

export interface FieldCount {
  /** « 12 sur 120 ». */
  text: string;
  /** À neuf dixièmes de la limite ou plus : le compteur passe au jaune. */
  near: boolean;
}

/** Le compteur d'un champ limité, en mots : la longueur que le navigateur compte pour `maxlength`. */
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
