/** L'onglet « Vue d'ensemble » de la Direction : ce qui attend une décision, puis l'état du site. */
import type { MemberFilter } from "../../lib/compte/admin-members";
import { ensembleCases, type EnsembleCase } from "../../lib/compte/direction-ensemble";
import type { SiteHealthInput } from "../../lib/etat-site";
import { fmtInt } from "../../lib/format";
import { Pastille } from "./direction-kit";
import type { Overview } from "./direction-overview";
import { PartieTete } from "./Onglets";
import SiteHealth from "./SiteHealth";

/**
 * Une case de la vue d'ensemble : elle ouvre la partie où l'on décide. C'est un vrai lien (`#demandes`) : le clic droit et
 * l'ouverture dans un nouvel onglet restent. Au clic simple, `onOpen` ouvre la partie et y mène le focus.
 * `filter` : la case ouvre l'onglet Comptes avec ce filtre déjà choisi (« Suspendus » montre les comptes suspendus).
 * La couleur du trait et de la pastille dit l'état, avec son mot : voir `ensembleCases`.
 */
function Tile({ item, onOpen }: { item: EnsembleCase; onOpen: (part: string, filter?: MemberFilter) => void }) {
  return (
    <a
      href={`#${item.part}`}
      class="dir-ensemble-case"
      data-dir-ton={item.ton}
      data-case={item.id}
      data-testid="direction-tile"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(item.part, item.filter);
      }}
    >
      {/* `console-*` : l'ambiance console de la page, voir global.css. */}
      <span class="dir-ensemble-nom console-libelle">{item.label}</span>
      <span class="dir-ensemble-nombre console-valeur tnum">{fmtInt(item.value)}</span>
      <span class="dir-ensemble-etat">
        <Pastille ton={item.ton} testid="direction-tile-state">
          {item.mot}
        </Pastille>
      </span>
    </a>
  );
}

/** `onOpen` ouvre une partie (et, pour Comptes, son filtre) : voir `open` dans `DirectionApp.tsx`. */
export default function DirectionEnsemble({ data, health, onOpen }: { data: Overview; health: Omit<SiteHealthInput, "roster">; onOpen: (part: string, filter?: MemberFilter) => void }) {
  return (
    <section class="dir-ensemble" aria-labelledby="ensemble-titre">
      <PartieTete id="ensemble-titre" title="Ce qui attend une décision" />
      <div class="dir-ensemble-cases">
        {ensembleCases(data).map((item) => (
          <Tile key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
      <SiteHealth meta={health.meta} gazette={health.gazette} roster={data.roster} />
    </section>
  );
}
