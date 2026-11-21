/**
 * Le sentier des Gaulois (16 novembre 2026) : ce que son écran (`src/components/village/Sentier.tsx`) lit et déduit. Des
 * calculs purs : la lecture des réponses du serveur, le palier atteint, ce qui reste avant le suivant, l'état de chaque
 * palier, les cases du calendrier, les mots des missions et des refus. Rien ne décide d'un droit, d'un pas ni d'un tirage :
 * le serveur le fait (`contrat.ts`, « Le sentier des Gaulois » ; migration 20261116001100_sentier_des_gaulois).
 */
import { errorMessage } from "../compte/errors";
import { MISSIONS_DU_SENTIER, type DefiDuClan, type EtalDuJour, type InsigneDuPass, type MissionDuJour, type MissionDuSentier, type MonSentier, type PalierDuSentier, type PalierReponse, type RareteDePalier, type SaisonDuSentier } from "./contrat";
import { manque, messageDuRefus, objetPayant, points, stateres } from "./ecran-boutique";

/** L'ancre de l'onglet dans « Mon Gaulois ». */
export const ANCRE_SENTIER = "sentier";

const RARETES: readonly RareteDePalier[] = ["commun", "peu-commun", "epique", "mystique", "legendaire"];
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const nombre = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;
const rarete = (valeur: unknown): RareteDePalier | null => RARETES.find((r) => r === valeur) ?? null;

function lireSaison(valeur: unknown): SaisonDuSentier | null {
  if (!estObjetJson(valeur)) return null;
  const { id, nom, debut, fin, paliers, pas_par_palier } = valeur;
  if (typeof id !== "string" || typeof nom !== "string" || nom === "" || typeof debut !== "string" || typeof fin !== "string") return null;
  if (!JOUR.test(debut) || !JOUR.test(fin) || !entier(paliers, 1) || !entier(pas_par_palier, 1)) return null;
  // Un serveur d'avant ces deux champs : la saison est en cours.
  const jusquAu = valeur["prendre_jusqu_au"];
  // L'objet de la saison (migration 20261121000300) : seulement s'il est au catalogue, de rareté « saison ».
  const o = valeur["objet"];
  const ref = estObjetJson(o) ? objetPayant(o["emplacement"], o["objet"]) : null;
  const objet = ref && ref.fiche.rarete === "saison" ? { emplacement: ref.emplacement, objet: ref.objet } : null;
  return { id, nom, debut, fin, paliers, pas_par_palier, finie: valeur["finie"] === true, prendre_jusqu_au: typeof jusquAu === "string" && JOUR.test(jusquAu) ? jusquAu : null, objet };
}

function lirePaliers(valeur: unknown): PalierDuSentier[] | null {
  if (!Array.isArray(valeur)) return null;
  const paliers: PalierDuSentier[] = [];
  for (const ligne of valeur) {
    if (!estObjetJson(ligne)) return null;
    const r = rarete(ligne["rarete"]);
    if (!entier(ligne["palier"], 1) || !r) return null;
    // Un objet pris que ce site ne connaît pas (un serveur en avance) reste « pris », sans image.
    const pris = estObjetJson(ligne["pris"]) ? (objetPayant(ligne["pris"]["emplacement"], ligne["pris"]["objet"]) ?? { emplacement: "tete" as const, objet: "" }) : null;
    paliers.push({ palier: ligne["palier"], rarete: r, pris: pris ? { emplacement: pris.emplacement, objet: pris.objet } : null });
  }
  paliers.sort((a, b) => a.palier - b.palier);
  return paliers.every((p, i) => p.palier === i + 1) ? paliers : null;
}

/** Les missions lues ; une mission que ce site ne connaît pas est ignorée, jamais montrée sans ses mots. */
function lireMissions(valeur: unknown): MissionDuJour[] | null {
  if (!Array.isArray(valeur)) return null;
  const missions: MissionDuJour[] = [];
  for (const ligne of valeur) {
    if (!estObjetJson(ligne)) return null;
    const code = MISSIONS_DU_SENTIER.find((m) => m === ligne["code"]);
    if (!code) continue;
    if (!nombre(ligne["fait"]) || !nombre(ligne["cible"]) || ligne["cible"] <= 0 || typeof ligne["gagnee"] !== "boolean") return null;
    missions.push({ code, fait: Math.min(ligne["fait"], ligne["cible"]), cible: ligne["cible"], gagnee: ligne["gagnee"] });
  }
  return missions;
}

