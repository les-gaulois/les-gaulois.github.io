import type { MaBoutique } from "../../lib/village/contrat";
import { chancesDeLaPochette, manque, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { Pixels, Prix } from "./BoutiquePixels";
import { POCHETTE_COTE, casesDeLaPochette } from "./PochetteDessin";

const CASES_POCHETTE = casesDeLaPochette();

/** Le dessin de la pochette surprise, décoratif : son nom est écrit à côté. */
export function DessinPochette({ echelle = 3, class: classe = "" }: { echelle?: number; class?: string }) {
  return <Pixels largeur={POCHETTE_COTE} hauteur={POCHETTE_COTE} cases={CASES_POCHETTE} echelle={echelle} class={classe} />;
}

/**
 * La pochette surprise : son dessin, son prix, et ses chances par rareté, toujours écrites avant d'ouvrir, telles que le
 * serveur les donne. `fermee` : pourquoi ce compte ne peut pas encore acheter, s'il ne le peut pas.
 */
export function Pochette({ boutique, solde, fermee, onOuvrir }: { boutique: MaBoutique; solde: number; fermee: string | null; onOuvrir: () => void }) {
  const { prix, chances } = boutique.pochette;
  const il_manque = manque(solde, prix);
  const raison = fermee ?? (il_manque > 0 ? `Il vous manque ${stateres(il_manque)}.` : null);
  return (
    <section class="pochette" aria-labelledby="pochette-titre" data-testid="pochette">
      <div class="pochette-tete">
        <DessinPochette class="pochette-dessin" />
        <div class="pochette-nom">
          <h3 id="pochette-titre" class="nom-champ vestiaire-titre">
            La pochette surprise
          </h3>
          <Prix montant={prix} class="pochette-prix" />
        </div>
      </div>
      <ul class="pochette-chances" aria-label="Chances par rareté" data-testid="pochette-chances">
        {chancesDeLaPochette(chances).map(({ rarete, nom, rang, chance }) => (
          <li key={rarete} data-rarete={rarete}>
            <span class="case-rang" aria-hidden="true">
              {Array.from({ length: rang }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <span class="pochette-rarete">{nom}</span>
            <span class="tnum">{pourcent(chance)}</span>
          </li>
        ))}
      </ul>
      <p class="pochette-note">Un objet déjà possédé peut sortir : un double se vend au marché.</p>
      {raison ? (
        <p class="pochette-raison" data-testid="pochette-raison">
          {raison}
        </p>
      ) : (
        <div>
          <button type="button" class="btn btn-secondary" onClick={onOuvrir} data-testid="pochette-ouvrir">
            Ouvrir une pochette
          </button>
        </div>
      )}
    </section>
  );
}
