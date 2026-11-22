import { useEffect, useState } from "preact/hooks";
import { tableauDuel } from "../../../lib/compte/api";
import { lireLeTableau, type LigneDuTableau, type MaPlace } from "../../../lib/village/contrat-tableau";
import { compte, rangCourt, rangEnMots } from "../../../lib/village/ecran-tableau";
import { Etiquette, Px } from "../../jeu/Pixels";
import { SON } from "../duel/sons-du-duel";
import { iconeDuTableau } from "./dessins-tableau";
import { Buste, ImageDuTableau, Medaille } from "./pieces";

/**
 * L'entrée « Le tableau » dans l'accueil du duel (dessin de Claude Fable 5.2) : un panneau sur toute la largeur, l'icône,
 * ton rang de la semaine (ou les duels qu'il te manque) et le premier de la semaine. Posée par l'accueil du duel
 * (`../duel/LeDuel.tsx`, à la session de l'écran du duel) ; elle lit elle-même le tableau et ne paraît que si le serveur
 * le connaît : tant que la migration du tableau n'est pas collée, ou si le serveur refuse, rien ne s'affiche.
 */
export function EntreeDuTableau({ onOuvrir }: { onOuvrir: () => void }) {
  const [lu, setLu] = useState<{ moi: MaPlace | null; premier: LigneDuTableau | null } | null>(null);
  useEffect(() => {
    let fini = false;
    tableauDuel.etat().then(
      (brut) => {
        const e = lireLeTableau(brut);
        if (!fini && e) setLu({ moi: e.semaine.moi, premier: e.semaine.lignes.find((l) => l.rang === 1) ?? null });
      },
      () => undefined,
    );
    return () => {
      fini = true;
    };
  }, []);
  if (!lu) return null;
  const { moi, premier } = lu;
  return (
    <button
      type="button"
      class="jeu-panneau jeu-n9 dl-p dl-p-lien dt-entree"
      data-testid="tableau-entree"
      onClick={() => {
        SON.clic();
        onOuvrir();
      }}
    >
      <span class="dl-p-tete">
        <ImageDuTableau cle="icone" planche={iconeDuTableau} />
        <Px t="Le tableau" couleur="texte" />
        {moi?.rang ? (
          <Etiquette t={rangCourt(moi.rang)} ton="or" dit={`Tu es ${rangEnMots(moi.rang)} cette semaine.`} classe="dt-entree-rang" />
        ) : moi && moi.manque > 0 ? (
          <Etiquette t={`Encore ${moi.manque}`} ton="bleu" dit={`Encore ${compte(moi.manque, "duel", "duels")} pour être classé cette semaine.`} />
        ) : null}
        {premier && (
          <span class="dl-p-droite dt-entree-droite">
            <span class="sr-only">{`Premier cette semaine : ${premier.nom ?? "un Gaulois"}, note ${premier.note}.`}</span>
            <Medaille place={1} />
            <Buste tenue={premier.tenue} />
            <span aria-hidden="true" class="dt-nom">
              <Px t={premier.nom ?? "Un Gaulois"} couleur="texte" muet />
            </span>
            <span class="dt-note" aria-hidden="true">
              <Px t={String(premier.note)} couleur="or" muet />
            </span>
          </span>
        )}
      </span>
      <span class="dl-p-mot dt-entree-mot">Les meilleurs duellistes de la semaine et de la saison.</span>
    </button>
  );
}