/** Les insignes de saison lus ; un insigne illisible est ignoré. Sans eux (serveur d'avant) : aucun. */
function lireInsignes(valeur: unknown): InsigneDuPass[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.flatMap((ligne) =>
    estObjetJson(ligne) && typeof ligne["saison"] === "string" && typeof ligne["nom"] === "string" && typeof ligne["obtenu_le"] === "string" && !Number.isNaN(Date.parse(ligne["obtenu_le"]))
      ? [{ saison: ligne["saison"], nom: ligne["nom"], obtenu_le: ligne["obtenu_le"] }]
      : [],
  );
}

function lireDefi(valeur: unknown): DefiDuClan | null {
  if (!estObjetJson(valeur)) return null;
  const { cible, points: pts, joue, gagne } = valeur;
  if (!entier(cible, 1) || !nombre(pts) || typeof joue !== "boolean" || typeof gagne !== "boolean") return null;
  return { cible, points: pts, joue, gagne };
}

function lireEtal(valeur: unknown): EtalDuJour | null {
  if (!estObjetJson(valeur)) return null;
  const ref = objetPayant(valeur["emplacement"], valeur["objet"]);
  const r = rarete(valeur["rarete"]);
  const { prix, prix_boutique, possede } = valeur;
  if (!ref || !r || !entier(prix, 1) || !entier(prix_boutique, 1) || prix > prix_boutique || typeof possede !== "boolean") return null;
  return { emplacement: ref.emplacement, objet: ref.objet, rarete: r, prix, prix_boutique, possede };
}

/** `get_mon_sentier()` lue ; `null` si la réponse n'a pas la forme du contrat. Un défi ou un étal illisible est seulement caché. */
export function lireMonSentier(reponse: unknown): MonSentier | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const { peut_avancer, solde, jour, releve, regles, pas, visites } = reponse;
  if (typeof peut_avancer !== "boolean" || !entier(solde, 0) || typeof jour !== "string" || !JOUR.test(jour) || !entier(pas, 0) || !entier(visites, 0)) return null;
  if (!estObjetJson(regles)) return null;
  const { mission, visite, semaine, tous_les, defi, remise } = regles;
  if (!entier(mission, 1) || !entier(visite, 1) || !entier(semaine, 1) || !entier(tous_les, 2) || !entier(defi, 1) || !entier(remise, 0) || remise >= 100) return null;
  const saison = reponse["saison"] === null ? null : lireSaison(reponse["saison"]);
  if (reponse["saison"] !== null && !saison) return null;
  const paliers = lirePaliers(reponse["paliers"]);
  const missions = lireMissions(reponse["missions"]);
  if (!paliers || !missions) return null;
  if (saison && paliers.length !== saison.paliers) return null;
  return {
    ok: true,
    peut_avancer,
    solde,
    jour,
    releve: typeof releve === "string" && !Number.isNaN(Date.parse(releve)) ? releve : null,
    regles: { mission, visite, semaine, tous_les, defi, remise },
    saison,
    pas,
    paliers,
    visites,
    missions,
    defi: lireDefi(reponse["defi"]),
    etal: lireEtal(reponse["etal"]),
    insignes: lireInsignes(reponse["insignes"]),
  };
}

/**
 * `prendre_palier()` lue ; `null` si la réponse n'a pas la forme du contrat. La rareté montrée est celle du catalogue : celle
 * d'un palier, ou « saison » pour l'objet du dernier palier (migration 20261121000300), qui vient avec l'insigne de la saison.
 */
export function lirePalierPris(reponse: unknown): PalierReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["palier"], 1) || !estObjetJson(reponse["objet"])) return null;
  const ref = objetPayant(reponse["objet"]["emplacement"], reponse["objet"]["objet"]);
  const r = ref ? (ref.fiche.rarete === "saison" ? "saison" : rarete(ref.fiche.rarete)) : null;
  if (!ref || !r) return null;
  const i = reponse["insigne"];
  const insigne = estObjetJson(i) && typeof i["saison"] === "string" && typeof i["nom"] === "string" ? { saison: i["saison"], nom: i["nom"] } : null;
  return { ok: true, palier: reponse["palier"], objet: { emplacement: ref.emplacement, objet: ref.objet, rarete: r, double: reponse["objet"]["double"] === true }, ...(i === undefined ? {} : { insigne }) };
}

/** Le dernier palier atteint : 0 avant le premier, jamais plus que le nombre de paliers. */
export function palierAtteint(pas: number, saison: Pick<SaisonDuSentier, "paliers" | "pas_par_palier">): number {
  return Math.min(saison.paliers, Math.max(0, Math.floor(pas / saison.pas_par_palier)));
}

