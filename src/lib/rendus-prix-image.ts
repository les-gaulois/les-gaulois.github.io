/**
 * Les deux images du trop-payé rendu (docs/DIRECTION.md, « Le trop-payé rendu » ; envoi dans `rendus-prix-discord.ts`,
 * mots et nombres dans `rendus-prix.ts`). Mise en page de Claude Fable 5.2, à la demande du pilote (« un joli embed message »).
 *
 * - L'image publique, pour le salon des nouvelles : les trois boosters dont le prix baisse posés dans l'en-tête, la raison en
 *   une phrase, puis à gauche le tableau « avant, maintenant » de `PRIX_BAISSES`, les nouveaux prix en or, et à droite la
 *   règle du remboursement, ce qui ne change pas et où lire son montant. La somme rendue à tous ne s'écrit que si
 *   `totalPublic` la donne. Aucun nom de joueur, aucun montant d'un joueur.
 * - L'image privée, pour le joueur seul : son Gaulois devant sa bannière, avec son familier, comme sur /gaulois ; son nom,
 *   le montant rendu en grand à côté d'un statère, puis ses achats, six au plus, chacun avec son dessin (la bannière, le
 *   Gaulois unique, la finition, le booster), ce qu'il avait payé et ce qui lui revient. Au-delà de six : une ligne
 *   « et N autres achats ». Sans Gaulois lisible, un grand statère à sa place.
 *
 * Même dessin que les autres images du robot (`gazette-image.ts`, « Les images du robot » de docs/DESIGN.md) : la table des
 * cartes, l'en-tête et le pied, les chiffres en onciale de cases. L'or est celui du statère (`--rarete-legendaire`), sans
 * lueur. 1 200 pixels de large, et toujours au moins 1,55 fois plus large que haut, pour que Discord la montre en grand.
 */
import { banniereParId, dessinDeLaBanniere } from "../../supabase/functions/code-discord/bannieres/index";
import { familierAPoser, type FamilierAPoser } from "../../supabase/functions/code-discord/familiers/familier";
import { familierDe } from "../../supabase/functions/code-discord/familiers/index";
import { casesDeLaScene, DECOR_HAUTEUR, DECOR_LARGEUR, imageDuGaulois } from "../../supabase/functions/code-discord/gaulois";
import { casesDuStatere, type TailleStatere } from "../../supabase/functions/code-discord/statere";
import { BANNIERE, CARTE, MODELE, vignetteDeLAchat } from "./achats-discord";
import { COULEURS_RARETE } from "./achats-image";
import { fmtInt } from "./format";
import { lireTenue, type Rarete, type Tenue } from "./gaulois";
import { CARD_COLORS as C, drawnWidth, fitted, GazetteFonts, LOGO, MARGIN, pageFoot, pageHead, renderGazetteCard, type CardDessin, type CardRect, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { booster, type SorteDeBooster } from "./jeu/boosters-dessins";
import {
  CE_QUI_EST_RENDU,
  CE_QUI_NE_CHANGE_PAS,
  enStateres,
  lignesEnMots,
  OU_VOIR_SON_MONTANT,
  POURQUOI_LES_PRIX_BAISSENT,
  PRIX_BAISSES,
  totalPublic,
  type GenreRendu,
  type LigneEnMots,
  type RenduDUnJoueur,
  type RendusDesPrix,
} from "./rendus-prix";
import { shownAddress } from "./salon-discord";

/** L'or du statère (`--rarete-legendaire`) : le liseré du cadre de Discord, les nouveaux prix et les montants rendus. */
const OR = COULEURS_RARETE.legendaire.bord;
const OR_CLAIR = COULEURS_RARETE.legendaire.texte;
export const COULEUR_DES_RENDUS: number = parseInt(OR.slice(1), 16);

/** Le jour où les prix ont baissé (migration 20261121000500). */
const JOUR_DE_LA_BAISSE = "21 novembre 2026";

const WIDTH = 1200;
/** La part la plus haute permise : au-dessous de 1,55 fois plus large que haut, Discord rapetisse l'image. */
export const LARGEUR_SUR_HAUTEUR_MIN = 1.55;

/* ---------- Les pièces communes ---------- */

type Dessin = CardDessin;

/** Un statère en pixels, le coin haut gauche en (x, y). */
const statere = (taille: TailleStatere, x: number, y: number, echelle: number): Dessin => ({ decor: { largeur: taille, hauteur: taille, cases: casesDuStatere(taille) }, x: Math.round(x), y: Math.round(y), echelle });

/** Un booster du kit du jeu, case par case : une case à demi transparente au moins est laissée vide. */
function casesDuBooster(sorte: SorteDeBooster): Dessin["decor"] {
  const p = booster(sorte);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const cases: (string | null)[] = [];
  for (let i = 0; i < p.width * p.height; i++) cases.push((p.data[i * 4 + 3] ?? 0) >= 128 ? `#${hex(p.data[i * 4] ?? 0)}${hex(p.data[i * 4 + 1] ?? 0)}${hex(p.data[i * 4 + 2] ?? 0)}` : null);
  return { largeur: p.width, hauteur: p.height, cases };
}

/** Le texte coupé en lignes qui tiennent dans `largeur`, mot par mot. */
export function enLignes(texte: string, font: CardText["font"], size: number, largeur: number, measure: Measure): string[] {
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of texte.split(" ")) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ligne && measure(essai, font, size) > largeur) {
      lignes.push(ligne);
      ligne = mot;
    } else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

