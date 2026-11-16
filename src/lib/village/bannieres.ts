/**
 * Les bannières du Gaulois côté site (contrat : `contrat.ts`, « Les bannières du Gaulois » ; serveur : migrations
 * 20261115000900_bannieres_du_gaulois et 20261116000100_pochette_des_bannieres ; dessins :
 * `supabase/functions/code-discord/bannieres/`). Des calculs purs, sans
 * rien de Node : la lecture prudente des réponses du serveur, le rangement des bannières à l'écran et la scène d'aperçu
 * (le Gaulois du membre devant une bannière, comme sur /gaulois). Le serveur décide de tout : le prix, le solde, l'achat,
 * la bannière montrée.
 */
import {
  BANNIERES,
  FAMILLE_DE_LA_POCHETTE,
  FAMILLES_DES_BANNIERES,
  RARETES_DES_BANNIERES,
  banniereParId,
  dessinDeLaBanniere,
  estDeLaPochette,
  type Banniere,
  type FamilleDeBanniere,
} from "../../../supabase/functions/code-discord/bannieres/index";
import { familierAPoser, type Familier } from "../../../supabase/functions/code-discord/familiers/familier";
import { casesDeLaScene, DECOR_HAUTEUR, DECOR_LARGEUR } from "../../../supabase/functions/code-discord/gaulois";
import { errorMessage } from "../compte/errors";
import { ORDRE_RARETES, RARETES, type Rarete, type Tenue } from "../gaulois";
import type { Album, ElementDeLAlbum } from "./album-pochette";
import type { AchatBanniereReponse, BannierePossedee, ChoixBanniereReponse, MesBannieres, PochetteBannieresReponse } from "./contrat";
import { bandeDuTambour, rangeeAuHasard, type Bande } from "./tambour";

export { BANNIERES, FAMILLE_DE_LA_POCHETTE, FAMILLES_DES_BANNIERES, RARETES_DES_BANNIERES, banniereParId, dessinDeLaBanniere, estDeLaPochette, type Banniere, type FamilleDeBanniere };

/** Les trésors de la pochette des bannières : ceux qui ne s'achètent pas, dans l'ordre du catalogue. */
export const TRESORS: readonly Banniere[] = BANNIERES.filter(estDeLaPochette);

/** Les familles, dans l'ordre de la boutique. */
export const FAMILLES = Object.keys(FAMILLES_DES_BANNIERES) as FamilleDeBanniere[];

const estObjetJson = (valeur: unknown): valeur is Record<string, unknown> => valeur !== null && typeof valeur === "object" && !Array.isArray(valeur);
const entier = (valeur: unknown, min: number): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= min;
const estRarete = (valeur: unknown): valeur is Rarete => typeof valeur === "string" && (ORDRE_RARETES as readonly string[]).includes(valeur);

/**
 * Le texte d'un refus des bannières : `deja_possede`, `pas_possede` et `tout_possede` (la pochette des bannières) ont leurs
 * mots ici, les autres ceux de tout le site.
 */
export function messageDesBannieres(code: string): string {
  if (code === "deja_possede") return "Vous avez déjà cette bannière.";
  if (code === "pas_possede") return "Vous n'avez pas cette bannière.";
  if (code === "tout_possede") return "Vous avez déjà tous les trésors de la pochette : elle n'a plus rien à vous donner.";
  return errorMessage(code);
}

/** Les chances d'une pochette : un nombre de 0 à 100 pour chaque rareté, 100 en tout ; sinon `null`. */
function lireChances(valeur: unknown): Record<Rarete, number> | null {
  if (!estObjetJson(valeur)) return null;
  const chances: Partial<Record<Rarete, number>> = {};
  let total = 0;
  for (const rarete of ORDRE_RARETES) {
    const c = valeur[rarete];
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 100) return null;
    chances[rarete] = c;
    total += c;
  }
  return Math.abs(total - 100) < 1e-6 ? (chances as Record<Rarete, number>) : null;
}

