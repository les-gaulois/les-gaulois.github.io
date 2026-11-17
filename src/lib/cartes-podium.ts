/**
 * Les cartes du podium, sur l'accueil (demande du pilote, 17 novembre 2026 : « des gros personnages animés » pour le top 3,
 * à la place du guerrier en relief) : une carte par joueur du podium de la dernière gazette (« Le plus de victoires »),
 * avec son Gaulois, sa bannière s'il en a choisi une, sa place et ses victoires. Rien n'est calculé ici : les places et
 * les victoires sont celles du podium de la gazette (`src/lib/week-players.ts`), les Gaulois et les bannières ceux relevés
 * à la dernière construction (`gaulois-site.ts`, `bannieres-joueurs.ts`).
 *
 * Les cartes ne remplacent le guerrier que si le podium tient en trois cartes (une égalité qui garde quatre joueurs n'en
 * écarte aucun : le guerrier reste) et si au moins un de ses joueurs a créé son Gaulois. Un joueur sans Gaulois garde sa
 * carte, sans personnage ; un joueur sans bannière, une carte au fond uni.
 */
import type { PortraitDeGaulois } from "./gaulois-site";

/** Le podium tient en trois cartes, pas plus. */
export const CARTES_DU_PODIUM = 3;

/** Le liseré de la carte : il se gagne par la place, il ne s'achète pas. */
export type MetalDeCarte = "or" | "argent" | "bronze";

export interface CarteDuPodium {
  id: string;
  username: string;
  /** 1 pour le premier : deux joueurs à égalité partagent la même place. */
  place: number;
  wins: number;
  metal: MetalDeCarte;
  portrait: PortraitDeGaulois | null;
  /** La taille du Gaulois sur sa carte, en cases de la carte par pixel de son image. */
  echelle: number;
  /** L'adresse de l'image de sa bannière (sans la base du site), ou `null` s'il n'en a pas choisi. */
  banniere: string | null;
}

/** La carte fait 48 cases sur 80 : le Gaulois y tient dans 42 cases de large et 58 de haut, jamais plus grand que 0,78. */
export function echelleDuGaulois({ largeur, hauteur }: Pick<PortraitDeGaulois, "largeur" | "hauteur">): number {
  return Math.min(0.78, 42 / largeur, 58 / hauteur);
}

const metalDeLaPlace = (place: number): MetalDeCarte => (place <= 1 ? "or" : place === 2 ? "argent" : "bronze");

/** Les cartes à montrer, dans l'ordre du podium, ou `null` : le guerrier reste. */
export function cartesDuPodium(
  players: readonly { id: string; username: string; place: number; wins: number }[] | null | undefined,
  portraitDe: (id: string) => PortraitDeGaulois | null,
  banniereDe: (id: string) => string | null,
): CarteDuPodium[] | null {
  if (!players || players.length === 0 || players.length > CARTES_DU_PODIUM) return null;
  const cartes = players.map(({ id, username, place, wins }): CarteDuPodium => {
    const portrait = portraitDe(id);
    return { id, username, place, wins, metal: metalDeLaPlace(place), portrait, echelle: portrait ? echelleDuGaulois(portrait) : 0, banniere: banniereDe(id) };
  });
  return cartes.some((c) => c.portrait !== null) ? cartes : null;
}

/**
 * La période des chiffres, écrite sous les cartes : « Le plus de victoires de la semaine du 9 nov. au 15 nov. 2026 », ou,
 * quand le relevé du podium a commencé après le lundi, ses propres dates (« du 12 nov. au 15 nov. », `playersPeriod`).
 */
export function legendeDuPodium(periode: string | null, semaine: string): string {
  return `Le plus de victoires ${periode && periode !== "de la semaine" ? periode : `de la semaine ${semaine}`}`;
}