/** Le filet à gauche d'un bloc, avec son repère blanc en haut : celui des chiffres clés du site. */
const filet = (x: number, y: number, height: number): CardRect[] => [
  { x, y, width: 2, height, radius: 0, color: C.HAIRLINE },
  { x, y, width: 2, height: 22, radius: 0, color: C.WHITE },
];

/** Un libellé de la machine : capitales, chasse fixe, un peu espacées. */
function libelle(text: string, x: number, y: number, room: number, measure: Measure, color: string = C.MUTED): CardText {
  const tracked: Measure = (t, font, size) => drawnWidth({ text: t, font, size, tracking: 0.06 }, measure);
  return { ...fitted(text.toLocaleUpperCase("fr"), "monoStrong", 20, 14, room, tracked), x, y, font: "monoStrong", color, tracking: 0.06 };
}

export interface CarteDesRendus extends GazetteCard {
  dessins: Dessin[];
  /** La scène de /gaulois sans bannière, déjà en pixels (rouge, vert, bleu, opacité) : posée par-dessus le dessin. */
  scene?: { x: number; y: number; width: number; height: number; rgba: Uint8Array } | null;
}

/* ---------- L'image publique ---------- */

/** Les trois boosters dont le prix a baissé, dans l'ordre du tableau. */
const BOOSTERS_BAISSES: readonly SorteDeBooster[] = ["modeles", "bannieres", "familiers"];

/** « 12 Gaulois remboursés, 48 500 statères rendus ». */
export function totalEnMots(r: Pick<RendusDesPrix, "comptes" | "total">): string | null {
  const t = totalPublic(r);
  return t ? `${fmtInt(t.comptes)} Gaulois remboursés, ${enStateres(t.total)} ${t.total > 1 ? "rendus" : "rendu"}` : null;
}

