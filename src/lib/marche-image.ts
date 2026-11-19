/**
 * L'image d'une annonce du marché des Gaulois (`marche-discord.ts`, 19 novembre 2026) : le nom du membre en titre, puis
 * chaque objet qu'il vend ou qu'il cherche, dessiné en pixels dans sa vitrine bordée de la couleur de sa rareté, avec son
 * nom, sa rareté en toutes lettres, le prix d'une offre (pas celui d'une demande, voir `marche-discord.ts`), et le prix de la
 * boutique. Même dessin que l'image des
 * achats (`achats-image.ts`), dont elle reprend la vitrine, les carrés du rang et l'ombre.
 *
 * 1 200 × 660 : 1,82 fois plus large que haut, au-dessus des 1,55 qu'il faut pour que Discord la montre en grand.
 */
import { NOMS_EMPLACEMENTS, RARETES_DES_OBJETS as RARETES, vignetteDeLObjet } from "./gaulois";
import { COULEURS_RARETE, RANGEE, SEULE, carresDuRang, nomSurLImage, ombreDuDessin, placeDansLaVitrine, renderAchatsCard, vitrine, type AchatsCard, type Boite, type DessinPose } from "./achats-image";
import { dateLongue, heureEnMots } from "./achats-discord";
import { annonceDuMarcheEnMots, STATERES_DU_CLAN, type AnnonceDuMarche, type ImageDuMarche } from "./marche-discord";
import { fmtInt } from "./format";
import { CARD_COLORS as C, fitted, kpiParts, LOGO, MARGIN, pageFoot, pageHead, type CardRect, type CardText, type GazetteFonts, type Measure } from "./gazette-image";
import { shownAddress } from "./salon-discord";

const WIDTH = 1200;
const HEIGHT = 660;
const TOP = 240;
const BOTTOM = HEIGHT - 70;

/** « Légendaire, tête ». */
const rareteEtPlace = (a: AnnonceDuMarche) => `${RARETES[a.rarete].nom}, ${NOMS_EMPLACEMENTS[a.emplacement].toLocaleLowerCase("fr")}`;

/** Le prix sur l'image : « 1 800 statères ». */
const enStateres = (n: number) => `${fmtInt(n)} ${n > 1 ? "statères" : "statère"}`;

/** Ce que dit la boutique, en court, sous le prix : « Boutique : 2 500 », ou « Pas en rayon cette semaine ». */
export function boutiqueEnCourt(a: Pick<AnnonceDuMarche, "prixBoutique" | "enRayon">): string {
  if (!a.enRayon) return "Pas en rayon cette semaine";
  return a.prixBoutique === null ? "Aussi à la boutique" : `Boutique : ${fmtInt(a.prixBoutique)}`;
}

/** La période de l'en-tête : « Le 19 novembre 2026 à 20 h 10 », « …, de 20 h 10 à 21 h ». */
export function periodeDuMarche(annonces: readonly Pick<AnnonceDuMarche, "le">[]): string {
  const premier = annonces[0]!;
  const dernier = annonces.at(-1)!;
  if (dateLongue(premier.le) !== dateLongue(dernier.le)) return `Du ${dateLongue(premier.le)}, ${heureEnMots(premier.le)}, au ${dateLongue(dernier.le)}, ${heureEnMots(dernier.le)}`;
  const debut = heureEnMots(premier.le);
  const fin = heureEnMots(dernier.le);
  return debut === fin ? `Le ${dateLongue(premier.le)} à ${debut}` : `Le ${dateLongue(premier.le)}, de ${debut} à ${fin}`;
}

/** L'accroche, sous le titre : « Vend au marché », « Cherche 2 objets au marché ». */
export function accrocheDuMarche(image: ImageDuMarche): string {
  const n = image.annonces.length;
  const verbe = image.sorte === "offre" ? "Vend" : "Cherche";
  return n >= 2 ? `${verbe} ${n} objets au marché` : `${verbe} au marché`;
}

