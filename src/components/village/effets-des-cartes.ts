import { useEffect, useState } from "preact/hooks";
import { useDuelVisible } from "./duel/acces";

/**
 * Ce que la carte d'un cosmétique dit de ses effets (22 novembre 2026) : ceux du duel « Coup pour coup ». Tant que le duel
 * est fermé (`internal.duel_ouvert`), seul qui le voit (le pilote) lit ces effets : le calcul se charge à la demande
 * (`duel/effets-des-cartes.ts`, qui tire le moteur du duel), jamais pour les autres membres ni sur « Mon compte ».
 */

/** Une ligne de la fiche : l'icône (adresse d'image), le mot en gras, la phrase, et son ton (effet unique, panoplie). */
export interface LigneDEffet {
  icone: string | null;
  /** Le côté de l'icône, en cases : 15 pour la tuile d'un rôle, 11 pour un mot-clé. */
  cases: number;
  gras: string;
  texte: string;
  ton: "unique" | "alerte" | "panoplie" | null;
}

/** La carte du duel d'un objet : son rôle, sa force, son prix en énergie, son repos et ses mots-clés. */
export interface CarteDuDuel {
  role: string;
  roleNom: string;
  couleurDuRole: string;
  urlDuRole: string;
  force: number;
  cout: number;
  repos: number;
  /** Les icônes des mots-clés, trois au plus, dans l'ordre de la carte. */
  icones: readonly { url: string; nom: string }[];
  unique: string | null;
  /** Le numéro de la carte dans le catalogue du duel (son ordre), et combien il y en a : le pied de la fiche en grand. */
  numero: number;
  total: number;
}

export interface EffetsDeCarte {
  /** `null` pour un familier : il n'a pas de carte, seulement l'effet de son compagnon. */
  duel: CarteDuDuel | null;
  lignes: readonly LigneDEffet[];
}

export type LireEffets = (cle: string) => EffetsDeCarte | null;

/** Le calcul, une fois chargé ; et ceux qui l'attendent. */
let lire: LireEffets | null = null;
let charge: Promise<LireEffets> | null = null;
function charger(): Promise<LireEffets> {
  charge ??= import("./duel/effets-des-cartes").then((m) => {
    lire = m.lireEffets;
    return m.lireEffets;
  });
  return charge;
}

/**
 * Les effets de la chose d'une clé de fond (`objet/<emplacement>/<id>`, `familier/<id>`) pour le compte de cette page :
 * `null` tant que le duel ne lui est pas visible, que le calcul se charge, ou pour une chose sans effet.
 */
export function useEffetsDeLaChose(cle: string | null | undefined): EffetsDeCarte | null {
  const visible = useDuelVisible();
  // Une fonction se range dans l'état par une fonction qui la rend : passée seule, `useState` l'appellerait.
  const [pret, setPret] = useState<LireEffets | null>(() => lire);
  useEffect(() => {
    if (!visible || pret) return;
    let fini = false;
    void charger().then((f) => {
      if (!fini) setPret(() => f);
    });
    return () => {
      fini = true;
    };
  }, [visible, pret]);
  if (!visible || !pret || !cle) return null;
  return pret(cle);
}
