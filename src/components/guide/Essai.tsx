import EssaiAttaque from "./EssaiAttaque";
import EssaiBateau from "./EssaiBateau";
import EssaiBatiments from "./EssaiBatiments";
import EssaiCroissance from "./EssaiCroissance";
import EssaiTrain from "./EssaiTrain";

/** Les blocs du guide du clan qui se manipulent. Les autres (repères, liste, situations) sont écrits dans la page, sans script. */
export const ESSAIS = ["attaque", "croissance", "batiments", "bateau", "train"] as const;
export type EssaiType = (typeof ESSAIS)[number];

interface Props {
  type: EssaiType;
  /** Les lignes du bloc écrites dans le chapitre : le nom et le rôle de chaque bâtiment. */
  points?: readonly { titre: string; texte: string }[];
}

/**
 * Un essai du guide du clan (/debuter) : un petit instrument à manipuler pour comprendre une règle du jeu. Un seul
 * composant pour tous : la page ne charge qu'un script. Chaque chiffre vient de `src/lib/guide-clan.ts` ou de
 * `src/lib/growth.ts`, et l'état de départ, déjà dans la page, se lit sans JavaScript.
 */
export default function Essai({ type, points = [] }: Props) {
  switch (type) {
    case "attaque":
      return <EssaiAttaque />;
    case "croissance":
      return <EssaiCroissance />;
    case "batiments":
      return <EssaiBatiments points={points} />;
    case "bateau":
      return <EssaiBateau />;
    case "train":
      return <EssaiTrain />;
  }
}
