/**
 * La loterie du lundi (16 novembre 2026, demande du pilote) : ce que son écran (`src/components/village/Loterie.tsx`) lit
 * et déduit. Des calculs purs : la lecture des réponses du serveur, la part de chacun, ce qu'un membre peut encore
 * acheter, les mots des lots, et la mise en place de « la jauge des parts », l'animation choisie par le pilote parmi cinq.
 * Rien ne décide d'un droit, d'un prix ni d'un tirage : le serveur le fait (`contrat.ts`, « La loterie du lundi »).
 *
 * La jauge : tous les billets du tirage sur une seule barre, une part par Gaulois, ses billets gagnés (bleu) puis ses
 * billets achetés (or). Une pointe la parcourt et s'arrête sur le billet tiré ; la part du gagnant se referme, celles des
 * autres s'élargissent d'autant, et la pointe repart pour le lot suivant : l'or, l'argent, puis le bronze, dans l'ordre où
 * le serveur les a tirés. Le dessin ne choisit rien : il montre le billet que le serveur a noté (`billet`).
 */
import { errorMessage } from "../compte/errors";
import { addDays } from "../time";
import { POCHETTES_GAGNEES, type AchatDeBillets, type LotDeLoterie, type MaLoterie, type PartDeLoterie, type PochetteGagnee } from "./contrat";
import { stateres } from "./ecran-boutique";

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const estJour = (valeur: unknown): valeur is string => typeof valeur === "string" && JOUR.test(valeur) && !Number.isNaN(Date.parse(`${valeur}T00:00:00Z`));
const estInstant = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));

/** L'onglet de la loterie dans « Mon Gaulois », et son adresse (`/village#loterie`). */
export const ANCRE_LOTERIE = "loterie";

/** Les marches du podium, dans l'ordre du tirage : l'or d'abord. */
export const RANGS = [1, 2, 3] as const;
export type Rang = (typeof RANGS)[number];
export const NOMS_DES_RANGS: Readonly<Record<Rang, string>> = { 1: "Or", 2: "Argent", 3: "Bronze" };

/** Le nom de chaque pochette gagnée, comme à l'onglet « Les pochettes ». */
export const NOMS_DES_POCHETTES: Readonly<Record<PochetteGagnee, { une: string; des: string }>> = {
  surprise: { une: "une pochette surprise", des: "pochettes surprises" },
  familiers: { une: "une pochette des familiers", des: "pochettes des familiers" },
  bannieres: { une: "une pochette des bannières", des: "pochettes des bannières" },
  modeles: { une: "une pochette des Gaulois uniques", des: "pochettes des Gaulois uniques" },
  stateres: { une: "une pochette de statères", des: "pochettes de statères" },
};

/** Le plus de parts qu'un tirage montre : au-delà, la réponse n'est pas celle du clan. */
export const PARTS_AU_PLUS = 2000;

const billets = (part: Pick<PartDeLoterie, "gratuits" | "achetes">): number => part.gratuits + part.achetes;
/** Les billets d'une part, gagnés et achetés. */
export const billetsDe = billets;
/** Tous les billets d'un tirage. */
export const totalDesBillets = (parts: readonly PartDeLoterie[]): number => parts.reduce((somme, part) => somme + billets(part), 0);

/* ---------- La lecture des réponses ---------- */

/**
 * Les parts d'un tirage telles que le serveur les donne : un nom, au moins un billet gagné, jamais deux fois « moi ».
 * Pour un tirage fait (`fait`), les rangs 1, 2, 3 sans doublon, chacun avec un billet qui est bien un des siens.
 * Sinon `null` : l'écran ne montre pas un tirage qu'il ne saurait pas dessiner juste.
 */
