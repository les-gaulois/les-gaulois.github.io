import { TENUE_DE_DEPART } from "../../lib/gaulois";
import { RETOUR_BOUTIQUE_KEY } from "../../lib/village/boutique-rayons";
import { useArrivee } from "../compte/arrivee";
import { DemandeLienOpenFront } from "../compte/LienOpenFront";
import { CodeLogin, DiscordButton, Loading, codeLoginShown, useMe } from "../compte/common";
import Boutique from "./Boutique";
import { ApercuGaulois, noterLeRetour } from "./Cases";

/**
 * La page « La boutique » (`/boutique`, 15 novembre 2026, demande du pilote : « séparer dans Mon Gaulois la boutique et la
 * mettre sur une page à part ») : les achats (boutique, pochette, marché), sortis de « Mon Gaulois ». Les mêmes portes que
 * `/village` (`VillageApp.tsx`) : un visiteur voit le Gaulois de départ et la connexion, puis revient ici ; un compte qui
 * doit encore donner le lien de son profil OpenFront le donne d'abord ; les autres ont la boutique.
 */
export default function BoutiqueApp() {
  const { me, refresh } = useMe();
  // Le seul endroit de la page qui lit l'inscription (src/lib/compte/arrivee.ts) : le lien du profil OpenFront d'abord. Un
  // compte sans Gaulois a la porte de la boutique elle-même (`Boutique.tsx`), qui mène au vestiaire pour le créer.
  const { etape } = useArrivee(me);

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <div class="vestiaire" data-testid="boutique-porte">
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
        <div class="vestiaire-porte">
          <p class="text-lg">Connectez-vous pour ouvrir la boutique.</p>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" avant={() => noterLeRetour(RETOUR_BOUTIQUE_KEY)} />
          </div>
          {codeLoginShown() && (
            <div class="mt-6">
              <CodeLogin connecte={() => void refresh()} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (etape === undefined) return <Loading label="Lecture de votre compte…" />;
  if (etape === "lien") {
    return (
      <div data-testid="boutique-lien">
        <DemandeLienOpenFront me={me} onSent={refresh} />
      </div>
    );
  }

  return <Boutique />;
}
