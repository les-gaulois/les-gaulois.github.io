/**
 * Ce que les écrans des bannières déduisent de ce qu'ils ont reçu (15 novembre 2026) : la section « Les bannières » de
 * « La boutique » et le choix de la bannière de /gaulois dans « Mon Gaulois » (`src/components/village/Bannieres.tsx`).
 * Des calculs purs et légers : ce fichier ne charge ni la liste ni les dessins des bannières (`bannieres.ts`, lourd, que
 * les écrans ne chargent qu'à leur affichage). Rien ne décide d'un droit ni d'un prix : le serveur le fait (`contrat.ts`,
 * « Les bannières du Gaulois »).
 */
import { errorMessage } from "../compte/errors";
import type { AchatBanniereReponse, MesBannieres } from "./contrat";
import { manque, messageDuRefus, stateres } from "./ecran-boutique";

/** L'ancre de la section des bannières dans « La boutique » : « Mon Gaulois » y mène. */
export const ANCRE_BANNIERES = "bannieres";

/** L'adresse demande-t-elle les bannières (`/village#bannieres`, qui ouvre l'onglet « La boutique ») ? */
export const demandeLesBannieres = (hash: string): boolean => hash === `#${ANCRE_BANNIERES}`;

/**
 * La réponse de `get_mes_bannieres` dit-elle, sans rien d'autre à lire, que le compte n'a aucune bannière ? « Mon
 * Gaulois » n'a alors pas à charger les dessins : il montre la ligne qui mène à la boutique. Une réponse illisible rend
 * faux : elle se lit ensuite avec toute la prudence de `lireMesBannieres`.
 */
export function sansBanniere(reponse: unknown): boolean {
  if (reponse === null || typeof reponse !== "object") return false;
  const { ok, bannieres } = reponse as { ok?: unknown; bannieres?: unknown };
  return ok === true && Array.isArray(bannieres) && bannieres.length === 0;
}

/** Les identifiants des bannières du compte. */
export const idsDesBannieres = (mes: Pick<MesBannieres, "bannieres"> | null): ReadonlySet<string> => new Set((mes?.bannieres ?? []).map((ligne) => ligne.banniere));

/** Les bannières du compte après un achat : la nouvelle en tête (les plus récentes d'abord), le solde du serveur. */
export function apresLAchat(mes: MesBannieres, achat: AchatBanniereReponse, maintenant: string): MesBannieres {
  const deja = mes.bannieres.some((ligne) => ligne.banniere === achat.banniere.banniere);
  return { ...mes, solde: achat.solde, bannieres: deja ? mes.bannieres : [{ banniere: achat.banniere.banniere, acquis_le: maintenant }, ...mes.bannieres] };
}

/**
 * La bannière que la vitrine montre à l'ouverture : celle que le compte montre sur /gaulois ; sinon la dernière qu'il a
 * achetée ; sinon la première de la liste. `null` pour une liste vide.
 */
export function banniereDOuverture(mes: Pick<MesBannieres, "bannieres" | "porte"> | null, ids: readonly string[]): string | null {
  const voulue = mes?.porte ?? mes?.bannieres[0]?.banniere;
  return voulue && ids.includes(voulue) ? voulue : (ids[0] ?? null);
}

/**
 * Ce qui empêche d'acheter une bannière à ce prix, d'après ce que le serveur a dit du compte : `null` si rien. Le serveur
 * vérifie de toute façon.
 */
export function raisonDeLaBanniere(mes: Pick<MesBannieres, "peut_acheter">, solde: number, prix: number): string | null {
  if (!mes.peut_acheter) return messageDuRefus("not_validated");
  const reste = manque(solde, prix);
  return reste > 0 ? `Il vous manque ${stateres(reste)}.` : null;
}

/**
 * Pourquoi ce compte ne peut pas ouvrir la pochette des bannières, dans l'ordre où le serveur refuserait ; `null` s'il le
 * peut. `toutPossede` : il a déjà tous les trésors (calcul de `bannieres.ts`). Le serveur vérifie de toute façon.
 */
export function raisonDeLaPochetteDesBannieres(mes: Pick<MesBannieres, "peut_acheter">, solde: number, prix: number, toutPossede: boolean): string | null {
  if (!mes.peut_acheter) return messageDuRefus("not_validated");
  if (toutPossede) return "Vous avez tous les trésors de la pochette.";
  const reste = manque(solde, prix);
  return reste > 0 ? `Il vous manque ${stateres(reste)}.` : null;
}

/**
 * Les mots d'un refus d'achat. `manque` : ce qui manque d'après le solde relu au serveur, quand il a répondu. Les refus
 * propres aux bannières sont passés par `messageDesBannieres` avant d'arriver ici (`mots`).
 */
export function messageDuRefusDAchat(code: string, mots: (code: string) => string, contexte: { manque?: number | null } = {}): string {
  if (code === "solde_insuffisant") return contexte.manque ? `Il vous manque ${stateres(contexte.manque)}.` : errorMessage(code);
  if (code === "not_validated" || code === "no_gaulois") return messageDuRefus(code);
  return mots(code);
}

/** La toile d'une bannière, en cases : celle des décors de /gaulois (un test la compare aux dessins). */
export const BANNIERE_LARGEUR = 124;
export const BANNIERE_HAUTEUR = 80;

/** « 3 sur 40 ». */
export const surCombien = (nombre: number, total: number): string => `${nombre} sur ${total}`;