export function lireParts(valeur: unknown, fait: boolean): PartDeLoterie[] | null {
  if (!Array.isArray(valeur) || valeur.length > PARTS_AU_PLUS) return null;
  const parts: PartDeLoterie[] = [];
  for (const ligne of valeur) {
    if (!estObjetJson(ligne)) return null;
    const { nom, tenue, moi, gratuits, achetes } = ligne;
    if (typeof nom !== "string" || nom.trim() === "" || typeof moi !== "boolean" || !entier(gratuits, 1) || !entier(achetes, 0)) return null;
    let rang: Rang | null = null;
    let billet: number | null = null;
    if (fait && ligne["rang"] !== null && ligne["rang"] !== undefined) {
      const r = ligne["rang"];
      const b = ligne["billet"];
      if ((r !== 1 && r !== 2 && r !== 3) || !entier(b, 0) || b >= gratuits + achetes) return null;
      rang = r;
      billet = b;
    }
    const banniere = typeof ligne["banniere"] === "string" && ligne["banniere"] !== "" ? ligne["banniere"] : null;
    parts.push({ nom, tenue: tenue ?? null, banniere, moi, gratuits, achetes, rang, billet });
  }
  if (parts.filter((part) => part.moi).length > 1) return null;
  // Jamais deux gagnants sur la même marche. Une marche peut manquer : moins de trois parts, ou un compte effacé depuis.
  const rangs = parts.flatMap((part) => (part.rang === null ? [] : [part.rang]));
  if (new Set(rangs).size !== rangs.length) return null;
  return parts;
}

/** Les lots du podium tels que le serveur les donne : les rangs 1, 2, 3, des statères et des nombres de pochettes entiers. */
export function lireLotsDeLoterie(valeur: unknown): LotDeLoterie[] | null {
  if (!Array.isArray(valeur) || valeur.length !== 3) return null;
  const lots: LotDeLoterie[] = [];
  for (const ligne of valeur) {
    if (!estObjetJson(ligne) || !estObjetJson(ligne["pochettes"])) return null;
    const { rang, gain } = ligne;
    if ((rang !== 1 && rang !== 2 && rang !== 3) || !entier(gain, 0)) return null;
    const pochettes = {} as Record<PochetteGagnee, number>;
    for (const cle of POCHETTES_GAGNEES) {
      const n = ligne["pochettes"][cle];
      if (!entier(n, 0)) return null;
      pochettes[cle] = n;
    }
    lots.push({ rang, gain, pochettes });
  }
  lots.sort((a, b) => a.rang - b.rang);
  return lots.every((lot, i) => lot.rang === i + 1) ? lots : null;
}

/** Les pochettes gagnées qui restent à ouvrir : les sortes connues seulement, chacune avec un nombre entier positif. */
export function lireBons(valeur: unknown): Partial<Record<PochetteGagnee, number>> | null {
  if (!estObjetJson(valeur)) return null;
  const bons: Partial<Record<PochetteGagnee, number>> = {};
  for (const cle of POCHETTES_GAGNEES) {
    const n = valeur[cle];
    if (n === undefined || n === null) continue;
    if (!entier(n, 0)) return null;
    if (n > 0) bons[cle] = n;
  }
  return bons;
}

/** `get_pochettes_gagnees()` lue ; `null` si la réponse n'a pas la forme du contrat. */
export function lirePochettesGagnees(reponse: unknown): Partial<Record<PochetteGagnee, number>> | null {
  return estObjetJson(reponse) && reponse["ok"] === true ? lireBons(reponse["bons"]) : null;
}

/** `get_loterie()` lue ; `null` si la réponse n'a pas la forme du contrat. */
export function lireLoterie(reponse: unknown): MaLoterie | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const { tirage, heure, close, prix, peut_acheter, solde, releve } = reponse;
  const lots = lireLotsDeLoterie(reponse["lots"]);
  const parts = lireParts(reponse["parts"], false);
  const bons = lireBons(reponse["bons"]);
  if (!estJour(tirage) || !estInstant(heure) || typeof close !== "boolean" || !entier(prix, 1) || typeof peut_acheter !== "boolean" || !entier(solde, 0) || !lots || !parts || !bons) return null;
  let dernier: MaLoterie["dernier"] = null;
  const d = reponse["dernier"];
  if (d !== null && d !== undefined) {
    if (!estObjetJson(d) || !estJour(d["tirage"]) || !estInstant(d["tire_le"])) return null;
    const faites = lireParts(d["parts"], true);
    if (!faites) return null;
    dernier = { tirage: d["tirage"], tire_le: d["tire_le"], parts: faites };
  }
  return { ok: true, tirage, heure, close, prix, lots, parts, peut_acheter, solde, bons, dernier, releve: estInstant(releve) ? releve : null };
}