/** Quoi écrire et où sur l'image publique : se teste sans police. */
export function cartePublique(r: RendusDesPrix, siteUrl: string, measure: Measure): CarteDesRendus {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const dessins: Dessin[] = [];

  // Les trois boosters, à droite de l'en-tête : chaque case, un carré de 2 pixels.
  const echelle = 2;
  const paquets = BOOSTERS_BAISSES.map(casesDuBooster);
  const ecart = 18;
  const largeurPaquets = paquets.reduce((s, p) => s + p.largeur * echelle, 0) + (paquets.length - 1) * ecart;
  let px = WIDTH - MARGIN - largeurPaquets;
  for (const p of paquets) {
    dessins.push({ decor: p, x: px, y: 30, echelle });
    px += p.largeur * echelle + ecart;
  }
  const head = pageHead({ path: "/village", title: "Prix baissés", kicker: "Le trop-payé est rendu en statères", period: `Le ${JOUR_DE_LA_BAISSE}` }, measure, largeurPaquets + 28);
  rects.push(...head.rects);
  texts.push(...head.texts);

  // La raison, sur toute la largeur.
  const raisonY = head.bottom + 26;
  texts.push({ ...fitted(POURQUOI_LES_PRIX_BAISSENT, "body", 26, 18, WIDTH - 2 * MARGIN, measure), x: MARGIN, y: raisonY, font: "body", color: C.WHITE });

  const top = raisonY + 24;
  const gauche = { x: MARGIN, width: 560 };
  const droite = { x: MARGIN + gauche.width + 32, width: WIDTH - 2 * MARGIN - gauche.width - 32 };

  // À droite : la règle, ce qui ne change pas, où lire son montant.
  const blocs: readonly (readonly [string, string])[] = [
    ["Ce qui est rendu", CE_QUI_EST_RENDU],
    ["Ce qui ne change pas", CE_QUI_NE_CHANGE_PAS],
    ["Votre montant", OU_VOIR_SON_MONTANT],
  ];
  const taille = 21;
  const interligne = 27;
  let y = top;
  blocs.forEach(([titre, texte], i) => {
    if (i > 0) y += 14;
    const lignes = enLignes(texte, "body", taille, droite.width - 22, measure);
    const hauteur = 30 + lignes.length * interligne;
    rects.push(...filet(droite.x, y, hauteur));
    texts.push(libelle(titre, droite.x + 22, y + 18, droite.width - 22, measure, i === 0 ? OR_CLAIR : C.MUTED));
    lignes.forEach((ligne, n) => texts.push({ text: ligne, x: droite.x + 22, y: y + 30 + (n + 1) * interligne - 6, size: taille, font: "body", color: C.STAGE_MUTED }));
    y += hauteur;
  });
  // À gauche : le tableau, dans une scène bordée d'or, aussi haute que le texte et jamais serrée.
  const total = totalEnMots(r);
  const bande = total ? 58 : 0;
  const bottom = Math.max(y, top + 16 + bande + PRIX_BAISSES.length * 68);
  rects.push({ x: gauche.x, y: top, width: gauche.width, height: bottom - top, radius: 0, color: C.SURFACE, to: C.SURFACE_2, stroke: OR, cut: 18 });
  const dedans = 22;
  const pas = (bottom - top - 16 - bande) / PRIX_BAISSES.length;
  const colonne = gauche.x + dedans + 240;
  PRIX_BAISSES.forEach((prix, i) => {
    const haut = top + 8 + i * pas;
    const milieu = haut + pas / 2;
    if (i > 0) rects.push({ x: gauche.x + dedans, y: Math.round(haut), width: gauche.width - 2 * dedans, height: 1, radius: 0, color: C.LINE });
    texts.push({ ...fitted(prix.quoi, "strong", 25, 17, gauche.width - 2 * dedans, measure), x: gauche.x + dedans, y: Math.round(milieu - 6), font: "strong", color: C.WHITE });
    const ligne = Math.round(milieu + 24);
    const avant = "avant ";
    texts.push({ text: avant, x: gauche.x + dedans, y: ligne, size: 20, font: "body", color: C.MUTED });
    texts.push({ text: prix.avant, x: gauche.x + dedans + measure(avant, "body", 20), y: ligne, size: 21, font: "body", color: C.MUTED });
    const maintenant = "maintenant ";
    texts.push({ text: maintenant, x: colonne, y: ligne, size: 20, font: "body", color: C.STAGE_MUTED });
    const apres = colonne + measure(maintenant, "body", 20);
    texts.push({ text: prix.maintenant, x: apres, y: ligne, size: 23, font: "strong", color: OR_CLAIR });
  });
  if (total) {
    const haut = bottom - bande;
    rects.push({ x: gauche.x + 1, y: haut, width: gauche.width - 2, height: 2, radius: 0, color: OR });
    dessins.push(statere(16, gauche.x + dedans, haut + 14, 2));
    texts.push({ ...fitted(total, "strong", 23, 16, gauche.width - 2 * dedans - 44, measure), x: gauche.x + dedans + 44, y: haut + 38, font: "strong", color: OR_CLAIR });
  }

  const height = bottom + 60;
  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), "Statères déjà rendus dans les bourses", height - 24, measure).texts);
  return { width: WIDTH, height, rects, texts, logo: LOGO, dessins };
}

