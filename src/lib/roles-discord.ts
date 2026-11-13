/**
 * L'image du panneau des rôles sur Discord (docs/DIRECTION.md, « Les rôles sur Discord ») : demandé par le pilote le 12
 * novembre 2026, à la place d'un panneau d'un autre robot. La commande /roles de la fonction `code-discord` la poste avec un
 * bouton par rôle ; un clic donne le rôle, un second le retire. L'image se dessine à la construction du site, avec les
 * images des commandes (`commandes-discord.ts`), et la fonction la lit dans `/commandes.json`.
 *
 * Ici, seulement ce que l'image écrit : le nom de chaque rôle, celui de son bouton, et ce qu'il fait, repris du panneau
 * d'avant. Les numéros des rôles ne sont que dans la fonction, côté serveur : c'est elle qui décide quel rôle se donne. Un
 * test vérifie que les deux listes ont les mêmes rôles, dans le même ordre.
 * Ce fichier dit quoi écrire et où ; il se teste sans police.
 */
import { pageHead, type GazetteCard, type Measure } from "./gazette-image";
import type { IconePartieNom } from "./icones-parties";
import { iconTileParts } from "./lignes-icones-image";
import { shownAddress } from "./salon-discord";
import { assembleCard, FOOTER_HEIGHT, footParts } from "./salon-image";

export interface PanelRole {
  /** Le nom du rôle dans le numéro de son bouton (`PANEL_ROLES` de la fonction). */
  key: string;
  /** Le nom écrit sur le bouton et sur l'image. */
  label: string;
  /** Ce que le rôle fait, comme le disait le panneau d'avant. */
  description: string;
  /** Son icône, dans la grille des icônes du site : la même que l'émoji de son bouton (`emojis-discord.ts`). */
  icone: IconePartieNom;
}

export const PANEL_ROLES: readonly PanelRole[] = [
  { key: "rassemblement", label: "Rassemblement", description: "Être prévenu quand un Gaulois cherche des joueurs", icone: "cor" },
  { key: "giveaway", label: "Giveaway", description: "Être prévenu quand un giveaway commence", icone: "cadeau" },
  { key: "tournois", label: "Tournois", description: "Être prévenu quand un tournoi s'annonce", icone: "epees" },
  { key: "membre", label: "Membre GAL", description: "Être prévenu des annonces du clan", icone: "bouclier" },
];

export const ROLES_KICKER = "Serveur Discord du clan";
export const ROLES_TITLE = "Choisissez vos rôles";
export const ROLES_HOW = "Un clic sur un bouton donne le rôle, un second clic le retire";
export const ROLES_NOTE = "« Mes rôles » : ceux que vous avez";
/** L'invite de l'en-tête, `gal@clan:~$ ./roles` : la commande qui pose le panneau. Il ne mène à aucune page. */
const PROMPT_PATH = "/roles";
/** Deux grandes cases par rangée : quatre rôles, deux rangées. */
export const ROLES_COLUMNS = 2;

/**
 * L'image du panneau, au style des autres images du robot (`salon-image.ts`) : l'en-tête, une grande case par rôle, deux par
 * rangée (sa grande icône, son nom, ce qu'il fait ; `lignes-icones-image.ts`), puis l'adresse du site et ce que montre
 * « Mes rôles ».
 */
export function rolesCard(siteUrl: string, measure: Measure): GazetteCard {
  const address = shownAddress(siteUrl, "");
  const head = pageHead({ path: PROMPT_PATH, title: ROLES_TITLE, kicker: ROLES_KICKER, period: ROLES_HOW }, measure);
  const rows = iconTileParts(PANEL_ROLES, head.bottom, ROLES_COLUMNS, measure);
  const height = rows.bottom + FOOTER_HEIGHT;
  return assembleCard(height, [head, rows, footParts(address, ROLES_NOTE, height, measure)]);
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** La description de l'image, que Discord lit aux lecteurs d'écran : tout ce qu'elle écrit, l'adresse du site comprise. */
export function rolesImageAlt(siteUrl: string): string {
  return [
    `${ROLES_TITLE}, sur le serveur Discord du clan.`,
    `${ROLES_HOW}.`,
    ...PANEL_ROLES.map((role) => `${role.label} : ${lowerFirst(role.description)}.`),
    "Le bouton « Mes rôles » montre ceux que vous avez.",
    `Le site du clan : ${shownAddress(siteUrl, "")}.`,
  ].join(" ");
}