/** `acheter_billets_loterie()` lue ; `null` si la réponse n'a pas la forme du contrat. */
export function lireAchatDeBillets(reponse: unknown): AchatDeBillets | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const { solde, gratuits, achetes } = reponse;
  if (!entier(solde, 0) || !entier(gratuits, 1) || !entier(achetes, 1) || achetes > gratuits) return null;
  return { ok: true, solde, gratuits, achetes };
}

/** La loterie après un achat : le solde et les billets que le serveur vient de donner, à la place des anciens. */
export function apresLAchat(ma: MaLoterie, achat: AchatDeBillets): MaLoterie {
  return { ...ma, solde: achat.solde, parts: ma.parts.map((part) => (part.moi ? { ...part, gratuits: achat.gratuits, achetes: achat.achetes } : part)) };
}

/* ---------- Ce que l'écran en dit ---------- */

/** La part du membre qui regarde, s'il en a une. */
export const maPart = (parts: readonly PartDeLoterie[]): PartDeLoterie | null => parts.find((part) => part.moi) ?? null;

/** La part d'un Gaulois dans le tirage, en pour cent de tous les billets ; 0 s'il n'y a aucun billet. */
export function partEnPourcent(part: PartDeLoterie, parts: readonly PartDeLoterie[]): number {
  const total = totalDesBillets(parts);
  return total > 0 ? (billets(part) * 100) / total : 0;
}

/**
 * Ce que le membre peut encore acheter : `max` billets, ou la raison pour laquelle il n'en achète aucun. La règle du
 * serveur : jamais plus de billets achetés que de billets gagnés, et le solde doit payer.
 */
export function achatPossible(ma: Pick<MaLoterie, "peut_acheter" | "parts" | "solde" | "prix" | "close">): { max: number; raison: string | null } {
  if (!ma.peut_acheter) return { max: 0, raison: "Les billets s'achètent une fois votre compte validé et votre Gaulois créé." };
  const part = maPart(ma.parts);
  // Le lundi avant 21 h 30, la semaine du tirage est finie : des points rapportés ce jour-là comptent pour le suivant.
  if (!part) return { max: 0, raison: ma.close ? "Vous n'avez rapporté aucun point la semaine de ce tirage : vos points d'aujourd'hui comptent pour le suivant." : "Vos premiers billets viennent des points que vous rapportez au clan cette semaine." };
  const reste = part.gratuits - part.achetes;
  if (reste <= 0) return { max: 0, raison: "Vous avez acheté autant de billets que vous en avez gagné : c'est le plus permis." };
  const payes = Math.floor(ma.solde / ma.prix);
  if (payes < 1) return { max: 0, raison: `Il vous manque ${stateres(ma.prix - ma.solde)} pour un billet.` };
  return { max: Math.min(reste, payes), raison: null };
}

/** La semaine d'un tirage : du lundi d'avant au dimanche, jours à Paris. */
export function semaineDuTirage(tirage: string): { debut: string; fin: string } {
  return { debut: addDays(tirage, -7), fin: addDays(tirage, -1) };
}

const JOUR_EN_MOTS = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
/** « lundi 23 novembre » : un jour AAAA-MM-JJ, en mots. */
export const jourEnMots = (jour: string): string => JOUR_EN_MOTS.format(new Date(`${jour}T12:00:00Z`)).replace(/^(\D+) 1 /, "$1 1er ");
/** « 23 novembre ». */
export const jourCourt = (jour: string): string => JOUR_COURT.format(new Date(`${jour}T12:00:00Z`)).replace(/^1 /, "1er ");

