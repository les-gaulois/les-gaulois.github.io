/**
 * Les émojis du robot « Le Gaulois » sur Discord : les icônes en pixels du site (`icones-parties.ts`), posées sur les boutons
 * du panneau des rôles et des tickets. Ainsi la rangée de boutons répète l'image qui est au-dessus, avec les mêmes dessins
 * dans le même ordre, et ne ressemble à aucun autre robot. Ce sont des émojis de l'application, pas du serveur : la fonction
 * `code-discord` les dépose elle-même chez Discord la première fois qu'elle en a besoin, puis s'en sert par leur numéro.
 * Le site les dessine à chaque construction, en PNG de 128 pixels de côté.
 * Ce fichier dit quoi dessiner ; il se teste sans rien dessiner.
 */
import { createHash } from "node:crypto";
import { CARD_COLORS as C } from "./gazette-image";
import { iconRects } from "./lignes-icones-image";
import { ICONES_PARTIES, type IconePartieNom } from "./icones-parties";

/** Le côté d'un émoji : Discord demande 128 pixels au plus. */
export const EMOJI_SIZE = 128;
/** Treize cases de neuf pixels, au milieu : 117 pixels de dessin. */
const EMOJI_CELL = 9;

export interface DiscordEmoji {
  /** Son nom chez Discord : des lettres, des chiffres et des tirets bas, de 2 à 32 signes. */
  name: string;
  icone: IconePartieNom;
  /** Le bouton qui le porte, écrit comme dans la fonction : un test les compare. */
  button: string;
}

export const DISCORD_EMOJIS: readonly DiscordEmoji[] = [
  { name: "gal_cor", icone: "cor", button: "Rassemblement" },
  { name: "gal_cadeau", icone: "cadeau", button: "Giveaway" },
  { name: "gal_epees", icone: "epees", button: "Tournois" },
  { name: "gal_bouclier", icone: "bouclier", button: "Membre GAL" },
  { name: "gal_casque", icone: "casque", button: "Mes rôles" },
  { name: "gal_porte", icone: "porte", button: "Rejoindre le clan" },
  { name: "gal_corbeau", icone: "corbeau", button: "Poser une question" },
  { name: "gal_poignard", icone: "poignard", button: "Signaler un tricheur" },
  { name: "gal_tour", icone: "tour", button: "Je m'en occupe" },
  { name: "gal_cle", icone: "cle", button: "Fermer le ticket" },
];

/**
 * L'émoji en SVG : les cases pleines en blanc, celles en demi-teinte en blanc à moitié transparent, sur un fond transparent.
 * Le blanc se lit sur chacun des boutons de Discord, bleu, gris ou rouge.
 */
export function emojiSvg(icone: IconePartieNom): string {
  const lines = ICONES_PARTIES[icone];
  const offset = Math.floor((EMOJI_SIZE - lines.length * EMOJI_CELL) / 2);
  const rects = iconRects(lines, offset, offset, EMOJI_CELL, "full", "half")
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${C.WHITE}"${r.color === "half" ? ' fill-opacity="0.55"' : ""}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EMOJI_SIZE}" height="${EMOJI_SIZE}" viewBox="0 0 ${EMOJI_SIZE} ${EMOJI_SIZE}" shape-rendering="crispEdges">${rects}</svg>`;
}

/**
 * Les vignettes : l'icône d'un rôle ou d'une demande, dans la case sombre bordée des images du robot, à côté du texte d'une
 * réponse (« Rôle ajouté ») ou du message d'accueil d'un ticket. Une par icône du panneau et du guichet.
 */
export const VIGNETTE_SIZE = 160;
const VIGNETTE_CELL = 10;
export const VIGNETTE_ICONES: readonly IconePartieNom[] = ["cor", "cadeau", "epees", "bouclier", "porte", "corbeau", "poignard"];

export function vignetteSvg(icone: IconePartieNom): string {
  const lines = ICONES_PARTIES[icone];
  const offset = (VIGNETTE_SIZE - lines.length * VIGNETTE_CELL) / 2;
  const rects = iconRects(lines, offset, offset, VIGNETTE_CELL, C.BLUE_TEXT, C.BLUE)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.color}"/>`)
    .join("");
  const tile = `<rect x="1" y="1" width="${VIGNETTE_SIZE - 2}" height="${VIGNETTE_SIZE - 2}" rx="14" fill="${C.SURFACE_2}" stroke="${C.LINE_STRONG}" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIGNETTE_SIZE}" height="${VIGNETTE_SIZE}" viewBox="0 0 ${VIGNETTE_SIZE} ${VIGNETTE_SIZE}" shape-rendering="crispEdges">${tile}${rects}</svg>`;
}

/** L'adresse d'une image d'icône sur le site, avec la version de son dessin : Discord ne garde pas l'ancienne. */
const versioned = (path: string, svg: string): string => `${path}?v=${createHash("sha256").update(svg).digest("hex").slice(0, 12)}`;

/** Ce que l'index des commandes (`/commandes.json`) donne à la fonction : où lire chaque émoji et chaque vignette. */
export const emojiEntries = (): { name: string; image: string }[] => DISCORD_EMOJIS.map((e) => ({ name: e.name, image: versioned(`/commandes/emojis/${e.name}.png`, emojiSvg(e.icone)) }));
export const vignetteEntries = (): { name: string; image: string }[] => VIGNETTE_ICONES.map((icone) => ({ name: icone, image: versioned(`/commandes/vignettes/${icone}.png`, vignetteSvg(icone)) }));
