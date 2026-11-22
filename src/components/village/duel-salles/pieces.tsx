/**
 * Les petites pièces des écrans des salles (dessin de Claude Fable 5.2, `docs/DESIGN.md`, « Les salles du duel ») : une
 * image en cases des salles, un mot en deux couleurs (vert ou rouge, une par thème), la tête d'un écran, une petite carte.
 * Elles reprennent les classes du duel (`dl-…`, `22-jeu-duel.css`) et les leurs (`ds-…`, `23-jeu-duel-salles.css`).
 */
import type { ComponentChildren, JSX } from "preact";
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { ecrire, enCapitales, largeurDuTexte } from "../../../lib/jeu/ecriture";
import type { Planche } from "../../../lib/jeu/planche";
import { Px } from "../../jeu/Pixels";
import { AURAS } from "../duel/dessins-des-cartes";
import type { MoteurDuDuel } from "../duel/moteur";
import { urlDePetiteIcone } from "../duel/petites-icones";
import { urlDeLaCarte } from "../duel/Recueil";
import { SON } from "../duel/sons-du-duel";
import { iconeDesSalles } from "./dessins-salles";

/** Une image en cases des salles, décorative : sa taille vient de la planche, chaque case fait `--ds-case` (par défaut, un point du kit). */
export function ImageDesSalles({ cle, planche, classe = "" }: { cle: string; planche: () => Planche; classe?: string }) {
  const p = planche();
  return <i class={`ds-img ${classe}`} style={{ "--i": urlDeLaPlanche(`salles-${cle}`, planche), "--w": p.width, "--h": p.height } as JSX.CSSProperties} aria-hidden="true" />;
}

/** Le vert et le rouge des mots du duel (« a posé », « gagné », « perdu »), un par thème : ceux de `LeDuel.tsx`. */
export const VERT = { clair: "#13763a", sombre: "#7df0a0" };
export const ROUGE = { clair: "#c2182b", sombre: "#ff8a8f" };

/** Un mot en pixels dans deux couleurs, une par thème ; son texte pour les lecteurs d'écran. Même forme que `Px`. */
export function Mot({ t, clair, sombre, dit, classe = "" }: { t: string; clair: string; sombre: string; dit?: string; classe?: string }) {
  const mot = enCapitales(t);
  const img = (coul: string): string => urlDeLaPlanche(`duel-mot-couleur|${mot}|${coul}`, () => ecrire(mot, coul));
  return (
    <span class={`jeu-px ${classe}`}>
      <i aria-hidden="true" style={`--i:${img(clair)};--i-sombre:${img(sombre)};--w:${largeurDuTexte(mot)};--h:9`} />
      <span class="sr-only">{dit ?? t}</span>
    </span>
  );
}

/** La tête d'un écran des salles : le retour, l'icône des salles, le titre, et ce qui va à droite. */
export function TeteDesSalles({ titre, retour, dit = "Retour à l'accueil du duel", mot = "Retour", droite }: { titre: string; retour: () => void; dit?: string; mot?: string; droite?: ComponentChildren }) {
  return (
    <div class="dl-tete ds-tete">
      <button
        type="button"
        class="jeu-btn jeu-btn-bleu jeu-n9 jeu-btn-ic dl-btn"
        aria-label={dit}
        data-mot={mot}
        data-testid="salles-retour"
        onClick={() => {
          SON.clic();
          retour();
        }}
      >
        <i class="jeu-pic" style={{ "--i": urlDePetiteIcone("fleche", false) } as JSX.CSSProperties} />
      </button>
      <h3 class="dl-tete-titre">
        <ImageDesSalles cle="icone" planche={iconeDesSalles} />
        <Px t={titre} couleur="texte" />
      </h3>
      {droite}
    </div>
  );
}

/** Une petite carte de la main, image seule, comme dans l'accueil du duel. */
export function PetiteCarte({ m, id, classe = "" }: { m: MoteurDuDuel; id: string; classe?: string }) {
  const c = m.carte(id);
  return <i class={`dl-petite ${classe}`} data-r={c.r} style={{ backgroundImage: urlDeLaCarte(m, id), "--rc": AURAS[c.r] } as JSX.CSSProperties} aria-hidden="true" />;
}

/** Un nombre en chiffres, avec ses espaces insécables (« 1 240 »). */
export const enChiffres = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(160));
