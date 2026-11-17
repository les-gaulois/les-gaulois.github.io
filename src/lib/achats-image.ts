/**
 * L'image des achats d'un Gaulois au village, pour le salon des nouvelles (`achats-discord.ts`) : son nom en titre, puis
 * chaque objet reçu dessiné en pixels dans sa vitrine, bordée de la couleur de sa rareté, avec son nom, sa rareté en toutes
 * lettres (la couleur ne la dit pas seule), d'où il vient et son heure. Dans le coin de la vitrine, cinq carrés, pleins jusqu'au
 * rang de la rareté, comme au vestiaire : un repère de forme. Sous l'objet, son ombre, en cases : il est posé, pas collé.
 * Même dessin que les autres images du robot (`gazette-image.ts`, « Les images du robot » de docs/DESIGN.md), et même allure
 * que celle d'un bâtiment fini du village, retirée le 15 novembre 2026. Mise en page de Claude Fable 5.2, à la demande du pilote.
 *
 * Un seul objet : sa vitrine à droite, son nom, sa rareté et son origine à gauche, en chiffres clés. De deux à quatre : une
 * vitrine chacun, côte à côte. Depuis le 15 novembre 2026, un familier sorti de la pochette des familiers s'y annonce de même
 * (« Familier » au lieu d'« Objet »). L'objet vient de `vignetteDeLAchat` (le dessin du vestiaire, ou le familier, rogné à son contour) : chaque case
 * devient un carré d'un nombre entier de pixels, le plus grand qui tienne dans sa vitrine, sans lissage.
 *
 * 1 200 × 660 : 1,82 fois plus large que haut, au-dessus des 1,55 qu'il faut pour que Discord la montre en grand.
 */
import sharp, { type OverlayOptions } from "sharp";
import type { Decor } from "./village/decor";
import { annonceEnMots, BANNIERE, CARTE, choseDe, dateLongue, FAMILIER, heureEnMots, MODELE, nouveautes, origineDe, PAYE_EN_STATERES, type AchatDuVillage, type AnnonceDesAchats, type ChoseRecue } from "./achats-discord";
import { RARETES_DES_OBJETS as RARETES, type RareteDObjet as Rarete, type Vignette } from "./gaulois";
import { CARD_COLORS as C, fitted, kpiParts, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardRect, type CardText, type GazetteCard, type GazetteFonts, type Measure } from "./gazette-image";
import { shownAddress } from "./salon-discord";

/** Un dessin posé sur l'image : ses cases, le coin haut gauche en pixels, le côté d'une case. */
export interface DessinPose {
  decor: Decor;
  x: number;
  y: number;
  echelle: number;
}

/** Les pixels d'un dessin : rouge, vert, bleu, opacité, chaque case un carré plein, sans lissage. */
export function pixelsDuDessin({ decor, echelle }: DessinPose): { data: Buffer; width: number; height: number } {
  const width = decor.largeur * echelle;
  const height = decor.hauteur * echelle;
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < decor.hauteur; row++) {
    for (let column = 0; column < decor.largeur; column++) {
      const color = decor.cases[row * decor.largeur + column];
      if (!color || !/^#[0-9a-f]{6}$/i.test(color)) continue;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      for (let dy = 0; dy < echelle; dy++) {
        let at = ((row * echelle + dy) * width + column * echelle) * 4;
        for (let dx = 0; dx < echelle; dx++) {
          data[at++] = r;
          data[at++] = g;
          data[at++] = b;
          data[at++] = 255;
        }
      }
    }
  }
  return { data, width, height };
}

const WIDTH = 1200;
const HEIGHT = 660;
/** Le haut des vitrines, sous l'en-tête, et le bas de la vitrine d'un objet seul. */
const TOP = 240;
const BOTTOM = HEIGHT - 70;
/** La vitrine d'un objet seul, à droite. */
export const SEULE = { width: 420, gap: 32, maxScale: 10 } as const;
/** Les vitrines côte à côte : l'écart, leur hauteur, la plus grande case. */
export const RANGEE = { gap: 24, height: 232, maxScale: 8 } as const;
/** Le jour autour du dessin, dans sa vitrine. */
const MARGE_VITRINE = 24;
/** Le coin coupé d'une vitrine, comme une scène du site. */
const COUPE = 18;

