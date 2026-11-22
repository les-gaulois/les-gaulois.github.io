/**
 * L'image d'une victoire en duel de cartes, telle que le robot la poste sur Discord (`duels-discord.ts`) : « La grande
 * scène », choisie parmi trois propositions de Claude Fable 5.2, montrées au pilote le 22 novembre 2026.
 *
 * - En haut, l'en-tête serré des images du robot : le badge, l'invite de « Mon Gaulois », la date du duel à droite, puis le
 *   titre, « Brennos bat Sucellos », en Inter (un pseudo ne s'écrit jamais en onciale).
 * - Au milieu, la scène sur toute la largeur, à 6 pixels par case : la bannière du lieu du duel entière (du vaincu, ou de qui
 *   attendait dans la salle), avec son cadre de rareté,
 *   le vainqueur debout et le vaincu couché (`supabase/functions/code-discord/duel-image.ts`).
 * - En bas, une seule rangée : les manches, la carte décisive dans sa vitrine (son dessin, son nom, sa rareté en toutes
 *   lettres) et la salle d'un duel misé. Sans mise, rien à la place : jamais un solde ni un gain.
 *
 * 1 200 × 762 : 1,57 fois plus large que haute, comme les autres images du robot, que Discord montre dans 550 × 350.
 */
import { familierAPoser } from "../../supabase/functions/code-discord/familiers/familier";
import { familierDe } from "../../supabase/functions/code-discord/familiers/index";
import { casesDuDuel, fondDuDuel, SCENE_DU_DUEL, type Duelliste } from "../../supabase/functions/code-discord/duel-image";
import { COULEURS_RARETE, renderAchatsCard, vitrine, type AchatsCard, type Boite, type DessinPose } from "./achats-image";
import { dateLongue, heureEnMots } from "./achats-discord";
import { carteEnClair, SANS_PSEUDO, SANS_PSEUDO_APRES, type GauloisDuDuel, type VictoireEnDuel } from "./duels-discord";
import { fmtInt } from "./format";
import { CARD_COLORS as C, MARGIN, fitted, kpiParts, promptParts, type CardRect, type CardText, type GazetteFonts, type Measure } from "./gazette-image";
import { vignetteDeLObjet, type Vignette } from "./gaulois";

export const WIDTH = 1200;
export const HEIGHT = 762;
/** Une case de la scène, en pixels : la scène fait 188 × 6 = 1 128 pixels, d'un bord à l'autre de l'image. */
export const ECHELLE_SCENE = 6;
/** Le badge du clan, plus petit que sur les autres images : la scène prend la place. */
const BADGE = { x: MARGIN, y: 18, size: 84 } as const;
const TETE_X = BADGE.x + BADGE.size + 24;
const LIGNES = { tribar: 18, invite: 46, titre: 96 } as const;
const INVITE = 21;
/** Le haut de la scène, et celui de la rangée du bas. */
export const SCENE_Y = 116;
const RANGEE_Y = SCENE_Y + SCENE_DU_DUEL.hauteur * ECHELLE_SCENE + 18;
/** La rangée du bas : ses colonnes, et sa hauteur. */
const RANGEE_HAUTEUR = 110;
const COLONNES = { manches: { x: MARGIN, width: 190 }, carte: { x: MARGIN + 214 }, salle: { x: MARGIN + 838, width: 290 } } as const;
const VITRINE = { width: 132, marge: 9, maxEchelle: 6, coupe: 12 } as const;

/** L'image : la carte du robot (en-tête, rangée, filets), puis la scène et la carte décisive, posées en cases entières. */
export type DuelCard = AchatsCard;

