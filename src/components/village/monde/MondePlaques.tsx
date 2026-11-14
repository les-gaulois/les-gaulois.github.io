import type { GauloisDeLaPlace } from "../../../lib/village/contrat";
import { plaquesEnMots } from "../../../lib/village/ecran-place";

/**
 * Les plaques de la forge que porte un Gaulois (la forge aux souvenirs, 14 novembre 2026) : le nom de chaque objet gravé et
 * le texte de sa plaque, « Épée longue : 12 novembre, à quatre, 2,33 points rapportés ». Là où le monde dit ce qui place un
 * Gaulois : l'étiquette du survol, celle du toucher, et « Qui est où ». Rien, s'il n'en porte pas (ou si le serveur ne
 * les montre pas : un membre anonyme garde ses plaques pour lui).
 */
export function PlaquesDuGaulois({ gaulois, class: classe = "" }: { gaulois: Pick<GauloisDeLaPlace, "gravures">; class?: string }) {
  const plaques = plaquesEnMots(gaulois);
  if (plaques.length === 0) return null;
  return (
    <span class={`monde-plaques ${classe}`} data-testid="monde-plaques">
      {plaques.map((plaque) => (
        <span key={plaque.cle} class="monde-plaque">
          <span class="monde-plaque-objet">{plaque.objet}</span>
          <span class="sr-only"> : </span>
          <span class="monde-plaque-texte">{plaque.texte}</span>
        </span>
      ))}
    </span>
  );
}