/** Ce qui reste avant le palier suivant : son numéro, les pas faits depuis le précédent et ce qu'il en faut. `null` au bout du sentier. */
export function versLeSuivant(pas: number, saison: Pick<SaisonDuSentier, "paliers" | "pas_par_palier">): { palier: number; fait: number; cible: number; reste: number } | null {
  const atteint = palierAtteint(pas, saison);
  if (atteint >= saison.paliers) return null;
  const fait = pas - atteint * saison.pas_par_palier;
  return { palier: atteint + 1, fait, cible: saison.pas_par_palier, reste: saison.pas_par_palier - fait };
}

export type EtatDePalier = "pris" | "a-prendre" | "ferme";

/** L'état d'un palier : pris, atteint et à prendre, ou pas encore atteint. */
export const etatDuPalier = (palier: PalierDuSentier, atteint: number): EtatDePalier => (palier.pris ? "pris" : palier.palier <= atteint ? "a-prendre" : "ferme");

/** Les paliers atteints qui attendent d'être pris. */
export function paliersAPrendre(sentier: Pick<MonSentier, "pas" | "paliers" | "saison">): number {
  if (!sentier.saison) return 0;
  const atteint = palierAtteint(sentier.pas, sentier.saison);
  return sentier.paliers.filter((p) => etatDuPalier(p, atteint) === "a-prendre").length;
}

/**
 * Les cases du calendrier : la rangée de `tousLes` jours de visite en cours. Au septième jour, la rangée est pleine ce
 * jour-là ; le lendemain, une nouvelle rangée commence.
 */
export function casesDuCalendrier(visites: number, tousLes: number): { cochees: number; cases: number } {
  if (visites <= 0) return { cochees: 0, cases: tousLes };
  const reste = visites % tousLes;
  return { cochees: reste === 0 ? tousLes : reste, cases: tousLes };
}

/**
 * La part dorée du rail dans la case d'un palier, de 0 à 100. Chaque case porte sa dalle au milieu : le chemin entre deux
 * paliers tient dans la moitié droite d'une case et la moitié gauche de la suivante. Avant le premier palier, le chemin
 * tient dans la moitié gauche de la première case. `fait` sur `cible` : les pas faits vers le palier suivant.
 */
export function remplissageDuRail(palier: number, atteint: number, fait: number, cible: number): number {
  if (palier < atteint) return 100;
  const f = cible > 0 && Number.isFinite(fait) ? Math.min(Math.max(fait / cible, 0), 1) : 0;
  if (palier === atteint) return Math.round((50 + Math.min(f, 0.5) * 100) * 10) / 10;
  if (palier === atteint + 1) return Math.round((atteint === 0 ? f * 50 : Math.max(0, f - 0.5) * 100) * 10) / 10;
  return 0;
}

/** Les paliers montrés tant que la piste est repliée : une rangée de dix. */
export const PALIERS_PAR_RANGEE = 10;

/**
 * La rangée de paliers que la piste repliée montre : celle du premier objet à prendre, sinon celle du palier suivant.
 * `ailleurs` : les objets à prendre dans les autres rangées, que la piste repliée cacherait ; l'écran s'ouvre alors en entier.
 */
export function rangeeMontree(paliers: readonly PalierDuSentier[], atteint: number): { debut: number; fin: number; ailleurs: number } {
  const total = paliers.length;
  if (total === 0) return { debut: 1, fin: 0, ailleurs: 0 };
  const aPrendre = paliers.filter((p) => etatDuPalier(p, atteint) === "a-prendre");
  const repere = aPrendre[0]?.palier ?? Math.min(atteint + 1, total);
  const debut = Math.floor((repere - 1) / PALIERS_PAR_RANGEE) * PALIERS_PAR_RANGEE + 1;
  const fin = Math.min(total, debut + PALIERS_PAR_RANGEE - 1);
  return { debut, fin, ailleurs: aPrendre.filter((p) => p.palier < debut || p.palier > fin).length };
}

/** Les jours de la saison, et le rang d'aujourd'hui (1 pour le premier) ; `null` hors de la saison ou pour des dates illisibles. */
export function joursDeLaSaison(saison: Pick<SaisonDuSentier, "debut" | "fin">, jour: string): { total: number; rang: number } | null {
  const debut = Date.parse(`${saison.debut}T00:00:00Z`);
  const total = Math.round((Date.parse(`${saison.fin}T00:00:00Z`) - debut) / 86_400_000) + 1;
  const rang = Math.round((Date.parse(`${jour}T00:00:00Z`) - debut) / 86_400_000) + 1;
  return Number.isFinite(total) && Number.isFinite(rang) && total >= 1 && rang >= 1 && rang <= total ? { total, rang } : null;
}

