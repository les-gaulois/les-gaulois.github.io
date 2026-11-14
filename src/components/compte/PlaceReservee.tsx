import type { ComponentChildren } from "preact";
import { Loading } from "./common";

/**
 * La place d'un écran qui n'est pas encore là. `children`, rendu invisible et inerte (ni lu, ni atteint au clavier, ni
 * cliquable), en garde la hauteur ; `label`, le message d'attente, s'écrit par-dessus. Le QG et le compte y mettent la porte
 * d'un visiteur, dans la page construite puis tant que la session se lit : le pied de page est déjà à sa place quand la
 * vraie porte paraît. Il sautait de toute la hauteur de la porte (relevé le 14 novembre 2026).
 */
export function PlaceReservee({ label, children }: { label?: string; children: ComponentChildren }) {
  return (
    <div class="relative">
      <div class="invisible" aria-hidden="true" inert>
        {children}
      </div>
      {label && (
        <div class="absolute inset-x-0 top-0">
          <Loading label={label} />
        </div>
      )}
    </div>
  );
}