/** Les jetons de rareté du site (`--rarete-…`) : le bord de la vitrine, et le texte clair, lisible sur l'encre du fond. */
export const COULEURS_RARETE: Readonly<Record<Rarete, { bord: string; texte: string }>> = {
  commun: { bord: "#4AA3FF", texte: "#B5D8FF" },
  "peu-commun": { bord: "#3A4FE8", texte: "#BCC5FF" },
  epique: { bord: "#9B4DFF", texte: "#DCBCFF" },
  mystique: { bord: "#FF2E4A", texte: "#FFB5BD" },
  legendaire: { bord: "#F2B632", texte: "#FFDD80" },
  divin: { bord: "#19D3C5", texte: "#C4FFF7" },
};

export interface AchatsCard extends GazetteCard {
  /** Les objets posés sur l'image, dans l'ordre des achats. */
  dessins: DessinPose[];
}

/** Une vitrine : son rectangle, en pixels. */
interface Boite {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Le jour de Paris d'une heure : deux achats du même jour s'écrivent avec une seule date. */
const memeJour = (achats: readonly AchatDuVillage[]) => new Set(achats.map((a) => dateLongue(a.le))).size === 1;

/** La période de l'en-tête : « Le 14 novembre 2026 à 23 h 15 », « …, de 22 h 10 à 23 h 15 », ou « Du …, …, au …, … ». */
export function periodeDesAchats(achats: readonly AchatDuVillage[]): string {
  const premier = achats[0]!;
  const dernier = achats.at(-1)!;
  if (!memeJour(achats)) return `Du ${dateLongue(premier.le)}, ${heureEnMots(premier.le)}, au ${dateLongue(dernier.le)}, ${heureEnMots(dernier.le)}`;
  const debut = heureEnMots(premier.le);
  const fin = heureEnMots(dernier.le);
  return debut === fin ? `Le ${dateLongue(premier.le)} à ${debut}` : `Le ${dateLongue(premier.le)}, de ${debut} à ${fin}`;
}

/** Où poser l'objet dans sa vitrine : la plus grande case entière qui tienne, centré. `null` : aucun dessin. */
export function placeDansLaVitrine(vignette: Vignette | null, boite: Boite, maxScale: number): DessinPose | null {
  if (!vignette || vignette.largeur < 1 || vignette.hauteur < 1) return null;
  const echelle = Math.max(1, Math.min(maxScale, Math.floor((boite.width - 2 * MARGE_VITRINE) / vignette.largeur), Math.floor((boite.height - 2 * MARGE_VITRINE) / vignette.hauteur)));
  return {
    decor: vignette,
    echelle,
    x: Math.round(boite.x + (boite.width - vignette.largeur * echelle) / 2),
    y: Math.round(boite.y + (boite.height - vignette.hauteur * echelle) / 2),
  };
}

/** Les carrés du rang, dans le coin haut gauche de la vitrine : leur écart au bord, et celui qui les sépare. */
const RANG = { marge: 12, ecart: 5, nombre: 5 } as const;

/**
 * Le rang de la rareté, de 1 à 5, en carrés : pleins, de la couleur de la rareté, jusqu'au rang ; vides ensuite. Ils tiennent
 * dans le jour de la vitrine (`MARGE_VITRINE`), que le dessin ne touche jamais.
 */
function carresDuRang(boite: Boite, rarete: Rarete, taille: number): CardRect[] {
  const y = boite.y + MARGE_VITRINE - taille;
  return Array.from({ length: Math.max(RANG.nombre, RARETES[rarete].rang) }, (_, i) => {
    const x = boite.x + RANG.marge + i * (taille + RANG.ecart);
    return i < RARETES[rarete].rang
      ? { x, y, width: taille, height: taille, radius: 0, color: COULEURS_RARETE[rarete].bord }
      : { x: x + 1, y: y + 1, width: taille - 2, height: taille - 2, radius: 0, color: C.NAVY, stroke: C.LINE_STRONG };
  });
}

/** L'ombre de l'objet, sous lui, en cases : plus étroite que lui, et toujours dans la vitrine. */
function ombreDuDessin(dessin: DessinPose, boite: Boite): CardRect {
  const largeur = dessin.decor.largeur * dessin.echelle;
  const bas = dessin.y + dessin.decor.hauteur * dessin.echelle;
  const height = Math.min(dessin.echelle, 8);
  const retrait = Math.min(2 * dessin.echelle, Math.floor(largeur / 4));
  const y = Math.min(bas + Math.round(dessin.echelle / 2), boite.y + boite.height - 8 - height);
  return { x: dessin.x + retrait, y, width: largeur - 2 * retrait, height, radius: 0, color: C.NAVY };
}

/** Le fond de la vitrine, bordé de la couleur de la rareté. */
const vitrine = (boite: Boite, rarete: Rarete): CardRect => ({ ...boite, radius: 0, color: C.SURFACE, to: C.SURFACE_2, stroke: COULEURS_RARETE[rarete].bord, cut: COUPE });

/** « Légendaire, tête », « Légendaire, familier ». */
const rareteEtPlace = (chose: ChoseRecue) => `${RARETES[chose.rarete].nom}, ${chose.place}`;

/** Ce que dit l'origine, sous le chiffre clé d'un objet seul. */
const DETAIL_ORIGINE = { achat: "au prix de sa rareté", pochette: "un objet tiré au sort", marche_achat: "auprès d'un autre Gaulois" } as const;
function detailDeLOrigine(achat: AchatDuVillage): string {
  if (achat.emplacement === FAMILIER) return "un familier tiré au sort";
  if (achat.emplacement === BANNIERE) return "le fond de son image /gaulois";
  if (achat.emplacement === CARTE) return "la finition de sa carte du podium";
  if (achat.emplacement === MODELE) return achat.nature === "pochette" ? "un Gaulois unique tiré au sort" : "un corps de créature pour son Gaulois";
  return DETAIL_ORIGINE[achat.nature];
}

/** Le nom de ce qui a été reçu, au-dessus de son nom : « Objet », « Familier », « Bannière » ou « Gaulois unique ». */
const SORTES: Readonly<Record<string, string>> = { [FAMILIER]: "Familier", [BANNIERE]: "Bannière", [MODELE]: "Gaulois unique", [CARTE]: "Finition de carte" };
const sorteDeLAchat = (achat: AchatDuVillage): string => SORTES[achat.emplacement] ?? "Objet";

/**
 * Le titre de l'image : « @ » et le nom Discord, sans ce que la police des noms ne sait pas dessiner (émoji, idéogrammes),
 * comme l'image de bienvenue. S'il n'en reste ni lettre ni chiffre, ou sans nom Discord, le nom de secours. `draws` : la police
 * sait-elle dessiner ce caractère ? Sans elle (les tests), tout se dessine.
 */
export function nomSurLImage(annonce: Pick<AnnonceDesAchats, "nom" | "discord">, draws: (char: string) => boolean = () => true): string {
  if (!annonce.discord) return annonce.nom;
  const garde = [...annonce.discord]
    .filter((char) => char === " " || draws(char))
    .join("")
    .replace(/ +/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(garde) ? `@${garde}` : annonce.nom;
}

/**
 * Quoi écrire et où, à partir de l'annonce et du dessin de chaque objet (`vignettes`, dans l'ordre des achats) : se teste
 * sans police. Un objet que ce code ne connaît pas n'arrive jamais ici (`lireReponseDesAchats` l'écarte). `draws` : voir
 * `nomSurLImage`.
 */
export function achatsCard(annonce: AnnonceDesAchats, vignettes: readonly (Vignette | null)[], siteUrl: string, measure: Measure, draws?: (char: string) => boolean): AchatsCard {
  const { achats } = annonce;
  const n = achats.length;
  const seul = achats[0]?.emplacement;
  const UN_SEUL: Readonly<Record<string, string>> = { [FAMILIER]: "Nouveau familier pour son Gaulois", [BANNIERE]: "Nouvelle bannière pour son Gaulois", [MODELE]: "Nouveau Gaulois unique", [CARTE]: "Nouvelle finition pour sa carte" };
  // Plusieurs finitions de carte seules : « 2 nouvelles finitions de carte », sans « pour son Gaulois ».
  const kicker = n === 1 ? (UN_SEUL[seul ?? ""] ?? "Nouvel objet pour son Gaulois") : achats.every((a) => a.emplacement === CARTE) ? nouveautes(achats) : `${nouveautes(achats)} pour son Gaulois`;
  // Un nom Discord peut compter 32 lettres larges : le titre descend jusqu'à 22 pixels plutôt que d'être coupé.
  const head = pageHead({ path: "/village", title: nomSurLImage(annonce, draws), name: true, titleMin: 22, kicker, period: periodeDesAchats(achats) }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const dessins: DessinPose[] = [];
  const top = Math.max(TOP, head.bottom + 8);

  if (n === 1) {
    const achat = achats[0]!;
    const objet = choseDe(achat)!;
    const boite: Boite = { x: WIDTH - MARGIN - SEULE.width, y: top, width: SEULE.width, height: BOTTOM - top };
    rects.push(vitrine(boite, objet.rarete));
    rects.push(...carresDuRang(boite, objet.rarete, 14));
    const dessin = placeDansLaVitrine(vignettes[0] ?? null, boite, SEULE.maxScale);
    if (dessin) {
      rects.push(ombreDuDessin(dessin, boite));
      dessins.push(dessin);
    }
    const width = boite.x - SEULE.gap - MARGIN;
    // Les deux chiffres clés occupent la hauteur de la vitrine : ce qui reste sous eux passe entre les deux, et au-dessus.
    const blocs = (y: number, ecart: number) => {
      const nom = kpiParts([{ label: sorteDeLAchat(achat), value: objet.nom, hint: { text: rareteEtPlace(objet), color: COULEURS_RARETE[objet.rarete].texte, strong: true } }], { x: MARGIN, y, width, valueSize: 64, minValueSize: 32 }, measure);
      const origine = kpiParts([{ label: "Origine", value: origineDe(achat).court, hint: { text: detailDeLOrigine(achat) } }], { x: MARGIN, y: nom.bottom + ecart, width, valueSize: 56, minValueSize: 30 }, measure);
      return { nom, origine };
    };
    const reste = Math.max(0, BOTTOM - blocs(top, 26).origine.bottom);
    const { nom, origine } = blocs(top + Math.round(reste / 4), 26 + Math.round(reste / 2));
    rects.push(...nom.rects, ...origine.rects);
    texts.push(...nom.texts, ...origine.texts);
  } else {
    const width = (WIDTH - 2 * MARGIN - (n - 1) * RANGEE.gap) / n;
    const unJour = memeJour(achats);
    achats.forEach((achat, i) => {
      const objet = choseDe(achat)!;
      const boite: Boite = { x: Math.round(MARGIN + i * (width + RANGEE.gap)), y: top, width: Math.floor(width), height: RANGEE.height };
      rects.push(vitrine(boite, objet.rarete));
      rects.push(...carresDuRang(boite, objet.rarete, 12));
      const dessin = placeDansLaVitrine(vignettes[i] ?? null, boite, RANGEE.maxScale);
      if (dessin) {
        rects.push(ombreDuDessin(dessin, boite));
        dessins.push(dessin);
      }
      const quand = unJour ? heureEnMots(achat.le) : `${dateLongue(achat.le).replace(/ \d{4}$/, "")} à ${heureEnMots(achat.le)}`;
      const lignes: { text: string; font: CardText["font"]; size: number; min: number; color: string; y: number }[] = [
        { text: objet.nom, font: "strong", size: 28, min: 17, color: C.WHITE, y: boite.y + boite.height + 40 },
        { text: rareteEtPlace(objet), font: "strong", size: 22, min: 15, color: COULEURS_RARETE[objet.rarete].texte, y: boite.y + boite.height + 72 },
        { text: `${origineDe(achat).court}, ${quand}`, font: "body", size: 21, min: 15, color: C.MUTED, y: boite.y + boite.height + 102 },
      ];
      for (const l of lignes) texts.push({ ...fitted(l.text, l.font, l.size, l.min, boite.width, measure), x: boite.x, y: l.y, font: l.font, color: l.color });
    });
  }

  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), PAYE_EN_STATERES, HEIGHT - 24, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, dessins };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export const achatsImageAlt = (annonce: AnnonceDesAchats): string => annonceEnMots(annonce).join(" ").slice(0, 1024);

/** Dessine l'image en PNG, chaque objet posé dans sa vitrine. */
export async function renderAchatsCard(card: AchatsCard, fonts: GazetteFonts, root: string): Promise<Buffer> {
  const layers: OverlayOptions[] = [];
  for (const dessin of card.dessins) {
    const { data, width, height } = pixelsDuDessin(dessin);
    const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
    layers.push({ input: png, left: dessin.x, top: dessin.y });
  }
  return renderGazetteCard(card, fonts, root, layers);
}
