/** L'onglet Journal de la Direction, réservé aux admins et au fondateur. */
import { useState } from "preact/hooks";
import { LOG_CATEGORIES, LOG_LIMIT, LOG_PAGE, describe, filterLog, logPeople, type LogCategory } from "../../lib/compte/admin-log";
import type { LogRow } from "../../lib/compte/types";
import { fmtCount, fmtDateTime, fmtInt } from "../../lib/format";
import { useList } from "./AdminPanels";
import { Empty, Loading, Problem } from "./common";
import { PartieTete } from "./Onglets";

/** Le journal en phrases, avec un filtre par personne et par type d'action. Le serveur garde les codes : voir `src/lib/compte/admin-log.ts`. */
export default function DirectionJournal() {
  const list = useList<LogRow>("list_admin_log", { p_limit: LOG_LIMIT });
  const [person, setPerson] = useState("");
  const [category, setCategory] = useState<LogCategory | "">("");
  const [shown, setShown] = useState(LOG_PAGE);
  const rows = list.rows ?? [];
  const filtered = filterLog(rows, { person: person || null, category: category || null });

  return (
    <section aria-labelledby="journal-titre" data-testid="admin-log">
      <PartieTete id="journal-titre" title="Journal" />
      <Problem message={list.error} onRetry={() => void list.reload()} />
      {list.rows === null ? (
        !list.error && (
          <div class="mt-4">
            <Loading />
          </div>
        )
      ) : rows.length === 0 ? (
        <div class="mt-4">
          <Empty>Le journal est vide.</Empty>
        </div>
      ) : (
        <>
          <div class="mt-5 flex flex-wrap gap-3">
            <div class="min-w-48 flex-1">
              <label class="text-sm font-semibold" for="log-person">
                Personne
              </label>
              <select
                id="log-person"
                class="field mt-1"
                value={person}
                onChange={(e) => {
                  setPerson(e.currentTarget.value);
                  setShown(LOG_PAGE);
                }}
              >
                <option value="">Tout le monde</option>
                {logPeople(rows).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div class="min-w-48 flex-1">
              <label class="text-sm font-semibold" for="log-category">
                Type d'action
              </label>
              <select
                id="log-category"
                class="field mt-1"
                value={category}
                onChange={(e) => {
                  setCategory(e.currentTarget.value as LogCategory | "");
                  setShown(LOG_PAGE);
                }}
              >
                <option value="">Toutes</option>
                {LOG_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p class="mt-3 text-sm text-muted" role="status" data-testid="log-count">
            {fmtCount(filtered.length, "entrée")}
            {rows.length >= LOG_LIMIT ? `, parmi les ${fmtInt(LOG_LIMIT)} dernières : l'écran n'en lit pas davantage.` : "."}
          </p>
          {filtered.length === 0 ? (
            <Empty>Aucune entrée pour ce choix.</Empty>
          ) : (
            <ol class="mt-2" aria-label="Journal d'administration">
              {filtered.slice(0, shown).map((l) => {
                const line = describe(l, fmtDateTime);
                return (
                  <li key={l.id} class="border-t border-line py-3" data-testid="log-row">
                    <p class="tnum text-xs text-muted">
                      <time dateTime={l.at}>{fmtDateTime(l.at)}</time>
                    </p>
                    <p class="mt-0.5">
                      <strong>{line.who}</strong> {line.what}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {filtered.length > shown && (
            <button type="button" class="btn btn-ghost mt-3" onClick={() => setShown(shown + LOG_PAGE)}>
              Afficher {fmtInt(Math.min(LOG_PAGE, filtered.length - shown))} de plus
            </button>
          )}
        </>
      )}
    </section>
  );
}
