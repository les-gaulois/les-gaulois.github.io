import { useEffect, useState } from "preact/hooks";
import { ServerError, call } from "../../../lib/compte/api";
import { lireModeGod } from "../../../lib/village/god";

/**
 * Qui voit « Le duel » dans le menu du jeu (22 novembre 2026) : tout membre quand le serveur dit le duel ouvert ; tant qu'il
 * est fermé (`internal.duel_ouvert`), le seul titulaire, c'est-à-dire le pilote. Le serveur décide : `get_mon_duel` refuse
 * `duel_ferme` à tout autre compte. Tant que la migration du duel n'est pas collée, la fonction n'existe pas encore : on
 * reconnaît alors le pilote par le mode GOD, réservé au même titulaire (`get_village_god`), et le duel d'entraînement, qui
 * se joue dans la page, lui est ouvert seul.
 */
/** L'adresse de la partie du duel dans « Mon Gaulois » : `/village#duel`. */
export const ANCRE_DUEL = "duel";

export type AccesAuDuel =
  | { kind: "lecture" }
  | { kind: "ferme" }
  /** `serveur` : la réponse de `get_mon_duel`, ou `null` quand le serveur n'a pas encore le duel. */
  | { kind: "ouvert"; serveur: unknown | null };

export async function lireLAcces(): Promise<AccesAuDuel> {
  try {
    const reponse = await call<unknown>("get_mon_duel");
    return { kind: "ouvert", serveur: reponse };
  } catch (e) {
    if (e instanceof ServerError && e.code !== "network") return { kind: "ferme" };
  }
  try {
    const god = lireModeGod(await call<unknown>("get_village_god"));
    return god?.permis ? { kind: "ouvert", serveur: null } : { kind: "ferme" };
  } catch {
    return { kind: "ferme" };
  }
}

/**
 * Le duel est-il visible pour le compte de cette page ? Retenu ici quand l'accès est lu, pour que d'autres parties du jeu (le
 * badge « carte de duel » d'un objet sorti d'un booster) ne parlent du duel qu'à qui le voit.
 */
let visible = false;
export const ACCES_CHANGE = "gal:duel-acces";
export const duelVisible = (): boolean => visible;
function retenir(a: AccesAuDuel): void {
  const v = a.kind === "ouvert";
  if (v === visible || typeof window === "undefined") return;
  visible = v;
  window.dispatchEvent(new CustomEvent(ACCES_CHANGE));
}

/** Suit `duelVisible` dans un composant. */
export function useDuelVisible(): boolean {
  const [v, setV] = useState(visible);
  useEffect(() => {
    const relire = (): void => setV(visible);
    window.addEventListener(ACCES_CHANGE, relire);
    relire();
    return () => window.removeEventListener(ACCES_CHANGE, relire);
  }, []);
  return v;
}

/** L'accès au duel, lu une fois que le Gaulois du membre existe ; relu à chaque retour sur la partie (`retours`). */
export function useAccesAuDuel(actif: boolean, retours = 0): AccesAuDuel {
  const [acces, setAcces] = useState<AccesAuDuel>({ kind: "lecture" });
  useEffect(() => {
    if (!actif) return;
    let fini = false;
    void lireLAcces().then((a) => {
      if (fini) return;
      retenir(a);
      setAcces(a);
    });
    return () => {
      fini = true;
    };
  }, [actif, retours]);
  return acces;
}