/** Un pourcentage entier, de 1 à 100. */
const estPalier = (valeur: unknown): valeur is number => entier(valeur, 1) && valeur <= 100;

/**
 * La pochette des bannières de `get_mes_bannieres` : un prix entier d'au moins 1 statère et des chances lisibles ; sinon
 * `null`. Les remboursements (leur part, de 0 à 95 pour cent, et leurs paliers) se lisent ensemble : absents (serveur
 * d'avant eux) ou illisibles, la pochette se lit sans remboursement, 0 et aucun palier.
 */
function lirePochette(valeur: unknown): MesBannieres["pochette"] {
  if (!estObjetJson(valeur) || !entier(valeur["prix"], 1)) return null;
  const chances = lireChances(valeur["chances"]);
  if (!chances) return null;
  const part = valeur["remboursement"];
  const paliers = valeur["paliers"];
  const rembourse = typeof part === "number" && part > 0 && part <= 95 && Array.isArray(paliers) && paliers.length > 0 && paliers.every(estPalier);
  return { prix: valeur["prix"], chances, remboursement: rembourse ? part : 0, paliers: rembourse ? [...(paliers as number[])] : [] };
}

/** Les prix : un entier d'au moins 1 statère pour chaque rareté ; sinon `null`. */
function lirePrix(valeur: unknown): Record<Rarete, number> | null {
  if (!estObjetJson(valeur)) return null;
  const prix: Partial<Record<Rarete, number>> = {};
  for (const rarete of ORDRE_RARETES) {
    const p = valeur[rarete];
    if (!entier(p, 1)) return null;
    prix[rarete] = p;
  }
  return prix as Record<Rarete, number>;
}

/**
 * La réponse de `get_mes_bannieres`, vérifiée : `null` si le solde, `peut_acheter` ou les prix sont illisibles. Une
 * bannière inconnue de ce dessin, déjà lue ou mal datée est écartée ; `porte` qui n'est pas une bannière possédée et
 * connue se lit `null` (le décor du lieu). Une pochette absente (serveur d'avant elle) ou illisible se lit `null` : la
 * boutique reste, sans la pochette.
 */
export function lireMesBannieres(reponse: unknown, liste: readonly Banniere[] = BANNIERES): MesBannieres | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true) return null;
  const solde = reponse["solde"];
  const peutAcheter = reponse["peut_acheter"];
  const prix = lirePrix(reponse["prix"]);
  const lignes = reponse["bannieres"];
  if (!entier(solde, 0) || typeof peutAcheter !== "boolean" || !prix || !Array.isArray(lignes)) return null;
  const connues = new Set(liste.map((b) => b.id));
  const bannieres: BannierePossedee[] = [];
  const vues = new Set<string>();
  for (const ligne of lignes) {
    if (!estObjetJson(ligne)) continue;
    const { banniere, acquis_le } = ligne;
    if (typeof banniere !== "string" || !connues.has(banniere) || vues.has(banniere)) continue;
    if (typeof acquis_le !== "string" || !Number.isFinite(Date.parse(acquis_le))) continue;
    vues.add(banniere);
    bannieres.push({ banniere, acquis_le });
  }
  const porte = reponse["porte"];
  return { ok: true, solde, peut_acheter: peutAcheter, prix, pochette: lirePochette(reponse["pochette"]), bannieres, porte: typeof porte === "string" && vues.has(porte) ? porte : null };
}

/**
 * La réponse de `ouvrir_pochette_bannieres`, vérifiée : un solde et un reste entiers, et soit un trésor de la pochette
 * connu, avec la rareté que la liste lui donne, soit un remboursement (un pourcentage et des statères rendus entiers) ;
 * jamais les deux, jamais aucun ; sinon `null`.
 */