/** Les jours de visite qu'il reste avant le cadeau de la rangée du calendrier ; 0 le jour où elle est pleine. */
export function avantLeCadeau(visites: number, tousLes: number): number {
  const { cochees, cases } = casesDuCalendrier(visites, tousLes);
  return cases - cochees;
}

/** La part faite, de 0 à 100, pour une barre. */
export const part = (fait: number, cible: number): number => (cible > 0 ? Math.round(Math.min(Math.max(fait / cible, 0), 1) * 100) : 0);

/** Les mots de chaque mission. « Points rapportés au clan », jamais « victoires ». */
export const NOMS_DES_MISSIONS: Readonly<Record<MissionDuSentier, string>> = {
  partie: "Jouer une partie avec le tag du clan",
  parties_3: "Jouer trois parties avec le tag du clan",
  victoire: "Rapporter des points au clan dans une partie",
  points_3: "Rapporter 3 points au clan dans la journée",
  equipe: "Rapporter des points au clan à trois Gaulois ou plus",
  vocal: "Passer dans un salon vocal du Discord du clan",
  pochette: "Ouvrir un booster",
};

/** Où en est une mission, en mots : « 1 sur 3 », « 1,78 sur 3 ». Rien pour une mission d'un seul coup. */
export function avancee(mission: Pick<MissionDuJour, "fait" | "cible">): string | null {
  return mission.cible > 1 ? `${points(mission.fait)} sur ${points(mission.cible)}` : null;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

/** Un jour du serveur (« 2026-12-31 ») en mots : « 31 décembre ». Le premier du mois : « 1er ». */
export function jourEnMots(jour: string): string {
  const [, mois = "", j = ""] = jour.split("-");
  const n = Number(j);
  return `${n === 1 ? "1er" : n} ${MOIS[Number(mois) - 1] ?? ""}`.trim();
}

/** Les jours qu'il reste dans la saison, aujourd'hui compris. */
export function joursRestants(jour: string, fin: string): number {
  const ecart = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${jour}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(ecart) ? Math.max(0, ecart) + 1 : 0;
}

/**
 * Les pas, tels que l'écran les écrit : « 65 XP ». Le mot « pas » se lisait comme celui de « ne… pas » (remarque du pilote,
 * 16 novembre 2026) : l'écran dit « XP », le mot des passes de combat ; le serveur et le code gardent « pas ».
 */
export const motPas = (n: number): string => `${n} XP`;

/**
 * La part faite du défi du clan, telle que l'écran l'écrit : un entier de 0 à 100, arrondi vers le bas, et jamais 100 avant
 * que le défi soit rempli (84,7 sur 85 s'écrit « 99 % »).
 */
export function partDuDefi(points: number, cible: number): number {
  if (!(cible > 0) || !Number.isFinite(points)) return 0;
  return points >= cible ? 100 : Math.min(99, Math.max(0, Math.floor((points / cible) * 100)));
}

/** Le sentier après un palier pris : l'objet reçu à sa place. */
export function apresLePalier(sentier: MonSentier, reponse: PalierReponse): MonSentier {
  return { ...sentier, paliers: sentier.paliers.map((p) => (p.palier === reponse.palier ? { ...p, pris: { emplacement: reponse.objet.emplacement, objet: reponse.objet.objet } } : p)) };
}

/** Le sentier après un achat à l'étal : le solde que le serveur a répondu, l'objet possédé. */
export function apresLEtal(sentier: MonSentier, solde: number): MonSentier {
  return { ...sentier, solde, etal: sentier.etal ? { ...sentier.etal, possede: true } : null };
}

/** Pourquoi ce compte n'achète pas à l'étal ; `null` s'il le peut. */
export function raisonEtalFerme(sentier: Pick<MonSentier, "peut_avancer" | "solde">, etal: Pick<EtalDuJour, "prix" | "possede">): string | null {
  if (etal.possede) return "Vous avez déjà cet objet.";
  if (!sentier.peut_avancer) return messageDuRefus("not_validated");
  const ilManque = manque(sentier.solde, etal.prix);
  return ilManque > 0 ? `Il vous manque ${stateres(ilManque)}.` : null;
}

/** Les mots d'un refus du sentier. `manque` : les statères qui manquent, quand l'écran le sait. */
export function messageDuRefusDuSentier(code: string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant" || code === "deja_possede") return messageDuRefus(code, contexte);
  if (code === "not_validated") return "Le pass s'ouvre quand un officier a validé votre compte.";
  if (code === "no_gaulois") return "Créez d'abord votre Gaulois : le pass s'ouvre ensuite.";
  if (code === "mode_god") return "Le mode GOD est allumé : un palier ne se prend pas pendant l'essai, son objet repartirait avec lui.";
  return errorMessage(code);
}
