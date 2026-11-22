/**
 * Les petites pièces du tableau des duellistes (dessin et spécification de Claude Fable 5.2, 22 novembre 2026) : le buste
 * d'un Gaulois, ses insignes, la note et sa barre, une médaille, la tête de l'écran. Elles reprennent les classes du duel
 * (`dl-…`), des salles (`ds-…`) et les leurs (`dt-…`, `26-jeu-duel-tableau.css`).
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { casesDuGaulois, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, type Tenue } from "../../../lib/gaulois";
import { casesDeLInsigneDuDuel, COTE_DE_L_INSIGNE_DU_DUEL, INSIGNE_DU_DUEL } from "../../../lib/village/insigne-du-duel";
import { Px } from "../../jeu/Pixels";
import { peindre, Pixels } from "../BoutiquePixels";
import { urlDePetiteIcone } from "../duel/petites-icones";
import { SON } from "../duel/sons-du-duel";
import { ImageDesSalles } from "../duel-salles/pieces";
import { iconeDuTableau, medaille, type PlaceDuPodium } from "./dessins-tableau";

/** Une image en cases du tableau (celles des salles, la clé préfixée « tableau- »). */
export function ImageDuTableau({ cle, planche, classe = "" }: { cle: string; planche: Parameters<typeof ImageDesSalles>[0]["planche"]; classe?: string }) {
  return <ImageDesSalles cle={`tableau-${cle}`} planche={planche} classe={classe} />;
}

/** La médaille d'une place du podium : le chiffre y est frappé ; le rang est aussi écrit ou dit à côté. */
export const Medaille = ({ place, classe = "" }: { place: PlaceDuPodium; classe?: string }) => <ImageDuTableau cle={`medaille-${place}`} planche={() => medaille(place)} classe={classe} />;

/** Le buste d'un Gaulois : son dessin sans familier, une case par pixel, coupé sous les épaules par la feuille. Décoratif. */
export function Buste({ tenue }: { tenue: Tenue | null }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (tenue) peindre(toile.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, casesDuGaulois(tenue));
  }, [tenue]);
  return (
    <span class="dt-buste" aria-hidden="true">
      <canvas ref={toile} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} />
    </span>
  );
}

/** L'insigne du duelliste de la semaine, en pixels, décoratif (son nom est dit à côté). */
export const DessinDeLInsigne = ({ echelle = 1 }: { echelle?: number }) => (
  <Pixels largeur={COTE_DE_L_INSIGNE_DU_DUEL} hauteur={COTE_DE_L_INSIGNE_DU_DUEL} cases={casesDeLInsigneDuDuel()} echelle={echelle} />
);

/** Les semaines gagnées d'un duelliste : l'insigne, et le nombre à partir de deux. Rien sans semaine gagnée. */
export function Insignes({ n }: { n: number }) {
  if (n < 1) return null;
  return (
    <span class="dt-insignes" title={INSIGNE_DU_DUEL.nom}>
      <DessinDeLInsigne />
      {n > 1 && <Px t={String(n)} couleur="or" muet />}
      <span class="sr-only">{n > 1 ? `${n} semaines gagnées` : "1 semaine gagnée"}</span>
    </span>
  );
}

/** La note, en grand ; le parent la dit en mots. */
export const Note = ({ note, couleur = "texte" }: { note: number; couleur?: "texte" | "or" }) => (
  <span class="dt-note" aria-hidden="true">
    <Px t={String(note)} couleur={couleur} muet />
  </span>
);

/** La barre de la note, de 0 à 100, son repère à 50 (« autant que prévu ») ; d'or à 50 et plus, bleue dessous. La couleur double le nombre écrit. */
export const Jauge = ({ note }: { note: number }) => (
  <span class="jeu-tube jeu-n9 dt-jauge" aria-hidden="true">
    <span class={`jeu-plein jeu-n9 ${note >= 50 ? "" : "jeu-plein-bleu"} ${note <= 0 ? "jeu-plein-vide" : ""}`} style={`--part:${Math.max(0, Math.min(1, note / 100))}`} />
    <i class="jeu-repere" style="--x:0.5" />
  </span>
);

/** La tête d'un écran du tableau : le retour, l'icône du tableau, le titre, et ce qui va à droite (les onglets). */
export function TeteDuTableau({ titre, retour, droite }: { titre: string; retour: () => void; droite?: ComponentChildren }) {
  return (
    <div class="dl-tete ds-tete dt-tete">
      <button
        type="button"
        class="jeu-btn jeu-btn-bleu jeu-n9 jeu-btn-ic dl-btn"
        aria-label="Retour à l'accueil du duel"
        data-mot="Retour"
        data-testid="tableau-retour"
        onClick={() => {
          SON.clic();
          retour();
        }}
      >
        <i class="jeu-pic" style={{ "--i": urlDePetiteIcone("fleche", false) } as JSX.CSSProperties} />
      </button>
      <h3 class="dl-tete-titre">
        <ImageDuTableau cle="icone" planche={iconeDuTableau} />
        <Px t={titre} couleur="texte" />
      </h3>
      {droite}
    </div>
  );
}