export function lirePochetteBannieres(reponse: unknown, liste: readonly Banniere[] = BANNIERES): PochetteBannieresReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0) || !entier(reponse["reste"], 0)) return null;
  const recue = reponse["banniere"] ?? null;
  const rendu = reponse["remboursement"] ?? null;
  if (recue === null) {
    if (!estObjetJson(rendu) || !estPalier(rendu["pourcent"]) || !entier(rendu["rendu"], 1)) return null;
    return { ok: true, solde: reponse["solde"], banniere: null, remboursement: { pourcent: rendu["pourcent"], rendu: rendu["rendu"] }, reste: reponse["reste"] };
  }
  if (rendu !== null || !estObjetJson(recue) || typeof recue["banniere"] !== "string" || !estRarete(recue["rarete"])) return null;
  const banniere = liste.find((b) => b.id === recue["banniere"]);
  if (!banniere || !estDeLaPochette(banniere) || banniere.rarete !== recue["rarete"]) return null;
  return { ok: true, solde: reponse["solde"], banniere: { banniere: banniere.id, rarete: banniere.rarete }, remboursement: null, reste: reponse["reste"] };
}

/** La réponse de `acheter_banniere`, vérifiée : une bannière connue, avec la rareté que la liste lui donne ; sinon `null`. */
export function lireAchatBanniere(reponse: unknown, liste: readonly Banniere[] = BANNIERES): AchatBanniereReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !entier(reponse["solde"], 0)) return null;
  const recue = reponse["banniere"];
  if (!estObjetJson(recue) || typeof recue["banniere"] !== "string" || !estRarete(recue["rarete"])) return null;
  const banniere = liste.find((b) => b.id === recue["banniere"]);
  if (!banniere || banniere.rarete !== recue["rarete"]) return null;
  return { ok: true, solde: reponse["solde"], banniere: { banniere: banniere.id, rarete: banniere.rarete } };
}

/** La réponse de `choisir_banniere`, vérifiée : une bannière connue, ou `null` (le décor du lieu) ; sinon `null` pour toute la réponse. */
export function lireChoixBanniere(reponse: unknown, liste: readonly Banniere[] = BANNIERES): ChoixBanniereReponse | null {
  if (!estObjetJson(reponse) || reponse["ok"] !== true || !("porte" in reponse)) return null;
  const porte = reponse["porte"];
  if (porte === null) return { ok: true, porte: null };
  return typeof porte === "string" && liste.some((b) => b.id === porte) ? { ok: true, porte } : null;
}

/**
 * Ce qu'une bannière est pour ce compte : à acheter à la boutique, à gagner dans la pochette (un trésor qu'il n'a pas), à
 * lui, ou montrée sur /gaulois.
 */
export type EtatDeLaBanniere = "a-acheter" | "a-gagner" | "a-moi" | "montree";

export function etatDeLaBanniere(id: string, mes: Pick<MesBannieres, "bannieres" | "porte"> | null, liste: readonly Banniere[] = BANNIERES): EtatDeLaBanniere {
  if (mes?.porte === id) return "montree";
  if (mes?.bannieres.some((b) => b.banniere === id)) return "a-moi";
  const banniere = liste.find((b) => b.id === id);
  return banniere && estDeLaPochette(banniere) ? "a-gagner" : "a-acheter";
}

/** Les trésors de la pochette que le compte n'a pas encore. */
export function tresorsAGagner(possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): Banniere[] {
  return liste.filter((b) => estDeLaPochette(b) && !possedees.has(b.id));
}

/** Combien de trésors de chaque rareté, parmi `liste`. */
function tresorsParRarete(liste: readonly Banniere[]): Record<Rarete, number> {
  const compte = Object.fromEntries(ORDRE_RARETES.map((r) => [r, 0])) as Record<Rarete, number>;
  for (const b of liste) if (estDeLaPochette(b)) compte[b.rarete]++;
  return compte;
}