/** Les pochettes d'un lot, en mots : « une pochette de chaque sorte », ou chacune à la suite. `[]` : aucune. */
export function pochettesDuLot(lot: LotDeLoterie): string[] {
  if (POCHETTES_GAGNEES.every((cle) => lot.pochettes[cle] === 1)) return ["une pochette de chaque sorte"];
  return POCHETTES_GAGNEES.filter((cle) => lot.pochettes[cle] > 0).map((cle) => (lot.pochettes[cle] === 1 ? NOMS_DES_POCHETTES[cle].une : `${lot.pochettes[cle]} ${NOMS_DES_POCHETTES[cle].des}`));
}

/** Les pochettes gagnées qui restent à ouvrir, en mots, dans l'ordre de l'onglet. */
export function bonsEnMots(bons: Partial<Record<PochetteGagnee, number>>): string[] {
  return POCHETTES_GAGNEES.flatMap((cle) => {
    const n = bons[cle] ?? 0;
    return n < 1 ? [] : [n === 1 ? NOMS_DES_POCHETTES[cle].une : `${n} ${NOMS_DES_POCHETTES[cle].des}`];
  });
}

/** Le message d'un refus de l'achat de billets. */
export function messageDuRefusDeLoterie(code: string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant" && contexte.manque) return `Il vous manque ${stateres(contexte.manque)}.`;
  if (code === "not_validated") return "Les billets s'achètent quand un officier a validé votre compte.";
  return errorMessage(code);
}

/** Les gagnants d'un tirage fait, dans l'ordre du tirage : l'or, l'argent, le bronze. */
export function gagnants(parts: readonly PartDeLoterie[]): { index: number; part: PartDeLoterie; rang: Rang; billet: number }[] {
  return parts
    .flatMap((part, index) => (part.rang === null || part.billet === null ? [] : [{ index, part, rang: part.rang, billet: part.billet }]))
    .sort((a, b) => a.rang - b.rang);
}

/* ---------- La jauge des parts ---------- */

const borne = (x: number): number => Math.min(1, Math.max(0, x));
/** De 0 à 1, départ et arrivée en douceur. */
export const lisse = (u: number): number => {
  const x = borne(u);
  return x * x * (3 - 2 * x);
};
/** De 0 à 1 : part doucement, ralentit longuement. La course de la pointe. */
export const course = (u: number): number => 1 - Math.pow(1 - Math.pow(borne(u), 1.5), 3);

/**
 * L'ordre des parts sur la jauge : une grosse, une petite, une grosse… pour que deux petites parts ne se serrent pas et
 * que leurs Gaulois se lisent. Des indices dans `parts`.
 */
export function ordreDeLaJauge(parts: readonly PartDeLoterie[]): number[] {
  const tri = parts.map((_, i) => i).sort((a, b) => billets(parts[b]!) - billets(parts[a]!) || a - b);
  const ordre: number[] = [];
  let gros = 0;
  let petit = tri.length - 1;
  while (gros <= petit) {
    ordre.push(tri[gros++]!);
    if (gros <= petit) ordre.push(tri[petit--]!);
  }
  return ordre;
}

/**
 * Les parts dont le Gaulois se dessine au-dessus de la jauge, quand tous ne tiennent pas : les gagnants et le membre qui
 * regarde d'abord, puis les plus grosses parts, `place` en tout.
 */
export function bustesDeLaJauge(parts: readonly PartDeLoterie[], place: number): Set<number> {
  const rangDe = (part: PartDeLoterie): number => (part.rang !== null ? 0 : part.moi ? 1 : 2);
  const tri = parts.map((_, i) => i).sort((a, b) => rangDe(parts[a]!) - rangDe(parts[b]!) || billets(parts[b]!) - billets(parts[a]!) || a - b);
  return new Set(tri.slice(0, Math.max(0, place)));
}

/** Une part posée sur la jauge. */
export interface SegmentDeJauge {
  /** L'indice de la part dans `parts`. */
  index: number;
  x: number;
  largeur: number;
  /** La largeur de ses billets gagnés ; le reste, à droite, ses billets achetés. */
  gagnes: number;
  /** De 1 (ouverte) à 0 (refermée). */
  ouverture: number;
  /** L'abscisse du milieu de son Gaulois, ou null s'il n'est pas dessiné. */
  buste: number | null;
}

