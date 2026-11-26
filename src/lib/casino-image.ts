/**
 * L'image d'un gros gain du casino, telle que le robot la poste sur Discord (`casino-discord.ts`) : la maquette validée par le
 * pilote le 26 novembre 2026, au dessin de l'image des achats (`achats-image.ts`).
 *
 * - En haut, l'en-tête des images du robot : le badge, l'invite `./casino`, le nom (« @ » et le nom Discord), en or ce que le
 *   coup a rendu (« 100 fois sa mise à la machine du forgeron »), la date et l'heure.
 * - À gauche, deux chiffres clés : les statères gagnés (ce qui revient, moins la mise) avec la mise, puis la chance de ce
 *   rendu (« 1 sur 500 ») avec ce que le jeu rend en moyenne : l'image ne fait pas croire que le casino fait gagner.
 * - À droite, dans une vitrine bordée d'or, la vignette du jeu du hall, peinte avec le vrai tirage (`TirageDeLaVignette`) :
 *   les symboles de la ligne du milieu, les faces des dés, le couloir gagnant en tête, le statère dans sa coupe ; pour la
 *   roue, le numéro sorti sur une plaque d'or. Chaque point devient un carré de `ECHELLE` pixels, sans lissage.
 *
 * 1 200 × 660, comme l'image des achats : 1,82 fois plus large que haute.
 */
import { COULEURS_RARETE, nomSurLImage, renderAchatsCard, vitrine, type AchatsCard, type Boite, type DessinPose } from "./achats-image";
import { dateLongue, heureEnMots } from "./achats-discord";
import { JEUX, MISE_EN_STATERES, chanceDuCoup, chanceEnMots, gainDe, titreDuGain, type GrosGain } from "./casino-discord";
import { fmtInt } from "./format";
import { kpiParts, LOGO, MARGIN, pageFoot, pageHead, type CardRect, type CardText, type GazetteFonts, type Measure } from "./gazette-image";
import { vignette, type TirageDeLaVignette } from "./jeu/casino-hall";
import { peindrePlaque } from "./jeu/casino-des";
import { symbole } from "./jeu/casino-machine";
import type { Toile } from "./jeu/casino-toile";
import { shownAddress } from "./salon-discord";
import type { Decor } from "./village/decor";

const WIDTH = 1200;
const HEIGHT = 660;
/** Le haut de la vitrine et des chiffres, sous l'en-tête, et le bas de la vitrine. */
const TOP = 240;
const BOTTOM = HEIGHT - 70;
/** La vitrine du jeu, à droite. */
export const VITRINE = { width: 420, gap: 32, marge: 12 } as const;
/** Un point de la vignette, en pixels. */
export const ECHELLE = 3;
/** L'or du casino : le bord de la vitrine et la ligne du coup. */
const OR = COULEURS_RARETE.legendaire;
/** Un point de la vignette est posé s'il est assez couvert : la vignette est peinte jusqu'à ses bords. */
const OPACITE_MINIMALE = 100;

/** Une toile en cases de couleur pleine, pour la poser comme le dessin d'un objet. */
export function decorDeLaToile(t: Toile): Decor {
  const cases: (string | null)[] = [];
  for (let i = 0; i < t.w * t.h; i++) {
    const a = t.d[i * 4 + 3]!;
    cases.push(a >= OPACITE_MINIMALE ? `#${[0, 1, 2].map((k) => t.d[i * 4 + k]!.toString(16).padStart(2, "0")).join("")}` : null);
  }
  return { largeur: t.w, hauteur: t.h, cases };
}

/** Ce que la vignette montre du tirage. La roue n'en a pas : sa plaque est posée à part. */
function tirageDeLaVignette(g: GrosGain): TirageDeLaVignette | undefined {
  const t = g.tirage;
  // Les petits symboles de 12 points, dessinés pour cette taille (la table des gains de la machine) : ils tiennent dans les fenêtres.
  if (t.jeu === "machine") return { jeu: "machine", signes: [symbole(t.ligne[0], 12), symbole(t.ligne[1], 12), symbole(t.ligne[2], 12)] };
  if (t.jeu === "course") return { jeu: "course", gagnant: t.gagnant };
  if (t.jeu === "palissade") return { jeu: "palissade", coupe: t.coupe };
  if (t.jeu === "des") return { jeu: "des", faces: t.faces };
  return undefined;
}

/** La vignette du jeu avec son vrai tirage, de `w` sur `h` points, de nuit (Discord se lit surtout en sombre). */
export function vignetteDuGain(g: GrosGain, w: number, h: number): Toile {
  const t = vignette(g.tirage.jeu, w, h, false, tirageDeLaVignette(g));
  if (g.tirage.jeu === "roue") {
    const plaque = peindrePlaque(String(g.tirage.numero));
    t.pose(plaque, (w - plaque.w) >> 1, 4);
  }
  return t;
}

/** Le dessin dans sa vitrine : la vignette à la taille de la vitrine, moins sa marge, centrée. */
export function dessinDansLaVitrine(g: GrosGain, boite: Boite): DessinPose {
  const w = Math.floor((boite.width - 2 * VITRINE.marge) / ECHELLE);
  const h = Math.floor((boite.height - 2 * VITRINE.marge) / ECHELLE);
  return {
    decor: decorDeLaToile(vignetteDuGain(g, w, h)),
    echelle: ECHELLE,
    x: Math.round(boite.x + (boite.width - w * ECHELLE) / 2),
    y: Math.round(boite.y + (boite.height - h * ECHELLE) / 2),
  };
}

/**
 * Quoi écrire et où, et le dessin du jeu. `draws` : la police sait-elle dessiner ce caractère ? (voir `nomSurLImage`). Sans
 * elle (les tests), tout se dessine. `avecDessin` : faux dans les tests de mise en page, qui ne peignent pas la vignette.
 */
export function casinoCard(g: GrosGain, siteUrl: string, measure: Measure, draws?: (char: string) => boolean, avecDessin = true): AchatsCard {
  const head = pageHead({ path: "/casino", title: nomSurLImage(g, draws), name: true, titleMin: 22, kicker: titreDuGain(g), kickerColor: OR.texte, period: `Le ${dateLongue(g.le)} à ${heureEnMots(g.le)}` }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const top = Math.max(TOP, head.bottom + 8);
  const boite: Boite = { x: WIDTH - MARGIN - VITRINE.width, y: top, width: VITRINE.width, height: BOTTOM - top };
  rects.push(vitrine(boite, "legendaire"));
  const width = boite.x - VITRINE.gap - MARGIN;
  const gagnes = kpiParts([{ label: "Gagnés", value: fmtInt(gainDe(g)), hint: { text: `statères, pour ${fmtInt(g.mise)} misés`, color: OR.texte, strong: true } }], { x: MARGIN, y: top + 14, width, valueSize: 72, minValueSize: 32 }, measure);
  const chance = kpiParts([{ label: "Chance", value: chanceEnMots(chanceDuCoup(g)), hint: { text: JEUX[g.tirage.jeu].moyenne } }], { x: MARGIN, y: gagnes.bottom + 40, width, valueSize: 56, minValueSize: 30 }, measure);
  rects.push(...gagnes.rects, ...chance.rects);
  texts.push(...gagnes.texts, ...chance.texts);
  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), MISE_EN_STATERES, HEIGHT - 24, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, dessins: avecDessin ? [dessinDansLaVitrine(g, boite)] : [] };
}

/** Dessine l'image en PNG. */
export const renderCasinoCard = (card: AchatsCard, fonts: GazetteFonts, root: string): Promise<Buffer> => renderAchatsCard(card, fonts, root);
