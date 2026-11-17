import type { RefObjet } from "./contrat";

/**
 * La pastille « Nouveau » du vestiaire (17 novembre 2026, choix du pilote parmi cinq idées) : un objet arrivé dans
 * l'inventaire depuis la dernière visite la porte jusqu'à ce qu'on l'essaie. Le serveur n'en sait rien : la liste des
 * objets déjà vus est gardée sur l'appareil (`localStorage`), une par compte. Sur un autre appareil, ou après un ménage du
 * navigateur, la première visite ne marque donc rien : mieux vaut aucune pastille qu'une pastille sur tout l'inventaire.
 *
 * De l'habillage : rien ici ne décide d'un droit, et une panne du stockage ne montre simplement aucune pastille.
 */

/** La clé du stockage, pour le compte de ce numéro. */
export const cleDesObjetsVus = (compte: number): string => `gal:village-objets-vus:${compte}`;

/** Un objet de l'inventaire, en une clé : « tete/casque-aile ». */
export const cleDeLObjet = (ref: RefObjet): string => `${ref.emplacement}/${ref.objet}`;

/**
 * Au-delà, ce n'est pas une arrivée d'objets mais un inventaire entier qui change d'un coup (l'essai du mode GOD, qui
 * prête tout le catalogue) : rien n'est marqué, et tout est tenu pour vu. À la fin de l'essai, les objets prêtés quittent
 * la liste avec l'inventaire ; les pastilles reprennent au prochain objet reçu.
 */
export const TROP_DE_NOUVEAUX = 12;

/** La liste gardée, relue ; `null` si rien n'a encore été gardé ou si ce qui est gardé est illisible. */
export function lireLesVus(brut: string | null): Set<string> | null {
  if (brut === null) return null;
  try {
    const liste: unknown = JSON.parse(brut);
    if (!Array.isArray(liste) || !liste.every((cle): cle is string => typeof cle === "string")) return null;
    return new Set(liste);
  } catch {
    return null;
  }
}

/** La liste à garder, en texte : triée, pour qu'elle ne change pas sans raison. */
export const ecrireLesVus = (vus: ReadonlySet<string>): string => JSON.stringify([...vus].sort());

export interface Point {
  /** Ce qui reste à garder comme déjà vu. */
  vus: Set<string>;
  /** Ce qui porte la pastille. */
  nouveaux: Set<string>;
}

/**
 * Le point à l'ouverture du vestiaire. Sans liste gardée (première visite sur cet appareil), tout l'inventaire est déjà
 * vu. Sinon, est nouveau ce qui est possédé et pas encore vu ; un objet qu'on n'a plus quitte la liste, et redeviendra
 * nouveau s'il revient. Trop de nouveaux d'un coup : aucun n'est marqué, tout est tenu pour vu.
 */
export function faireLePoint(vus: ReadonlySet<string> | null, possedes: readonly string[]): Point {
  if (vus === null) return { vus: new Set(possedes), nouveaux: new Set() };
  const nouveaux = new Set(possedes.filter((cle) => !vus.has(cle)));
  if (nouveaux.size > TROP_DE_NOUVEAUX) return { vus: new Set(possedes), nouveaux: new Set() };
  return { vus: new Set(possedes.filter((cle) => vus.has(cle))), nouveaux };
}

/** Combien d'objets nouveaux dans un rayon, d'après leurs clés. */
export const nouveauxDuRayon = (nouveaux: ReadonlySet<string>, emplacement: string): number => [...nouveaux].filter((cle) => cle.startsWith(`${emplacement}/`)).length;