/** Le nom tel que l'image l'écrit : sans ce que la police ne sait pas dessiner ; s'il n'en reste ni lettre ni chiffre, « Un Gaulois ». */
export function nomSurLImage(g: Pick<GauloisDuDuel, "pseudo">, draws: (char: string) => boolean = () => true): string | null {
  if (!g.pseudo) return null;
  const garde = [...g.pseudo]
    .filter((char) => char === " " || draws(char))
    .join("")
    .replace(/ +/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(garde) ? garde : null;
}

/** Le titre : « Brennos bat Sucellos », « Un Gaulois bat Sucellos », « Brennos bat un Gaulois ». Les manches sont dessous. */
export function titreSurLImage(v: Pick<VictoireEnDuel, "vainqueur" | "vaincu">, draws?: (char: string) => boolean): string {
  return `${nomSurLImage(v.vainqueur, draws) ?? SANS_PSEUDO} bat ${nomSurLImage(v.vaincu, draws) ?? SANS_PSEUDO_APRES}`;
}

/** La date du duel, à droite de l'invite : « Le 22 novembre 2026 à 21 h 05 ». */
export const dateDuDuel = (le: string): string => `Le ${dateLongue(le)} à ${heureEnMots(le)}`;

/** Un des deux Gaulois, prêt à poser : sa tenue, et son familier rogné à son cadre (un familier inconnu ne se montre pas). */
function duelliste(g: GauloisDuDuel): Duelliste {
  const familier = g.familier ? familierDe(g.familier) : null;
  return { tenue: g.tenue, familier: familier ? familierAPoser(familier) : null };
}

/** La scène, posée sous l'en-tête, d'un bord à l'autre. */
export function sceneDeLImage(v: VictoireEnDuel): DessinPose {
  const cases = casesDuDuel(duelliste(v.vainqueur), duelliste(v.vaincu), fondDuDuel(v.lieu, new Date(v.le)));
  return { decor: { largeur: SCENE_DU_DUEL.largeur, hauteur: SCENE_DU_DUEL.hauteur, cases }, echelle: ECHELLE_SCENE, x: MARGIN, y: SCENE_Y };
}

/** Le plus grand dessin entier qui tienne dans la boîte, centré, avec `marge` pixels de jour. */
export function placerDansLaBoite(vignette: Vignette | null, boite: Boite, marge: number, maxEchelle: number): DessinPose | null {
  if (!vignette) return null;
  const echelle = Math.max(1, Math.min(maxEchelle, Math.floor((boite.width - 2 * marge) / vignette.largeur), Math.floor((boite.height - 2 * marge) / vignette.hauteur)));
  return { decor: vignette, echelle, x: Math.round(boite.x + (boite.width - vignette.largeur * echelle) / 2), y: Math.round(boite.y + (boite.height - vignette.hauteur * echelle) / 2) };
}

/** Un libellé de la machine, en capitales, au-dessus d'une valeur. */
const libelle = (text: string, x: number, y: number): CardText => ({ text: text.toLocaleUpperCase("fr"), x, y, size: 22, font: "monoStrong", color: C.MUTED, tracking: 0.06 });

/**
 * Quoi écrire et où, à partir de la victoire seule : se teste sans police. `draws` : la police sait-elle dessiner ce
 * caractère ? Sans elle (les tests), tout se dessine.
 */
export function duelCard(v: VictoireEnDuel, measure: Measure, draws?: (char: string) => boolean): DuelCard {
  const prompt = promptParts("/village", TETE_X, LIGNES.invite, INVITE, measure);
  const rects: CardRect[] = [...[C.BLUE, C.WHITE, C.RED].map((color, i) => ({ x: TETE_X + i * 33, y: LIGNES.tribar, width: 30, height: 5, radius: 0, color })), ...prompt.rects];
  const texts: CardText[] = [...prompt.texts];
  // La date à droite de l'invite, réduite s'il le faut pour ne pas toucher le curseur.
  const finInvite = Math.max(...prompt.rects.map((r) => r.x + r.width));
  texts.push({ ...fitted(dateDuDuel(v.le), "body", 22, 15, WIDTH - MARGIN - finInvite - 24, measure), x: WIDTH - MARGIN, y: LIGNES.invite, font: "body", color: C.MUTED, anchor: "end" });
  texts.push({ ...fitted(titreSurLImage(v, draws), "strong", 46, 22, WIDTH - MARGIN - TETE_X, measure), x: TETE_X, y: LIGNES.titre, font: "strong", color: C.WHITE });

  const scene = sceneDeLImage(v);
  // Le filet autour de la scène : deux pixels, comme le contour d'une vitrine.
  rects.push({ x: scene.x - 2, y: scene.y - 2, width: scene.decor.largeur * scene.echelle + 4, height: scene.decor.hauteur * scene.echelle + 4, radius: 0, color: C.LINE_STRONG });
  const dessins: DessinPose[] = [scene];

  const y = RANGEE_Y;
  const manches = kpiParts([{ label: v.manches > 1 ? "Manches" : "Manche", value: fmtInt(v.manches) }], { ...COLONNES.manches, y, valueSize: 64 }, measure);
  rects.push(...manches.rects.map((r) => ({ ...r, height: Math.min(r.height, RANGEE_HAUTEUR) })));
  texts.push(...manches.texts);

  // La carte décisive : le filet des chiffres clés, sa vitrine, son nom et sa rareté ; sans elle, comment le duel a fini.
  const cx = COLONNES.carte.x;
  const largeurCarte = (v.salle === null ? WIDTH - MARGIN : COLONNES.salle.x - 24) - cx;
  // Une carte inconnue de ce code ne fait rien écrire, ni filet : la colonne reste vide plutôt que d'inventer une fin.
  if (v.carte !== "inconnue") rects.push({ x: cx, y, width: 2, height: RANGEE_HAUTEUR, radius: 0, color: C.HAIRLINE }, { x: cx, y, width: 2, height: 26, radius: 0, color: C.WHITE });
  const carte = carteEnClair(v.carte);
  if (carte && v.carte && v.carte !== "inconnue") {
    const boite: Boite = { x: cx + 22, y, width: VITRINE.width, height: RANGEE_HAUTEUR };
    // Une carte de base n'a pas de rareté : sa vitrine garde le filet des autres cadres.
    rects.push(carte.rarete ? { ...vitrine(boite, carte.rarete), cut: VITRINE.coupe } : { ...boite, radius: 0, color: C.SURFACE, to: C.SURFACE_2, stroke: C.LINE_STRONG, cut: VITRINE.coupe });
    const dessin = placerDansLaBoite(vignetteDeLObjet(v.carte.emplacement, v.carte.objet), boite, VITRINE.marge, VITRINE.maxEchelle);
    if (dessin) dessins.push(dessin);
    const tx = boite.x + boite.width + 20;
    const room = largeurCarte - (tx - cx) - 12;
    texts.push(libelle("Carte décisive", tx, y + 21));
    texts.push({ ...fitted(carte.nom, "strong", 34, 22, room, measure), x: tx, y: y + 66, font: "strong", color: C.WHITE });
    // La rareté en toutes lettres : la couleur du cadre ne la dit pas seule.
    const mots = `${carte.rareteEnMots}, ${carte.place}`;
    texts.push({ ...fitted(mots, "strong", 24, 22, room, measure), x: tx, y: y + 102, font: "strong", color: carte.rarete ? COULEURS_RARETE[carte.rarete].texte : C.MUTED });
  } else if (v.carte === null) {
    // Le serveur dit que le vaincu est tombé sans coup. Une carte inconnue de ce code, elle, ne fait rien écrire.
    const room = largeurCarte - 34;
    texts.push(libelle("Fin du duel", cx + 22, y + 21));
    texts.push({ ...fitted("Tombé sans coup", "strong", 34, 22, room, measure), x: cx + 22, y: y + 66, font: "strong", color: C.WHITE });
    texts.push({ ...fitted("fatigue ou blessures", "body", 24, 22, room, measure), x: cx + 22, y: y + 102, font: "body", color: C.MUTED });
  }

  if (v.salle !== null) {
    // « Salle des » en libellé, la mise en chiffre, « statères » dessous : la phrase se lit de haut en bas.
    const salle = kpiParts([{ label: "Salle des", value: fmtInt(v.salle), hint: { text: v.salle > 1 ? "statères" : "statère" } }], { ...COLONNES.salle, y, valueSize: 64 }, measure);
    rects.push(...salle.rects.map((r) => ({ ...r, height: Math.min(r.height, RANGEE_HAUTEUR) })));
    texts.push(...salle.texts.map((t) => (t.font === "body" ? { ...t, y: y + 108, size: 24 } : t)));
  }
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: BADGE, dessins };
}

/** Dessine l'image en PNG : la carte, puis la scène et la carte décisive posées case par case, sans lissage. */
export const renderDuelCard = (card: DuelCard, fonts: GazetteFonts, root: string): Promise<Buffer> => renderAchatsCard(card, fonts, root);
