/**
 * Les décors de /gaulois, un par lieu de la place, chacun en quatre moments de la journée : 20 fonds. Voir `commun.ts`.
 */
import type { Lieu, Moment } from "../scene.ts";
import { DECOR_BATAILLE } from "./bataille.ts";
import type { Decor, DessinDuLieu } from "./commun.ts";
import { DECOR_MAISONS } from "./maisons.ts";
import { DECOR_PLACE } from "./place.ts";
import { DECOR_REUNION } from "./reunion.ts";
import { DECOR_TAVERNE } from "./taverne.ts";

/** Les dessins, lieu par lieu. */
export const DESSINS_DES_LIEUX: Record<Lieu, DessinDuLieu> = {
  place: DECOR_PLACE,
  taverne: DECOR_TAVERNE,
  reunion: DECOR_REUNION,
  bataille: DECOR_BATAILLE,
  maisons: DECOR_MAISONS,
};

const deja = new Map<string, Decor>();

/** Le décor d'un lieu à un moment, gardé une fois fait : l'astre compte au centième de sa course. */
export function decorDe(lieu: Lieu, moment: Moment): Decor {
  const astre = moment.astre ? `${moment.astre.sorte}:${Math.round(moment.astre.course * 100)}:${Math.round(moment.astre.hauteur * 100)}` : "-";
  const cle = `${lieu}:${moment.phase}:${astre}`;
  let decor = deja.get(cle);
  if (!decor) {
    decor = DESSINS_DES_LIEUX[lieu](moment);
    if (deja.size > 200) deja.clear();
    deja.set(cle, decor);
  }
  return decor;
}