export interface CadreDeJauge {
  x: number;
  largeur: number;
  /** L'espace entre deux parts. */
  joint: number;
  /** La place que prend un Gaulois, en largeur. */
  buste: number;
}

/**
 * Pose les parts sur la jauge, dans `ordre`. `fermetures` : pour chaque part (indice de `parts`), de 0 (ouverte) à 1
 * (refermée) ; une part refermée ne prend plus de place, les autres se partagent toute la largeur selon leurs billets.
 * Les Gaulois de `avecBuste` se posent au milieu de leur part, puis s'écartent pour ne pas se chevaucher, sans sortir de
 * la jauge.
 */
export function dispositionDeLaJauge(parts: readonly PartDeLoterie[], ordre: readonly number[], fermetures: readonly number[], cadre: CadreDeJauge, avecBuste: ReadonlySet<number>): SegmentDeJauge[] {
  const ouverture = (i: number): number => 1 - borne(fermetures[i] ?? 0);
  const joint = Math.min(cadre.joint, (cadre.largeur * 0.2) / Math.max(1, ordre.length - 1));
  const total = ordre.reduce((somme, i) => somme + billets(parts[i]!) * ouverture(i), 0);
  const dernier = ordre[ordre.length - 1];
  const joints = ordre.reduce((somme, i) => somme + joint * ouverture(i), 0) - (dernier === undefined ? 0 : joint * ouverture(dernier));
  const segments: SegmentDeJauge[] = [];
  let x = cadre.x;
  for (const i of ordre) {
    const part = parts[i]!;
    const largeur = total > 0 ? ((cadre.largeur - joints) * billets(part) * ouverture(i)) / total : 0;
    segments.push({ index: i, x, largeur, gagnes: (largeur * part.gratuits) / billets(part), ouverture: ouverture(i), buste: avecBuste.has(i) ? x + largeur / 2 : null });
    x += largeur + joint * ouverture(i);
  }
  // Les Gaulois s'écartent : une passe vers la droite, une vers la gauche. Un Gaulois dont la part se referme rétrécit.
  const bustes = segments.filter((s) => s.buste !== null);
  let bord = cadre.x;
  for (const s of bustes) {
    const place = cadre.buste * s.ouverture;
    const gauche = Math.max(s.buste! - place / 2, bord);
    s.buste = gauche + place / 2;
    bord = gauche + place;
  }
  bord = cadre.x + cadre.largeur;
  for (const s of [...bustes].reverse()) {
    const place = cadre.buste * s.ouverture;
    const droite = Math.min(s.buste! + place / 2, bord);
    s.buste = droite - place / 2;
    bord = droite - place;
  }
  return segments;
}

/** L'abscisse du billet `billet` (compté à partir de zéro) dans la part posée sur la jauge. */
export function abscisseDuBillet(segment: SegmentDeJauge, part: PartDeLoterie, billet: number): number {
  return segment.x + (segment.largeur * (billet + 0.5)) / billets(part);
}

/**
 * Où est la pointe : partie du bord gauche, elle va au bord droit, revient au bord gauche, puis s'arrête sur `but`.
 * `avancee` : de 0 à 1, déjà adoucie (`course`).
 */
export function pointeDeLaJauge(but: number, cadre: Pick<CadreDeJauge, "x" | "largeur">, avancee: number): number {
  const chemin = (2 * cadre.largeur + but - cadre.x) * borne(avancee);
  const plie = chemin % (2 * cadre.largeur);
  return plie < cadre.largeur ? cadre.x + plie : cadre.x + 2 * cadre.largeur - plie;
}

/** Les temps du tirage animé, en secondes : la pointe court 4 secondes par lot, rien ne clignote. */
export const TEMPS = {
  /** Le départ de la pointe pour chaque lot, dans l'ordre du tirage. */
  depart: [0.6, 6.6, 12.6],
  course: 4,
  /** Après l'arrêt de la pointe : le gagnant monte sur sa marche, puis sa part se referme. */
  montee: 0.5,
  dureeMontee: 1.2,
  fermeture: 0.7,
  dureeFermeture: 1.2,
  /** Après le dernier lot : les parts se rouvrent toutes, pour le bilan. */
  pause: 1,
  dureeRetour: 1.2,
} as const;

