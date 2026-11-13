/**
 * La capture de la carte de l'alliance (13 novembre 2026, demande du pilote) : une image à envoyer sur Discord, avec le
 * logo de GAL en haut, la carte telle que le joueur l'a cadrée, la légende des couleurs et, au choix, les zones à prendre
 * numérotées avec leurs chiffres. Ouverte aux Gaulois validés comme aux joueurs alliés : elle ne montre que ce que la
 * fenêtre « Alliance » leur montre déjà.
 *
 * Ici, seulement les calculs : où se posent la carte et le panneau, quel morceau de la carte complète l'image montre,
 * quelles zones y sont, et la place des textes. Le dessin est dans `src/scripts/alliance-capture.ts`. Rien n'est inventé :
 * les chiffres sont ceux de la fenêtre (territoires au dernier relevé, bilans des zones de `bilan.ts`, troupes déclarées).
 */
import { ENEMY_PIXEL_BASE_TROOPS, NEUTRAL_PIXEL_TROOPS, RULES_CHECKED_ON } from "../clanmap/economy";
import { borner, type Ecran, type Monde } from "../clanmap/vue";
import { parisParts } from "../time";
import type { BilanZone, TroupesAlliance } from "./bilan";
import { dansLeMasque, type Masque } from "./masque";

/** Un rectangle, en pixels de l'image ou de la carte complète selon l'usage. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vue {
  x: number;
  y: number;
  /** Pixels de l'image par pixel de la carte complète. */
  s: number;
}

/**
 * L'image : 1 920 × 1 080, plus large que haute, pour que Discord la montre en grand dans la discussion. L'en-tête porte le
 * logo, le titre et les dates ; la carte à gauche, le panneau des couleurs et des zones à droite ; le crédit de la carte
 * en bas, que la licence du fond de carte demande sur l'image même.
 */
export const CAPTURE = {
  largeur: 1920,
  hauteur: 1080,
  marge: 32,
  entete: { y: 0, h: 120 },
  carte: { x: 32, y: 120, w: 1232, h: 888 },
  panneau: { x: 1288, y: 120, w: 600, h: 888 },
  pied: { y: 1008, h: 72 },
} as const;

/** Au plus près, un pixel de la carte fait 48 pixels de l'image : de quoi voir chaque pixel d'une petite zone. */
export const ECHELLE_MAX = 48;

const borne = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Le morceau de la carte complète que l'écran montre au joueur : sans la bande qu'une fenêtre ouverte couvre à droite
 * (`couvert`, en pixels du dessin), et sans ce qui déborde de la carte. Toute la carte si rien ne s'y voit.
 */
export function cadreVisible(vue: Vue, ecran: Ecran, couvert: number, monde: Monde): Rect {
  const gauche = borne(vue.x - ecran.width / (2 * vue.s), 0, monde.width);
  const droite = borne(vue.x + (ecran.width / 2 - Math.max(0, couvert)) / vue.s, 0, monde.width);
  const haut = borne(vue.y - ecran.height / (2 * vue.s), 0, monde.height);
  const bas = borne(vue.y + ecran.height / (2 * vue.s), 0, monde.height);
  if (!(droite - gauche >= 1 && bas - haut >= 1)) return { x: 0, y: 0, w: monde.width, h: monde.height };
  return { x: gauche, y: haut, w: droite - gauche, h: bas - haut };
}

/**
 * La vue de la carte dans l'image : tout le morceau cadré par le joueur, centré, et ce qui l'entoure pour remplir le cadre
 * de l'image ; jamais plus loin que la carte entière, ni plus près que `ECHELLE_MAX`.
 */
export function vueDeCapture(cadre: Rect, sortie: Ecran, monde: Monde, echelleMax = ECHELLE_MAX): Vue {
  const s = Math.min(sortie.width / Math.max(cadre.w, 1e-6), sortie.height / Math.max(cadre.h, 1e-6), echelleMax);
  return borner({ x: cadre.x + cadre.w / 2, y: cadre.y + cadre.h / 2, s }, monde, sortie, echelleMax);
}