/**
 * Les chances d'un trésor de chaque rareté à chaque pochette, en pour cent : celles du serveur, qui font 100 dans la part
 * des pochettes qui donnent un trésor, ramenées à cette part (60, 30 et 10 deviennent 36, 18 et 6 quand 40 pochettes sur
 * 100 remboursent). Sans remboursement, les mêmes.
 */
export function chancesDUnTresor(pochette: Pick<NonNullable<MesBannieres["pochette"]>, "chances" | "remboursement">): Record<Rarete, number> {
  return Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, (pochette.chances[rarete] * (100 - pochette.remboursement)) / 100])) as Record<Rarete, number>;
}

/** Les statères que rend chaque palier d'un remboursement, pour ce prix, comme le serveur les arrondit. */
export function rendusDesPaliers(prix: number, paliers: readonly number[]): number[] {
  return paliers.map((palier) => Math.round((prix * palier) / 100));
}

/**
 * Ce que vaut en moyenne une pochette pour un compte qui n'a aucun trésor, en statères : chaque trésor compté au prix
 * d'une bannière de sa rareté à la boutique, chaque remboursement pour ce qu'il rend. Un calcul, pour juger le prix de la
 * pochette ; aucun écran ne le montre.
 */
export function valeurMoyenneDeLaPochetteDesBannieres(prix: number, chances: Readonly<Record<Rarete, number>>, remboursement: number, paliers: readonly number[], prixParRarete: Readonly<Record<Rarete, number>>): number {
  const tresor = ORDRE_RARETES.reduce((somme, rarete) => somme + (chances[rarete] / 100) * prixParRarete[rarete], 0);
  const rendus = rendusDesPaliers(prix, paliers);
  const rendu = rendus.length > 0 ? rendus.reduce((somme, r) => somme + r, 0) / rendus.length : 0;
  return ((100 - remboursement) / 100) * tresor + (remboursement / 100) * rendu;
}

/**
 * Les chances réelles de la pochette des bannières pour ce compte, en pour cent, par rareté : celles données, sauf
 * qu'une rareté où il a déjà tous les trésors tombe à 0. Les autres gardent leur chance de départ : depuis le 16 novembre
 * 2026 (migration 20261116001400), les chances d'une rareté terminée vont aux statères rendus, jamais aux autres raretés
 * (`chanceDesStateresRendus`). `null` s'il n'y a plus rien à recevoir (ou plus aucune chance).
 */
export function chancesDesTresorsPourMoi(chances: Readonly<Record<Rarete, number>>, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): Record<Rarete, number> | null {
  const restants = tresorsParRarete(tresorsAGagner(possedees, liste));
  const effectives = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, restants[rarete] > 0 ? chances[rarete] : 0])) as Record<Rarete, number>;
  return ORDRE_RARETES.some((rarete) => effectives[rarete] > 0) ? effectives : null;
}

/**
 * La chance, en pour cent, que la prochaine pochette de ce compte rende des statères : la part des remboursements du
 * serveur, plus les chances des raretés où il a déjà tous les trésors. Avec les chances de `chancesDesTresorsPourMoi`
 * (sur `chancesDUnTresor`), elle fait cent. `null` s'il n'y a plus rien à recevoir.
 */
export function chanceDesStateresRendus(pochette: Pick<NonNullable<MesBannieres["pochette"]>, "chances" | "remboursement">, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): number | null {
  const pourMoi = chancesDesTresorsPourMoi(chancesDUnTresor(pochette), possedees, liste);
  return pourMoi ? 100 - ORDRE_RARETES.reduce((somme, rarete) => somme + pourMoi[rarete], 0) : null;
}

/** La chance, en pour cent, que la prochaine pochette donne ce trésor à ce compte : 0 s'il l'a déjà, ou si ce n'en est pas un. */
export function chanceDuTresor(id: string, chances: Readonly<Record<Rarete, number>>, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): number {
  const banniere = liste.find((b) => b.id === id);
  if (!banniere || !estDeLaPochette(banniere) || possedees.has(id)) return 0;
  const effectives = chancesDesTresorsPourMoi(chances, possedees, liste);
  const restants = tresorsParRarete(tresorsAGagner(possedees, liste))[banniere.rarete];
  return effectives && restants > 0 ? effectives[banniere.rarete] / restants : 0;
}

