/**
 * Ce que les six jeux du casino partagent : la forme d'une mise et d'une table de paris, telle que le serveur la vérifie
 * (`internal.casino_paris` de la migration `20261123000100_casino_des_gaulois`). Des calculs purs : l'écran s'en sert pour
 * griser un bouton, le serveur revérifie tout.
 */
import { MISE_DE_DEPART_AU_PLUS, PAS_DES_MISES } from "../contrat-casino";

/** Une mise d'un pari : un multiple de 10 plus grand que zéro. */
export const montantValide = (m: unknown): m is number => typeof m === "number" && Number.isSafeInteger(m) && m > 0 && m % PAS_DES_MISES === 0;

/** Une mise de départ d'un coup : un montant valide qui ne dépasse pas 200. */
export const miseDeDepartValide = (m: unknown): m is number => montantValide(m) && m <= MISE_DE_DEPART_AU_PLUS;

/**
 * Ce que le serveur répond à une table de paris : `ok` avec leur somme, ou le refus qu'il donnerait. Au moins un pari ;
 * chaque pari connu, chaque montant valide ; la somme au plus 200.
 */
export function verifierLesParis(paris: Readonly<Record<string, unknown>>, connus: readonly string[]): { ok: true; total: number } | { ok: false; refus: "pari_invalide" | "mise_trop_haute" } {
  const ids = Object.keys(paris);
  if (ids.length === 0) return { ok: false, refus: "pari_invalide" };
  let total = 0;
  for (const id of ids) {
    const m = paris[id];
    if (!connus.includes(id) || !montantValide(m)) return { ok: false, refus: "pari_invalide" };
    total += m;
  }
  return total > MISE_DE_DEPART_AU_PLUS ? { ok: false, refus: "mise_trop_haute" } : { ok: true, total };
}

/** Un multiple en dixièmes (2,4 fois s'écrit 24), appliqué à une mise multiple de 10 : toujours un nombre entier de statères. */
export const parDixiemes = (mise: number, dixiemes: number): number => (mise * dixiemes) / 10;

/** « 2,4 », « 7,2 », « 36 » : un multiple en dixièmes écrit comme on l'écrit, avec une virgule. */
export const foisEcrit = (dixiemes: number): string => String(dixiemes / 10).replace(".", ",");