/** Le morceau de la carte complète que l'image montre, borné à la carte. */
export function cadreDeLaVue(vue: Vue, sortie: Ecran, monde: Monde): Rect {
  const x0 = borne(vue.x - sortie.width / (2 * vue.s), 0, monde.width);
  const x1 = borne(vue.x + sortie.width / (2 * vue.s), 0, monde.width);
  const y0 = borne(vue.y - sortie.height / (2 * vue.s), 0, monde.height);
  const y1 = borne(vue.y + sortie.height / (2 * vue.s), 0, monde.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Où tombe un point de la carte complète dans le cadre de la carte de l'image, en pixels de l'image depuis son coin. */
export const versLImage = (vue: Vue, sortie: Ecran, x: number, y: number): [number, number] => [(x - vue.x) * vue.s + sortie.width / 2, (y - vue.y) * vue.s + sortie.height / 2];

/** Les pixels entiers d'un cadre : du premier pixel touché au dernier. */
function pixelsEntiers(cadre: Rect): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: Math.floor(cadre.x), y0: Math.floor(cadre.y), x1: Math.ceil(cadre.x + cadre.w) - 1, y1: Math.ceil(cadre.y + cadre.h) - 1 };
}

/**
 * Le pixel de la zone où écrire son numéro dans l'image : celui de ses pixels visibles le plus près du milieu de sa partie
 * visible. `null` : aucun pixel de la zone n'est dans le cadre, elle n'est pas dans l'image.
 */
export function pointDansLeCadre(masque: Masque, cadre: Rect): [number, number] | null {
  const c = pixelsEntiers(cadre);
  const x0 = Math.max(c.x0, masque.x);
  const y0 = Math.max(c.y0, masque.y);
  const x1 = Math.min(c.x1, masque.x + masque.w - 1);
  const y1 = Math.min(c.y1, masque.y + masque.h - 1);
  if (x1 < x0 || y1 < y0) return null;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  let meilleur: [number, number] | null = null;
  let distance = Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!dansLeMasque(masque, x, y)) continue;
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < distance) {
        distance = d;
        meilleur = [x, y];
      }
    }
  }
  return meilleur;
}

/** Les zones qui ont au moins un pixel dans le cadre, dans l'ordre reçu, numérotées à partir de 1, avec le point de leur numéro. */
export function zonesDansLeCadre<T extends { masque: Masque }>(zones: readonly T[], cadre: Rect): { zone: T; numero: number; point: [number, number] }[] {
  const out: { zone: T; numero: number; point: [number, number] }[] = [];
  for (const zone of zones) {
    const point = pointDansLeCadre(zone.masque, cadre);
    if (point) out.push({ zone, numero: out.length + 1, point });
  }
  return out;
}

/** La largeur d'un texte dans une police donnée, mesurée par le navigateur (ou par un test). */
export type Mesure = (texte: string) => number;

/**
 * Un texte coupé en lignes d'au plus `largeur`, aux espaces ordinaires : une espace insécable (« 1 000 », « 45 % ») tient
 * ses voisins ensemble. Un mot plus long que la ligne reste entier sur sa ligne, raccourci par `raccourcir` au dessin.
 */