/** Une ligne des chances de la pochette des bannières : une rareté qui a des trésors, sa chance pour ce compte, ce qu'il en reste. */
export interface LigneDeChanceDesTresors {
  rarete: Rarete;
  chance: number;
  reste: number;
  total: number;
}

/**
 * Les chances de la pochette des bannières pour ce compte, une ligne par rareté qui a des trésors, de la plus courante à
 * la plus rare ; `null` s'il les a tous.
 */
export function lignesDesChancesDesTresors(chances: Readonly<Record<Rarete, number>>, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): LigneDeChanceDesTresors[] | null {
  const pourMoi = chancesDesTresorsPourMoi(chances, possedees, liste);
  if (!pourMoi) return null;
  const totaux = tresorsParRarete(liste);
  const restants = tresorsParRarete(tresorsAGagner(possedees, liste));
  return ORDRE_RARETES.filter((rarete) => totaux[rarete] > 0).map((rarete) => ({ rarete, chance: pourMoi[rarete], reste: restants[rarete], total: totaux[rarete] }));
}

/**
 * La bande du tambour de la pochette des bannières, pour un compte : seulement les trésors qu'il n'avait pas avant
 * d'ouvrir (la pochette ne donne jamais une bannière déjà reçue), aux chances qu'elle avait pour lui ; le trésor reçu au
 * bout. Le tambour ne fait que montrer ce que le serveur a déjà tiré.
 */
export function bandeDesTresors(recue: Banniere, chances: Readonly<Record<Rarete, number>>, possedees: ReadonlySet<string>, hasard: () => number = Math.random, liste: readonly Banniere[] = BANNIERES): Bande<Banniere> {
  const restants = tresorsAGagner(possedees, liste);
  const parRarete = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, restants.filter((b) => b.rarete === rarete)])) as Partial<Record<string, Banniere[]>>;
  const pourMoi = chancesDesTresorsPourMoi(chances, possedees, liste) ?? chances;
  return bandeDuTambour({ valeur: recue, rarete: recue.rarete }, () => rangeeAuHasard(pourMoi, (rarete) => parRarete[rarete] ?? [], hasard));
}

/**
 * Les bannières du compte après une pochette ouverte : le nouveau solde, et le trésor reçu en tête (les plus récentes
 * d'abord). Après un remboursement, seul le solde change.
 */
export function apresLaPochetteDesBannieres(mes: MesBannieres, reponse: PochetteBannieresReponse, quand: string): MesBannieres {
  if (!reponse.banniere) return { ...mes, solde: reponse.solde };
  const recue = reponse.banniere.banniere;
  return { ...mes, solde: reponse.solde, bannieres: [{ banniere: recue, acquis_le: quand }, ...mes.bannieres.filter((ligne) => ligne.banniere !== recue)] };
}

/** Le filtre de la boutique : une famille, une rareté, ou tout (`null`). */
export interface FiltreDesBannieres {
  famille: FamilleDeBanniere | null;
  rarete: Rarete | null;
}

/** Une famille rangée : ses bannières pour le filtre, de la plus courante à la plus rare, et combien le compte en a. */
export interface FamilleRangee {
  famille: FamilleDeBanniere;
  nom: string;
  bannieres: Banniere[];
  possedees: number;
  total: number;
}

/**
 * Les bannières rangées par famille, dans l'ordre de la boutique, réduites au filtre. Une famille sans bannière pour ce
 * filtre n'est pas rendue. `possedees` et `total` comptent toute la famille, sans filtre.
 */
