/** L'onglet « Vue d'ensemble » de la Direction : ce qui attend une décision, puis l'état du site. */
import type { MemberFilter } from "../../lib/compte/admin-members";
import type { SiteHealthInput } from "../../lib/etat-site";
import { fmtInt } from "../../lib/format";
import type { Overview } from "./direction-overview";
import { PartieTete } from "./Onglets";
import SiteHealth from "./SiteHealth";

/**
 * Une case de la vue d'ensemble : elle ouvre la partie où l'on décide. C'est un vrai lien (`#demandes`) : le clic droit et
 * l'ouverture dans un nouvel onglet restent. Au clic simple, `onOpen` ouvre la partie et y mène le focus.
 * `filter` : la case ouvre l'onglet Comptes avec ce filtre déjà choisi (« Suspendus » montre les comptes suspendus).
 */
function Tile({ label, value, part, filter, onOpen, alert = false }: { label: string; value: number; part: string; filter?: MemberFilter; onOpen: (part: string, filter?: MemberFilter) => void; alert?: boolean }) {
  return (
    <a
      href={`#${part}`}
      class="card block p-5 hover:border-white"
      data-testid="direction-tile"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(part, filter);
      }}
    >
      {/* `console-*` : l'ambiance console de la page, voir global.css. */}
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class={`console-valeur tnum mt-1 block font-display text-4xl font-extrabold ${alert ? "text-warn" : ""}`}>{fmtInt(value)}</span>
    </a>
  );
}

/** `onOpen` ouvre une partie (et, pour Comptes, son filtre) : voir `open` dans `DirectionApp.tsx`. */
export default function DirectionEnsemble({ data, health, onOpen }: { data: Overview; health: Omit<SiteHealthInput, "roster">; onOpen: (part: string, filter?: MemberFilter) => void }) {
  return (
    <section aria-labelledby="ensemble-titre">
      <PartieTete id="ensemble-titre" title="Ce qui attend une décision" />
      <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Demandes à traiter" value={data.pending_requests} part="demandes" onOpen={onOpen} alert={data.pending_requests > 0} />
        <Tile label="Membres validés" value={data.members} part="comptes" filter="validated" onOpen={onOpen} />
        <Tile label="Encadrement" value={data.officers} part="comptes" filter="staff" onOpen={onOpen} />
        <Tile label="Suspendus" value={data.suspended} part="comptes" filter="suspended" onOpen={onOpen} />
      </div>
      <div class="mt-6">
        <SiteHealth meta={health.meta} gazette={health.gazette} roster={data.roster} />
      </div>
    </section>
  );
}