/** Quoi écrire et où : se teste sans police. `draws` : la police sait-elle dessiner ce caractère ? */
export function marcheCard(image: ImageDuMarche, siteUrl: string, measure: Measure, draws?: (char: string) => boolean): AchatsCard {
  const { annonces } = image;
  const n = annonces.length;
  const head = pageHead({ path: "/village", title: nomSurLImage(image, draws), name: true, titleMin: 22, kicker: accrocheDuMarche(image), period: periodeDuMarche(annonces) }, measure);
  const rects: CardRect[] = [...head.rects];
  const texts: CardText[] = [...head.texts];
  const dessins: DessinPose[] = [];
  const top = Math.max(TOP, head.bottom + 8);

  if (n === 1) {
    const a = annonces[0]!;
    const boite: Boite = { x: WIDTH - MARGIN - SEULE.width, y: top, width: SEULE.width, height: BOTTOM - top };
    rects.push(vitrine(boite, a.rarete));
    rects.push(...carresDuRang(boite, a.rarete, 14));
    const dessin = placeDansLaVitrine(vignetteDeLObjet(a.emplacement, a.objet), boite, SEULE.maxScale);
    if (dessin) {
      rects.push(ombreDuDessin(dessin, boite));
      dessins.push(dessin);
    }
    const width = boite.x - SEULE.gap - MARGIN;
    const blocs = (y: number, ecart: number) => {
      const nom = kpiParts([{ label: "Objet", value: a.nomObjet, hint: { text: rareteEtPlace(a), color: COULEURS_RARETE[a.rarete].texte, strong: true } }], { x: MARGIN, y, width, valueSize: 64, minValueSize: 32 }, measure);
      // Une offre : son prix, et la boutique dessous. Une demande : la boutique seule, son prix se lit au marché.
      const prix =
        image.sorte === "offre"
          ? kpiParts([{ label: "Prix", value: enStateres(a.prix), hint: { text: boutiqueEnCourt(a) } }], { x: MARGIN, y: nom.bottom + ecart, width, valueSize: 56, minValueSize: 30 }, measure)
          : kpiParts([{ label: "À la boutique", value: !a.enRayon ? "Pas en rayon" : a.prixBoutique === null ? "En rayon" : enStateres(a.prixBoutique), hint: { text: "Le prix proposé se lit au marché" } }], { x: MARGIN, y: nom.bottom + ecart, width, valueSize: 56, minValueSize: 30 }, measure);
      return { nom, prix };
    };
    const reste = Math.max(0, BOTTOM - blocs(top, 26).prix.bottom);
    const { nom, prix } = blocs(top + Math.round(reste / 4), 26 + Math.round(reste / 2));
    rects.push(...nom.rects, ...prix.rects);
    texts.push(...nom.texts, ...prix.texts);
  } else {
    const width = (WIDTH - 2 * MARGIN - (n - 1) * RANGEE.gap) / n;
    annonces.forEach((a, i) => {
      const boite: Boite = { x: Math.round(MARGIN + i * (width + RANGEE.gap)), y: top, width: Math.floor(width), height: RANGEE.height };
      rects.push(vitrine(boite, a.rarete));
      rects.push(...carresDuRang(boite, a.rarete, 12));
      const dessin = placeDansLaVitrine(vignetteDeLObjet(a.emplacement, a.objet), boite, RANGEE.maxScale);
      if (dessin) {
        rects.push(ombreDuDessin(dessin, boite));
        dessins.push(dessin);
      }
      const lignes: { text: string; font: CardText["font"]; size: number; min: number; color: string; y: number }[] = [
        { text: a.nomObjet, font: "strong", size: 28, min: 17, color: C.WHITE, y: boite.y + boite.height + 40 },
        { text: image.sorte === "offre" ? enStateres(a.prix) : "Cherché au marché", font: "strong", size: 24, min: 15, color: COULEURS_RARETE[a.rarete].texte, y: boite.y + boite.height + 72 },
        { text: boutiqueEnCourt(a), font: "body", size: 21, min: 15, color: C.MUTED, y: boite.y + boite.height + 102 },
      ];
      for (const l of lignes) texts.push({ ...fitted(l.text, l.font, l.size, l.min, boite.width, measure), x: boite.x, y: l.y, font: l.font, color: l.color });
    });
  }

  texts.push(...pageFoot(shownAddress(siteUrl, "/village"), STATERES_DU_CLAN, HEIGHT - 24, measure).texts);
  return { width: WIDTH, height: HEIGHT, rects, texts, logo: LOGO, dessins };
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export const marcheImageAlt = (image: ImageDuMarche): string => annonceDuMarcheEnMots(image).join(" ").slice(0, 1024);

/** Dessine l'image en PNG, chaque objet posé dans sa vitrine. */
export const renderMarcheCard = (card: AchatsCard, fonts: GazetteFonts, root: string): Promise<Buffer> => renderAchatsCard(card, fonts, root);