export function rangerLesBannieres(filtre: FiltreDesBannieres, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): FamilleRangee[] {
  const rang = (r: Rarete) => ORDRE_RARETES.indexOf(r);
  return FAMILLES.flatMap((famille) => {
    if (filtre.famille && filtre.famille !== famille) return [];
    const toutes = liste.filter((b) => b.famille === famille);
    const bannieres = toutes.filter((b) => !filtre.rarete || b.rarete === filtre.rarete).sort((a, b) => rang(a.rarete) - rang(b.rarete));
    if (bannieres.length === 0) return [];
    return [{ famille, nom: FAMILLES_DES_BANNIERES[famille], bannieres, possedees: toutes.filter((b) => possedees.has(b.id)).length, total: toutes.length }];
  });
}

/** Combien de bannières de chaque rareté (pour le filtre), dans la famille choisie s'il y en a une. */
export function comptesParRarete(famille: FamilleDeBanniere | null, liste: readonly Banniere[] = BANNIERES): Record<Rarete, number> {
  const compte = Object.fromEntries(ORDRE_RARETES.map((r) => [r, 0])) as Record<Rarete, number>;
  for (const b of liste) if (!famille || b.famille === famille) compte[b.rarete]++;
  return compte;
}

/** Ce qui manque pour acheter : 0 si le solde suffit. */
export const manquePour = (solde: number, prix: number): number => Math.max(0, prix - solde);

/** Une scène d'aperçu : 124 × 80 cases, rangée par rangée, et ses dimensions. */
export interface SceneDApercu {
  largeur: number;
  hauteur: number;
  cases: string[];
}

/**
 * L'aperçu du site : le Gaulois du membre (et son familier) devant une bannière, cadre compris, comme sur /gaulois, sans
 * le logo ni les insignes ; `null` pour une bannière inconnue.
 */
export function sceneDeLaBanniere(id: string, tenue: Tenue, familier: Familier | null = null): SceneDApercu | null {
  const fond = dessinDeLaBanniere(id);
  if (!fond) return null;
  return { largeur: DECOR_LARGEUR, hauteur: DECOR_HAUTEUR, cases: casesDeLaScene(tenue, fond, familier ? familierAPoser(familier) : null) };
}

/** La bannière seule, cadre compris, sans Gaulois : pour une vignette ; `null` pour une bannière inconnue. */
export function vignetteDeLaBanniere(id: string): SceneDApercu | null {
  const fond = dessinDeLaBanniere(id);
  return fond ? { largeur: DECOR_LARGEUR, hauteur: DECOR_HAUTEUR, cases: [...fond.cases] } : null;
}

/**
 * L'album de la pochette des bannières (16 novembre 2026, `AlbumPochette.tsx`) : ses trésors, rangés de la rareté la plus
 * courante à la plus rare, en couleur comme dans l'onglet « Bannière », avec leur chance dans la prochaine pochette de ce
 * compte (`chanceDuTresor` : 0 pour un trésor déjà reçu, la pochette ne le redonne jamais). Les puces sont les raretés.
 */
export function albumDesTresors(chances: Readonly<Record<Rarete, number>>, possedees: ReadonlySet<string>, liste: readonly Banniere[] = BANNIERES): Album {
  const tresors = liste.filter(estDeLaPochette);
  const elements = ORDRE_RARETES.flatMap((rarete) =>
    tresors
      .filter((b) => b.rarete === rarete)
      .map(
        (b): ElementDeLAlbum => ({
          id: b.id,
          nom: b.nom,
          rarete,
          groupe: RARETES[rarete].nom,
          detail: FAMILLES_DES_BANNIERES[FAMILLE_DE_LA_POCHETTE],
          dessin: vignetteDeLaBanniere(b.id),
          silhouette: false,
          possede: possedees.has(b.id),
          montre: false,
          chance: chanceDuTresor(b.id, chances, possedees, liste),
        }),
      ),
  );
  return { titre: "Dans la pochette des bannières", sous: `${elements.filter((e) => e.possede).length} sur ${elements.length} à vous`, libelleDesGroupes: "Montrer une rareté", elements };
}
