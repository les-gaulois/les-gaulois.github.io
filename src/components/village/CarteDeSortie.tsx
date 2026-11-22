import type { JSX } from "preact";
import { useId, useState } from "preact/hooks";
import type { Objet, RareteDObjet as Rarete, Vignette } from "../../lib/gaulois";
import { CARTE_DE_SORTIE, faconDeLaCarte, styleDeCarte } from "../../lib/jeu/cartes-d-objets";
import type { PoseDeLaChose } from "../../lib/village/fonds-objets";
import { CaseMontree } from "./BoutiqueDialogue";
import { suivreLePointeur, useCaseQuiTient, variablesDeLaCarte } from "./CarteDObjet";
import { GrandeDeborde, GrandePleine } from "./CartesRares";
import { useEffetsDeLaChose } from "./effets-des-cartes";

/**
 * La carte de ce qui sort d'un booster ou d'un palier du pass, en grand (22 novembre 2026, choix du pilote sur les modèles
 * de Claude Fable 5.2) : la pleine image aux bandeaux fins pour le légendaire, le légendaire de saison et le divin ; le
 * mystique qui déborde par le haut, le nom devant ; la grande carte d'avant pour les autres raretés (`CaseMontree`
 * `grande`). Posée par `carteFinale` d'`OuvertureDuBooster.tsx`, à quatre pixels la case, moins sur un écran petit ou bas
 * (`caseDeLaSortie`), pour que la bourse et les boutons restent dans l'écran.
 *
 * La pleine image montre sa fiche (les effets du duel, pour qui le voit) au survol, ou par le bandeau du bas, qui est un
 * bouton ; un appui n'importe où sur la carte fait de même.
 */
export function CarteDeSortie({
  objet,
  rarete,
  vignette,
  fond = null,
  pose = "centre",
  sous = null,
  testid,
}: {
  objet: Objet;
  rarete: Rarete;
  vignette: Vignette | null;
  fond?: string | null;
  pose?: PoseDeLaChose;
  sous?: string | null;
  testid?: string;
}) {
  const effets = useEffetsDeLaChose(fond);
  const [ouverte, setOuverte] = useState(false);
  const id = `${useId()}-effets`;
  const p = useCaseQuiTient(CARTE_DE_SORTIE.hauteur);
  const facon = faconDeLaCarte(rarete);
  if (facon === "simple" || !vignette || !fond) return <CaseMontree objet={objet} rarete={rarete} vignette={vignette} fond={fond} pose={pose} sous={sous} grande testid={testid} />;
  const style = { ...variablesDeLaCarte(rarete), "--co-p": `${p}px` } as JSX.CSSProperties;
  const avecTiroir = facon === "pleine" && effets !== null;
  const basculer = (): void => setOuverte((o) => !o);
  const proprietes = { nom: objet.nom, rarete, cle: fond, dessin: vignette, effets, sous, p, pose };
  return (
    <div class={`co-sortie-socle co-sortie-${facon}`}>
      <div
        class={`co-carte co-sortie co-${facon}`}
        data-carte={styleDeCarte(rarete)}
        data-rarete={rarete}
        data-tiroir={avecTiroir ? "" : undefined}
        data-ouverte={avecTiroir && ouverte ? "" : undefined}
        data-testid={testid}
        style={style}
        {...suivreLePointeur(10)}
        // Un appui sur la carte, pour la souris et le doigt ; le clavier passe par le bouton du bandeau du bas. Dans la fiche
        // ouverte, un appui ne la referme pas : on peut y choisir du texte.
        onClick={avecTiroir ? (e: MouseEvent) => (e.target instanceof Element && e.target.closest(".co-tiroir") ? undefined : basculer()) : undefined}
      >
        {facon === "pleine" ? <GrandePleine {...proprietes} tiroir={avecTiroir ? { ouverte, basculer, id } : null} /> : <GrandeDeborde {...proprietes} />}
      </div>
    </div>
  );
}