/** Ce que dit le message public, ligne par ligne : la description de l'image et le texte de secours. */
function publicEnLignes(r: RendusDesPrix): string[] {
  const total = totalEnMots(r);
  return [
    `Prix baissés le ${JOUR_DE_LA_BAISSE} : le trop-payé est rendu en statères.`,
    POURQUOI_LES_PRIX_BAISSENT,
    ...PRIX_BAISSES.map((p) => `${p.quoi} : avant ${p.avant}, maintenant ${p.maintenant}.`),
    CE_QUI_EST_RENDU,
    CE_QUI_NE_CHANGE_PAS,
    OU_VOIR_SON_MONTANT,
    ...(total ? [`${total}.`] : []),
  ];
}

const sansArobase = (texte: string): string => texte.replace(/@/g, "");
const coupe = (texte: string, max: number): string => (texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`);

export const texteDuPublic = (r: RendusDesPrix): string => coupe(sansArobase(publicEnLignes(r).join("\n")), 1800);
const altDuPublic = (r: RendusDesPrix): string => coupe(sansArobase(publicEnLignes(r).join(" ")), 1024);

/* ---------- L'image privée ---------- */

/** Combien d'achats l'image détaille ; les suivants tiennent en une ligne. */
export const LIGNES_MONTREES = 6;

/** Les lignes montrées, et ce qui reste : le nombre d'achats (un booster ouvert compte pour un) et leur somme. */
export function detailDuJoueur(rendu: Pick<RenduDUnJoueur, "lignes">, max: number = LIGNES_MONTREES): { montrees: LigneEnMots[]; autres: { achats: number; rendu: number } | null } {
  const toutes = lignesEnMots(rendu.lignes);
  if (toutes.length <= max) return { montrees: toutes, autres: null };
  const reste = toutes.slice(max);
  const achatsDe = (l: LigneEnMots) => (l.genre.startsWith("pochette_") ? rendu.lignes.filter((x) => x.genre === l.genre).length : 1);
  return { montrees: toutes.slice(0, max), autres: { achats: reste.reduce((s, l) => s + achatsDe(l), 0), rendu: reste.reduce((s, l) => s + l.rendu, 0) } };
}

/** « et 4 autres achats : 2 000 statères ». */
export const autresEnMots = (autres: { achats: number; rendu: number }): string => `et ${fmtInt(autres.achats)} ${autres.achats > 1 ? "autres achats" : "autre achat"} : ${enStateres(autres.rendu)}`;

const SORTES: Readonly<Partial<Record<GenreRendu, SorteDeBooster>>> = { pochette_familiers: "familiers", pochette_bannieres: "bannieres", pochette_modeles: "modeles" };

/** Un cadre de carte, en cases, à la couleur de sa rareté : aucun cadre du rayon n'a d'image fixe. */
function dessinDuCadre(rarete: Rarete | null): Dessin["decor"] {
  const { bord, texte } = rarete ? COULEURS_RARETE[rarete] : { bord: C.LINE_STRONG, texte: C.MUTED };
  const [l, h] = [18, 24];
  const cases: (string | null)[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const bordure = Math.min(x, y, l - 1 - x, h - 1 - y);
      const coin = (x < 3 || x >= l - 3) && (y < 3 || y >= h - 3);
      cases.push(bordure === 0 ? bord : bordure === 1 ? (coin ? texte : bord) : bordure === 2 ? C.NAVY : C.SURFACE_2);
    }
  }
  return { largeur: l, hauteur: h, cases };
}

/** Le dessin d'un achat rendu : la bannière, le Gaulois unique, la finition, le booster ; `null` si rien ne se dessine. */
function dessinDeLAchat(l: LigneEnMots): Dessin["decor"] | null {
  const sorte = SORTES[l.genre];
  if (sorte) return casesDuBooster(sorte);
  if (l.genre === "cadre") return dessinDuCadre(l.rarete);
  if (!l.objet) return null;
  try {
    return vignetteDeLAchat({ emplacement: l.genre === "banniere" ? BANNIERE : l.genre === "carte" ? CARTE : MODELE, objet: l.objet });
  } catch {
    return null;
  }
}

/** La vignette d'un achat : sa boîte, bordée de la couleur de sa rareté, et son dessin au plus grand nombre entier de pixels par case. */
const VIGNETTE = { width: 128, height: 92 } as const;
function vignette(l: LigneEnMots, x: number, y: number): { rects: CardRect[]; dessins: Dessin[] } {
  const rects: CardRect[] = [{ x, y, width: VIGNETTE.width, height: VIGNETTE.height, radius: 0, color: C.SURFACE, to: C.SURFACE_2, stroke: l.rarete ? COULEURS_RARETE[l.rarete].bord : C.LINE_STRONG }];
  const decor = dessinDeLAchat(l) ?? { largeur: 24, hauteur: 24, cases: casesDuStatere(24) };
  const echelle = Math.min(Math.floor((VIGNETTE.width - 4) / decor.largeur), Math.floor((VIGNETTE.height - 4) / decor.hauteur));
  if (echelle < 1) return { rects, dessins: [statere(24, x + (VIGNETTE.width - 48) / 2, y + (VIGNETTE.height - 48) / 2, 2)] };
  return { rects, dessins: [{ decor, echelle, x: Math.round(x + (VIGNETTE.width - decor.largeur * echelle) / 2), y: Math.round(y + (VIGNETTE.height - decor.hauteur * echelle) / 2) }] };
}

/** La scène de /gaulois : 124 cases sur 80, chacune un carré de 4 pixels. */
const SCENE = { echelle: 4, width: DECOR_LARGEUR * 4, height: DECOR_HAUTEUR * 4, y: 28 } as const;

/** Le Gaulois d'un joueur, relu : sa tenue, son familier prêt à poser, sa bannière. `null` : pas de Gaulois lisible. */
function gauloisDe(rendu: Pick<RenduDUnJoueur, "gaulois">): { tenue: Tenue; familier: FamilierAPoser | null; banniere: string | null } | null {
  if (!rendu.gaulois) return null;
  try {
    const tenue = lireTenue(rendu.gaulois.tenue);
    if (!tenue) return null;
    const animal = familierDe(rendu.gaulois.familier);
    return { tenue, familier: animal ? familierAPoser(animal) : null, banniere: banniereParId(rendu.gaulois.banniere)?.id ?? null };
  } catch {
    return null;
  }
}

/**
 * Quoi écrire et où sur l'image d'un joueur : se teste sans police. `lisible` : le nom, sans ce que la police ne sait pas
 * dessiner. `avecGaulois: false` : l'image sans lui (le dessin de secours).
 */
export function cartePrivee(rendu: RenduDUnJoueur, siteUrl: string, measure: Measure, lisible: (nom: string) => string = (nom) => nom, avecGaulois = true): CarteDesRendus {
  const rects: CardRect[] = [];
  const texts: CardText[] = [];
  const dessins: Dessin[] = [];
  let scene: CarteDesRendus["scene"] = null;

  const gaulois = avecGaulois ? gauloisDe(rendu) : null;
  const sceneX = WIDTH - MARGIN - SCENE.width;
  if (gaulois) {
    rects.push({ x: sceneX - 3, y: SCENE.y - 3, width: SCENE.width + 6, height: SCENE.height + 6, radius: 0, color: C.NAVY, stroke: C.LINE_STRONG });
    const fond = gaulois.banniere ? dessinDeLaBanniere(gaulois.banniere) : null;
    if (fond) dessins.push({ decor: { largeur: DECOR_LARGEUR, hauteur: DECOR_HAUTEUR, cases: casesDeLaScene(gaulois.tenue, fond, gaulois.familier) }, x: sceneX, y: SCENE.y, echelle: SCENE.echelle });
    else {
      const image = imageDuGaulois(gaulois.tenue, gaulois.familier);
      scene = { x: sceneX, y: SCENE.y, width: image.largeur, height: image.hauteur, rgba: image.rgba };
    }
  } else dessins.push(statere(24, WIDTH - MARGIN - 192 - 40, 60, 8));

  const droite = WIDTH - sceneX + 28;
  const head = pageHead({ path: "/village", title: lisible(rendu.nom), name: true, titleMin: 22, kicker: "Prix baissés : trop-payé rendu", period: `Le ${JOUR_DE_LA_BAISSE}` }, measure, gaulois ? droite - MARGIN : 280);
  rects.push(...head.rects);
  texts.push(...head.texts);

  // Le montant, en grand, à côté d'un statère.
  const kpiY = head.bottom + 4;
  const room = sceneX - 28 - MARGIN - 22;
  rects.push(...filet(MARGIN, kpiY, 112));
  texts.push(libelle("Rendu dans votre bourse", MARGIN + 22, kpiY + 20, room, measure));
  const piece = 72;
  dessins.push(statere(24, MARGIN + 22, kpiY + 36, 3));
  const valeur = fitted(enStateres(rendu.total), "cases", 60, 30, room - piece - 18, measure);
  texts.push({ ...valeur, x: MARGIN + 22 + piece + 18, y: kpiY + 36 + Math.round(piece / 2 + valeur.size * 0.34), font: "cases", color: OR_CLAIR });

  // Les achats, deux par rangée.
  const { montrees, autres } = detailDuJoueur(rendu);
  const top = Math.max(kpiY + 112, gaulois ? SCENE.y + SCENE.height : 0) + 22;
  const ecart = { x: 24, y: 10 };
  const colonnes = montrees.length === 1 ? 1 : 2;
  const largeur = (WIDTH - 2 * MARGIN - (colonnes - 1) * ecart.x) / colonnes;
  montrees.forEach((l, i) => {
    const x = MARGIN + (i % colonnes) * (largeur + ecart.x);
    const y = top + Math.floor(i / colonnes) * (VIGNETTE.height + ecart.y);
    const v = vignette(l, x, y);
    rects.push(...v.rects);
    dessins.push(...v.dessins);
    const tx = x + VIGNETTE.width + 16;
    const place = largeur - VIGNETTE.width - 16;
    const [prix, part] = l.detail.split(" ; ");
    const rendus = `${enStateres(l.rendu)} ${l.rendu > 1 ? "rendus" : "rendu"}`;
    if (part) {
      texts.push({ ...fitted(l.quoi, "strong", 22, 15, place, measure), x: tx, y: y + 19, font: "strong", color: C.WHITE });
      texts.push({ ...fitted(prix ?? "", "body", 18, 13, place, measure), x: tx, y: y + 41, font: "body", color: C.MUTED });
      texts.push({ ...fitted(part, "body", 18, 13, place, measure), x: tx, y: y + 62, font: "body", color: C.MUTED });
      texts.push({ ...fitted(rendus, "strong", 21, 15, place, measure), x: tx, y: y + 87, font: "strong", color: OR_CLAIR });
    } else {
      texts.push({ ...fitted(l.quoi, "strong", 23, 15, place, measure), x: tx, y: y + 23, font: "strong", color: C.WHITE });
      texts.push({ ...fitted(prix ?? "", "body", 20, 14, place, measure), x: tx, y: y + 52, font: "body", color: C.MUTED });
      texts.push({ ...fitted(rendus, "strong", 22, 15, place, measure), x: tx, y: y + 83, font: "strong", color: OR_CLAIR });
    }
  });
  const rangees = Math.ceil(montrees.length / colonnes);
  let bottom = top + rangees * VIGNETTE.height + (rangees - 1) * ecart.y;
  if (autres) {
    bottom += 34;
    texts.push({ ...fitted(autresEnMots(autres), "strong", 22, 15, WIDTH - 2 * MARGIN, measure), x: MARGIN, y: bottom, font: "strong", color: C.STAGE_MUTED });
  }

  const height = bottom + 64;
  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), "Ces prix ont baissé : la différence vous revient", height - 24, measure).texts);
  return { width: WIDTH, height, rects, texts, logo: LOGO, dessins, scene };
}

/** Ce que dit le message privé, ligne par ligne. `max` : combien d'achats sont détaillés. */
function priveEnLignes(rendu: RenduDUnJoueur, max: number): string[] {
  const { montrees, autres } = detailDuJoueur(rendu, max);
  return [
    `Prix baissés le ${JOUR_DE_LA_BAISSE} : ${enStateres(rendu.total)} ${rendu.total > 1 ? "rendus" : "rendu"}, déjà dans votre bourse.`,
    ...montrees.map((l) => `${l.quoi} (${l.detail}) : ${enStateres(l.rendu)}.`),
    ...(autres ? [`${autresEnMots(autres)}.`] : []),
    POURQUOI_LES_PRIX_BAISSENT,
  ];
}

export const texteDuPrive = (rendu: RenduDUnJoueur): string => coupe(sansArobase(priveEnLignes(rendu, 10).join("\n")), 1800);
const altDuPrive = (rendu: RenduDUnJoueur): string => coupe(sansArobase([`${rendu.nom}.`, ...priveEnLignes(rendu, LIGNES_MONTREES)].join(" ")), 1024);

/* ---------- Le dessin ---------- */

const polices = new Map<string, GazetteFonts>();
function policesDe(root: string): GazetteFonts {
  let fonts = polices.get(root);
  if (!fonts) polices.set(root, (fonts = new GazetteFonts(root)));
  return fonts;
}

async function enPng(card: CarteDesRendus, fonts: GazetteFonts, root: string): Promise<Uint8Array> {
  const s = card.scene;
  const layers = s ? [{ input: Buffer.from(s.rgba), raw: { width: s.width, height: s.height, channels: 4 as const }, left: s.x, top: s.y }] : [];
  return new Uint8Array(await renderGazetteCard(card, fonts, root, layers));
}

/** L'image du message public. */
export async function dessinerLePublic(r: RendusDesPrix, siteUrl: string, root: string): Promise<{ png: Uint8Array; alt: string }> {
  const fonts = policesDe(root);
  return { png: await enPng(cartePublique(r, siteUrl, fonts.width), fonts, root), alt: altDuPublic(r) };
}

/** L'image d'un joueur. Si elle ne se dessine pas avec son Gaulois, elle est refaite sans lui. */
export async function dessinerLePrive(rendu: RenduDUnJoueur, siteUrl: string, root: string): Promise<{ png: Uint8Array; alt: string }> {
  const fonts = policesDe(root);
  // Le nom, sans ce que la police ne sait pas dessiner (émoji, idéogrammes) ; s'il n'en reste rien, « Gaulois ».
  const lisible = (nom: string) => {
    const garde = [...nom].filter((char) => char === " " || fonts.draws(char, "strong")).join("").replace(/ +/g, " ").trim();
    return /[\p{L}\p{N}]/u.test(garde) ? garde : "Gaulois";
  };
  const alt = altDuPrive(rendu);
  try {
    return { png: await enPng(cartePrivee(rendu, siteUrl, fonts.width, lisible), fonts, root), alt };
  } catch {
    return { png: await enPng(cartePrivee(rendu, siteUrl, fonts.width, lisible, false), fonts, root), alt };
  }
}