export function couperEnLignes(texte: string, largeur: number, mesure: Mesure): string[] {
  const mots = texte.split(/[ \t\r\n]+/).filter((m) => m.length > 0);
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (!ligne || mesure(essai) <= largeur) ligne = essai;
    else {
      lignes.push(ligne);
      ligne = mot;
    }
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

/** Un texte raccourci d'un « … » pour tenir dans `largeur` ; tel quel s'il tient. */
export function raccourcir(texte: string, largeur: number, mesure: Mesure): string {
  if (mesure(texte) <= largeur) return texte;
  const lettres = [...texte];
  let bas = 0;
  let haut = lettres.length;
  // La plus longue tête du texte qui tient avec son « … ».
  while (bas < haut) {
    const milieu = Math.ceil((bas + haut) / 2);
    if (mesure(`${lettres.slice(0, milieu).join("").trimEnd()}…`) <= largeur) bas = milieu;
    else haut = milieu - 1;
  }
  return `${lettres.slice(0, bas).join("").trimEnd()}…`;
}

/**
 * Combien de blocs, de hauteurs `hauteurs`, tiennent l'un sous l'autre dans `place`. S'ils ne tiennent pas tous, `reste`
 * est gardé sous les blocs posés pour la ligne qui dit combien il en manque.
 */
export function blocsQuiTiennent(hauteurs: readonly number[], place: number, reste: number): number {
  const total = hauteurs.reduce((a, b) => a + b, 0);
  if (total <= place) return hauteurs.length;
  let pris = 0;
  let n = 0;
  for (const h of hauteurs) {
    if (pris + h > place - reste) break;
    pris += h;
    n++;
  }
  return n;
}

/** Le nom du fichier de l'image, à l'heure de Paris : `gal-carte-alliance-2026-11-13-14h05.png`. */
export function nomDeFichier(maintenant: Date): string {
  const { date } = parisParts(maintenant);
  const minutes = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(maintenant).replace(":", "h");
  return `gal-carte-alliance-${date}-${minutes}.png`;
}

/* ---------- Les textes de l'image ---------- */

/** Les deux langues de la fenêtre « Alliance » : le joueur allié prend sa capture dans la sienne. */
export type LangueCapture = "fr" | "en";

/** Une ligne de la légende : une couleur de la carte et ce qu'elle désigne. */
export interface LigneLegende {
  couleur: number;
  texte: string;
  /** À droite : ses pixels au dernier relevé, ou rien. */
  detail: string;
}

/** Une zone dans l'image : son numéro sur la carte, son nom, sa part prise, et ses chiffres en phrases. */
export interface EntreeZone {
  numero: number;
  /** La couleur de son étiquette, 0xRRGGBB ; `null` : blanc. */
  couleur: number | null;
  titre: string;
  /** Écrit à droite du nom : la part déjà prise. Vide sans bilan. */
  droite: string;
  lignes: string[];
  /** Le pixel de la carte complète où poser son numéro. */
  point: [number, number];
}

/** Tout ce que l'image écrit, déjà mis en forme dans la langue choisie. */
export interface ContenuCapture {
  /** Le morceau de la carte montré, dans le cadre de la carte de l'image. */
  vue: Vue;
  titre: string;
  /** À droite de l'en-tête : le nom de notre alliance. */
  sousTitre: string | null;
  /** Sous lui : la date du relevé des territoires, puis celle de la capture. */
  dates: string[];
  legendeTitre: string;
  legende: LigneLegende[];
  /** Sous la légende : les troupes déclarées de notre alliance. */
  legendeNotes: string[];
  /** `null` : le joueur a choisi une capture sans les zones. */
  zones: null | {
    titre: string;
    entrees: EntreeZone[];
    /** La ligne qui dit combien de zones n'ont pas trouvé place dans le panneau. */
    reste: (n: number) => string;
    regles: string;
  };
  /** Le morceau de la carte complète montré, en coordonnées. */
  cadre: string;
  credit: string;
  sources: string;
  adresse: string;
  /** Le texte qui remplace l'image pour un lecteur d'écran. */
  alt: string;
}

/** La source du fond de carte et sa licence, comme sur l'image /carte du robot (`commandes-image.ts`). */
export const SOURCES_CAPTURE = "github.com/openfrontio/OpenFrontIO/tree/main/resources/maps/giantworldmap · creativecommons.org/licenses/by-sa/4.0";

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

/** Les textes de l'onglet Capture et de l'image, en français et en anglais. Les nombres arrivent déjà écrits. */
export const TEXTES_CAPTURE = {
  fr: {
    onglet: "Capture",
    aide: "L'image montre la carte telle que vous la cadrez, avec le logo de GAL, prête à envoyer sur Discord.",
    avecZones: "Montrer les zones et leurs chiffres",
    prendre: "Prendre la capture",
    reprendre: "Reprendre la capture",
    enCours: "Capture en cours…",
    copier: "Copier l'image",
    telecharger: "Télécharger",
    partager: "Partager",
    copiee: "Image copiée : collez-la dans votre message Discord.",
    prete: "Capture prête.",
    copieRefusee: "Le navigateur refuse la copie : téléchargez l'image, puis glissez-la dans Discord.",
    echec: "La capture n'a pas pu se faire. Réessayez.",
    boutonCarte: "Capture",
    titre: "Carte de l'alliance",
    releve: (date: string) => `Territoires au relevé du ${date}`,
    prise: (date: string) => `Capture du ${date}`,
    legendeTitre: "Couleurs de la carte",
    pixels: (n: string) => `${n} pixels`,
    troupes: (total: string, declares: number, clans: number, depuis: string) =>
      `Troupes déclarées par notre alliance : ${total}, par ${declares} ${pluriel(declares, "clan", "clans")} sur ${clans}. ${declares > 1 ? `La plus ancienne déclaration date du ${depuis}.` : `Déclarées le ${depuis}.`}`,
    legendeReste: (n: number) => `Et ${n} ${pluriel(n, "autre couleur, écrite", "autres couleurs, écrites")} dans la fenêtre Alliance.`,
    zonesTitre: "Zones dans l'image",
    priseA: (pct: string) => `prise à ${pct}`,
    pour: (qui: string, pixels: string, deja: string) => `Pour ${qui} · ${pixels} pixels, dont ${deja} déjà à l'alliance`,
    pourSansBilan: (qui: string, pixels: string) => `Pour ${qui} · ${pixels} pixels`,
    touteLAlliance: "toute l'alliance",
    neutres: (pixels: string, troupes: string) => `Terre neutre : ${pixels} pixels, soit ${troupes} troupes.`,
    autres: (pixels: string, liste: string, troupes: string) => `Aux autres clans : ${pixels} pixels (${liste}), soit au moins ${troupes} troupes.`,
    autresEtPlus: (n: number) => `et ${n} ${pluriel(n, "autre", "autres")}`,
    mer: (pixels: string) => `En mer, qui ne se prend pas : ${pixels} pixels.`,
    clanSupprime: "clan supprimé",
    reste: (n: number) => `Et ${n} ${pluriel(n, "autre zone, numérotée", "autres zones, numérotées")} sur la carte.`,
    regles: (neutre: string, ennemi: string, date: string) => `${neutre} troupes par pixel neutre, au moins ${ennemi} par pixel d'un autre clan, selon les règles du jeu lues le ${date}.`,
    cadre: (x0: string, x1: string, y0: string, y1: string) => `Morceau de carte : x de ${x0} à ${x1}, y de ${y0} à ${y1}`,
    credit: "Carte : © OpenFront and Contributors, CC BY-SA 4.0. Fond Giant World Map réduit, terre assombrie, territoires et zones dessinés par le site, même licence.",
    alt: (releve: string, zones: number) =>
      `Capture de la carte de l'alliance avec le logo de GAL : territoires au relevé du ${releve}${zones > 0 ? `, ${zones} ${pluriel(zones, "zone", "zones")} dans l'image` : ""}.`,
    locale: "fr-FR",
  },
  en: {
    onglet: "Snapshot",
    aide: "The image shows the map as you frame it, with the GAL logo, ready to post on Discord.",
    avecZones: "Show the zones and their figures",
    prendre: "Take the snapshot",
    reprendre: "Take it again",
    enCours: "Taking the snapshot…",
    copier: "Copy image",
    telecharger: "Download",
    partager: "Share",
    copiee: "Image copied: paste it into your Discord message.",
    prete: "Snapshot ready.",
    copieRefusee: "Your browser refuses to copy: download the image, then drag it into Discord.",
    echec: "The snapshot failed. Try again.",
    boutonCarte: "Snapshot",
    titre: "Alliance map",
    releve: (date: string) => `Territories as of ${date} (Paris time)`,
    prise: (date: string) => `Snapshot taken ${date}`,
    legendeTitre: "Map colours",
    pixels: (n: string) => `${n} pixels`,
    troupes: (total: string, declares: number, clans: number, depuis: string) =>
      `Troops declared by our alliance: ${total}, by ${declares} of ${clans} ${pluriel(clans, "clan", "clans")}. ${declares > 1 ? `The oldest declaration is from ${depuis}.` : `Declared ${depuis}.`}`,
    legendeReste: (n: number) => `And ${n} more ${pluriel(n, "colour", "colours")}, listed in the Alliance window.`,
    zonesTitre: "Zones in the image",
    priseA: (pct: string) => `${pct} taken`,
    pour: (qui: string, pixels: string, deja: string) => `For ${qui} · ${pixels} pixels, ${deja} already ours`,
    pourSansBilan: (qui: string, pixels: string) => `For ${qui} · ${pixels} pixels`,
    touteLAlliance: "the whole alliance",
    neutres: (pixels: string, troupes: string) => `Neutral land: ${pixels} pixels, that is ${troupes} troops.`,
    autres: (pixels: string, liste: string, troupes: string) => `Other clans: ${pixels} pixels (${liste}), that is at least ${troupes} troops.`,
    autresEtPlus: (n: number) => `and ${n} more`,
    mer: (pixels: string) => `At sea, which cannot be taken: ${pixels} pixels.`,
    clanSupprime: "deleted clan",
    reste: (n: number) => `And ${n} more ${pluriel(n, "zone", "zones")}, numbered on the map.`,
    regles: (neutre: string, ennemi: string, date: string) => `${neutre} troops per neutral pixel, at least ${ennemi} per pixel of another clan, under the game rules read on ${date}.`,
    cadre: (x0: string, x1: string, y0: string, y1: string) => `Part of the map: x from ${x0} to ${x1}, y from ${y0} to ${y1}`,
    credit: "Map: © OpenFront and Contributors, CC BY-SA 4.0. Giant World Map background scaled down, land darkened, territories and zones drawn by the site, same licence.",
    alt: (releve: string, zones: number) => `Snapshot of the alliance map with the GAL logo: territories as of ${releve}${zones > 0 ? `, ${zones} ${pluriel(zones, "zone", "zones")} in the image` : ""}.`,
    locale: "en-GB",
  },
} as const;

export type TextesCapture = (typeof TEXTES_CAPTURE)[LangueCapture];

/** Un jour et une heure à Paris, avec l'année : l'image se relit plus tard, ailleurs. */
export function dateDeCapture(iso: string | Date, langue: LangueCapture, avecHeure = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const locale = TEXTES_CAPTURE[langue].locale;
  const jour = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" }).format(d);
  if (!avecHeure) return jour;
  const heure = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${jour}, ${heure}`;
}

/** Une zone de la fenêtre, telle que la capture la lit. */
export interface ZonePourCapture {
  id: number;
  title: string;
  /** Le clan qui la prend, ou toute l'alliance. */
  tag: string | null;
  masque: Masque;
  couleur: number | null;
}

export interface EntreeCapture {
  langue: LangueCapture;
  /** Les nombres de la fenêtre, dans sa langue. */
  nombre: (n: number) => string;
  /** Une part de 0 à 1, en pourcentage. */
  pct: (part: number) => string;
  /** La vue de l'image (`vueDeCapture`). */
  vue: Vue;
  monde: Monde;
  /** Le relevé des territoires (`film.fetchedAt`). */
  releve: string;
  maintenant: Date;
  notreAlliance: string | null;
  legende: LigneLegende[];
  /** Les troupes déclarées de notre alliance ; `null` sans alliance. */
  troupes: TroupesAlliance | null;
  /** `null` : sans les zones. */
  zones: readonly ZonePourCapture[] | null;
  bilans: ReadonlyMap<number, BilanZone>;
  /** L'adresse de la page, sans « https:// ». */
  adresse: string;
}

/** Les pixels d'un masque, pour une zone sans bilan. */
function pixelsDuMasque(masque: Masque): number {
  let n = 0;
  for (let i = 0; i < masque.w * masque.h; i++) if (masque.bits[i >> 3]! & (1 << (i & 7))) n++;
  return n;
}

/** Les chiffres d'une zone, en phrases courtes : à qui elle revient, ce qui reste à prendre, et à quel prix au moins. */
function lignesDeZone(z: ZonePourCapture, bilan: BilanZone | null, e: EntreeCapture, t: TextesCapture): string[] {
  const qui = z.tag ?? t.touteLAlliance;
  if (!bilan) return [t.pourSansBilan(qui, e.nombre(pixelsDuMasque(z.masque)))];
  const lignes = [t.pour(qui, e.nombre(bilan.pixels), e.nombre(bilan.alliance))];
  if (bilan.neutres > 0) lignes.push(t.neutres(e.nombre(bilan.neutres), e.nombre(bilan.coutNeutres)));
  if (bilan.ennemis > 0) {
    const liste = bilan.autres.slice(0, 3).map((a) => `${a.tag ?? t.clanSupprime} ${e.nombre(a.pixels)}`);
    if (bilan.autres.length > 3) liste.push(t.autresEtPlus(bilan.autres.length - 3));
    lignes.push(t.autres(e.nombre(bilan.ennemis), liste.join(", "), e.nombre(bilan.coutEnnemisMinimum)));
  }
  if (bilan.mer > 0) lignes.push(t.mer(e.nombre(bilan.mer)));
  return lignes;
}

/** Tout ce que l'image écrit, mis en forme dans la langue du joueur. */
export function contenuDeLaCapture(e: EntreeCapture): ContenuCapture {
  const t = TEXTES_CAPTURE[e.langue];
  const sortie = { width: CAPTURE.carte.w, height: CAPTURE.carte.h };
  const montre = cadreDeLaVue(e.vue, sortie, e.monde);
  const dansLImage = e.zones ? zonesDansLeCadre(e.zones, montre) : [];
  const entrees: EntreeZone[] = dansLImage.map(({ zone, numero, point }) => {
    const bilan = e.bilans.get(zone.id) ?? null;
    return { numero, couleur: zone.couleur, titre: zone.title, droite: bilan ? t.priseA(e.pct(bilan.part)) : "", lignes: lignesDeZone(zone, bilan, e, t), point };
  });
  const releve = dateDeCapture(e.releve, e.langue);
  const coord = (v: number) => e.nombre(Math.round(v));
  return {
    vue: e.vue,
    titre: t.titre,
    sousTitre: e.notreAlliance,
    dates: [t.releve(releve), t.prise(dateDeCapture(e.maintenant, e.langue))],
    legendeTitre: t.legendeTitre,
    // Une légende trop longue couvrirait les zones : ses premières couleurs, et toujours la dernière, les autres clans.
    legende: e.legende.length > LEGENDE_MAX ? [...e.legende.slice(0, LEGENDE_MAX - 1), e.legende[e.legende.length - 1]!] : e.legende,
    legendeNotes: [
      ...(e.legende.length > LEGENDE_MAX ? [t.legendeReste(e.legende.length - LEGENDE_MAX)] : []),
      // Des troupes déclarées gardent leur date : relues plus tard sur Discord, elles ne passent pas pour celles de la capture.
      ...(e.troupes && e.troupes.declares > 0 && e.troupes.plusAncienne ? [t.troupes(e.nombre(e.troupes.total), e.troupes.declares, e.troupes.clans, dateDeCapture(e.troupes.plusAncienne, e.langue))] : []),
    ],
    zones: e.zones
      ? {
          titre: t.zonesTitre,
          entrees,
          reste: t.reste,
          regles: t.regles(e.nombre(NEUTRAL_PIXEL_TROOPS), e.nombre(ENEMY_PIXEL_BASE_TROOPS), dateDeCapture(`${RULES_CHECKED_ON}T12:00:00Z`, e.langue, false)),
        }
      : null,
    cadre: t.cadre(coord(montre.x), coord(montre.x + montre.w), coord(montre.y), coord(montre.y + montre.h)),
    credit: t.credit,
    sources: SOURCES_CAPTURE,
    adresse: e.adresse,
    alt: t.alt(releve, entrees.length),
  };
}

/* ---------- La légende de l'image ---------- */

/** Au plus douze couleurs dans le panneau : au-delà, elles couvriraient les zones. Les autres restent dans la fenêtre. */
export const LEGENDE_MAX = 12;

/** Une couleur de la légende de la fenêtre (`commun.tsx`), dans son ordre. */
export interface CouleurDeLaFenetre {
  couleur: number;
  nom: string;
}

/**
 * La légende de l'image : celle de la fenêtre, dans le même ordre, avec à droite les pixels au dernier relevé de chaque
 * couleur qui désigne un clan (`couleursClans`, carte colorée par clan) ou une alliance (`totaux`, carte colorée par
 * alliance). Un chiffre ne s'écrit que si le nom et la couleur sont exactement ceux du clan ou de l'alliance comptés : une
 * ligne qu'on ne sait pas attribuer reste sans chiffre. Sans les zones, « Toute l'alliance », la couleur des zones de
 * toute l'alliance, ne désigne rien sur l'image : elle n'est pas écrite.
 */
export function legendeDeCapture(e: {
  legende: readonly CouleurDeLaFenetre[];
  mode: "clans" | "alliances";
  couleursClans: ReadonlyMap<string, number>;
  totaux: readonly { name: string; color: number; pixels: number }[];
  /** Le territoire de chaque clan au dernier relevé (`film.standings`) ; un tag porté par deux clans compte les deux, comme `totauxAlliances`. */
  standings: readonly { tag: string | null; pixels: number }[];
  avecZones: boolean;
  /** Le nom de « Toute l'alliance » dans la langue de la fenêtre. */
  touteLAlliance: string;
  /** Ce qui s'écrit à droite : « 12 345 pixels ». */
  pixels: (n: number) => string;
}): LigneLegende[] {
  const parTag = new Map<string, number>();
  for (const s of e.standings) if (s.tag !== null) parTag.set(s.tag, (parTag.get(s.tag) ?? 0) + s.pixels);
  const out: LigneLegende[] = [];
  for (const l of e.legende) {
    let pixels: number | null = null;
    if (e.mode === "clans") {
      if (e.couleursClans.get(l.nom) === l.couleur) pixels = parTag.get(l.nom) ?? 0;
    } else {
      const alliances = e.totaux.filter((a) => a.name === l.nom && a.color === l.couleur);
      // Deux alliances du même nom et de la même couleur : on ne sait pas laquelle, pas de chiffre.
      if (alliances.length === 1) pixels = alliances[0]!.pixels;
    }
    if (pixels === null && !e.avecZones && l.nom === e.touteLAlliance) continue;
    out.push({ couleur: l.couleur, texte: l.nom, detail: pixels === null ? "" : e.pixels(pixels) });
  }
  return out;
}