/** L'état du tirage animé à l'instant `t`, pour `lots` gagnants (de 0 à 3). */
export interface EtatDuTirage {
  /** Pour chaque lot, dans l'ordre du tirage : l'avancée de la pointe (0 à 1, adoucie), null si elle n'est pas partie. */
  pointes: (number | null)[];
  /** La pointe de ce lot est arrêtée : son billet est tiré. */
  arrives: boolean[];
  /** La pointe se voit-elle encore (0 à 1) ? Elle s'efface quand le gagnant monte. */
  visibles: number[];
  /** La montée de chaque gagnant sur sa marche, de 0 à 1. */
  montees: number[];
  /** La fermeture de la part de chaque gagnant, de 0 à 1 : rouverte à la fin, pour le bilan. */
  fermetures: number[];
  /** Le lot en cours de tirage, ou null avant le premier et après le dernier. */
  enCours: number | null;
  fini: boolean;
}

/** La durée du tirage animé pour `lots` gagnants, en secondes. */
export function dureeDuTirage(lots: number): number {
  if (lots < 1) return 0;
  return TEMPS.depart[Math.min(lots, 3) - 1]! + TEMPS.course + TEMPS.fermeture + TEMPS.dureeFermeture + TEMPS.pause + TEMPS.dureeRetour;
}

export function etatDuTirage(t: number, lots: number): EtatDuTirage {
  const n = Math.max(0, Math.min(3, lots));
  const fin = dureeDuTirage(n);
  const retour = lisse((t - (fin - TEMPS.dureeRetour)) / TEMPS.dureeRetour);
  const etat: EtatDuTirage = { pointes: [], arrives: [], visibles: [], montees: [], fermetures: [], enCours: null, fini: n === 0 || t >= fin };
  for (let k = 0; k < n; k++) {
    const depart = TEMPS.depart[k]!;
    const arret = depart + TEMPS.course;
    etat.pointes.push(t < depart ? null : course((t - depart) / TEMPS.course));
    etat.arrives.push(t >= arret);
    etat.visibles.push(t < depart ? 0 : borne((t - depart) / 0.3) * (1 - borne((t - arret - TEMPS.montee) / 0.4)));
    etat.montees.push(borne((t - arret - TEMPS.montee) / TEMPS.dureeMontee));
    // Le dernier gagnant garde sa part ouverte : plus rien n'est tiré après lui.
    etat.fermetures.push(k < n - 1 ? lisse((t - arret - TEMPS.fermeture) / TEMPS.dureeFermeture) * (1 - retour) : 0);
    if (t >= depart && t < arret + TEMPS.fermeture + TEMPS.dureeFermeture && !etat.fini) etat.enCours = k;
  }
  return etat;
}

const HEURE_DE_PARIS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const JOURS_DE_LA_SEMAINE: Readonly<Record<string, number>> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * Le nombre de jours avant le prochain tirage, à Paris : le lundi à 21 h 30. Zéro le lundi avant le tirage, sept le
 * lundi après. Pour la pastille de l'onglet « La loterie » : le serveur seul tire, ceci ne fait que compter les jours.
 */
export function joursAvantLeTirage(maintenant: Date): number {
  const parts: Record<string, string> = {};
  for (const { type, value } of HEURE_DE_PARIS.formatToParts(maintenant)) parts[type] = value;
  const jour = JOURS_DE_LA_SEMAINE[parts["weekday"] ?? ""] ?? 0;
  const minutes = Number(parts["hour"]) * 60 + Number(parts["minute"]);
  if (jour === 0) return minutes < 21 * 60 + 30 ? 0 : 7;
  return 7 - jour;
}

/** Ce délai en mots, pour la pastille : « ce soir », « demain », « 5 jours ». */
export const motsAvantLeTirage = (jours: number): string => (jours <= 0 ? "ce soir" : jours === 1 ? "demain" : `${jours} jours`);
