import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fmtCount, fmtDayAndTime, fmtInt, fmtMinutes, NO_DATA } from "../lib/format";
import { filterJournal, isFiltered, JOURNAL_FIRST_ROWS, journalChoices, journalCount, journalUnread, NO_FILTER, replayUrl, type JournalClan, type JournalFilter, type JournalRow } from "../lib/journal";
import { mapLabel } from "../lib/map-names";
import { formatLabel } from "../lib/results";

const PAGE = JOURNAL_FIRST_ROWS;
const RESULTS: { key: JournalFilter["result"]; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "won", label: "Victoires" },
  { key: "lost", label: "Défaites" },
];

const clanList = (clans: JournalClan[]) => clans.map(([tag, players]) => `[${tag}] (${fmtInt(players)})`).join(", ");
const mapOf = (r: JournalRow) => (r.map === null ? NO_DATA : mapLabel(r.map));
const formatOf = (r: JournalRow) => (r.format === null ? NO_DATA : formatLabel(r.format));
const durationOf = (r: JournalRow) => (r.seconds === null ? NO_DATA : fmtMinutes(r.seconds));

function Result({ won }: { won: boolean }) {
  return (
    <span class="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold">
      <i class={`inline-block size-2.5 rounded-full ${won ? "bg-win" : "bg-loss"}`} aria-hidden="true" />
      {won ? "Victoire" : "Défaite"}
    </span>
  );
}

function Replay({ row }: { row: JournalRow }) {
  return (
    <a href={replayUrl(row.id)} rel="noopener" aria-label={`Ouvrir sur OpenFront la partie du ${fmtDayAndTime(row.at)}`} data-testid="journal-replay">
      Ouvrir
    </a>
  );
}

/** Les clans d'une partie. Une partie sans clan cité n'écrit rien : ce n'est pas la preuve qu'il n'y en avait aucun. */
function Clans({ row }: { row: JournalRow }) {
  if (row.rivals.length === 0 && row.allies.length === 0) return null;
  return (
    <>
      {row.rivals.length > 0 && <span class="block">Contre {clanList(row.rivals)}</span>}
      {row.allies.length > 0 && <span class="block">Avec {clanList(row.allies)}</span>}
    </>
  );
}

interface Props {
  /** Le fichier du journal entier. */
  src: string;
  initial: JournalRow[];
  /** Faux : les équipes des clans ne sont plus affichées, comme les face-à-face. */
  sides: boolean;
}

/**
 * Le journal des parties. Les premières lignes viennent de la page, donc se lisent sans JavaScript.
 * Le reste, et avec lui les filtres, arrive d'un fichier statique : le navigateur n'appelle jamais l'API d'OpenFront.
 */
export default function GamesJournal({ src, initial, sides }: Props) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [all, setAll] = useState<JournalRow[]>(initial);
  const [filter, setFilter] = useState<JournalFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [attempt, setAttempt] = useState(0);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const firstChip = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const lines = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: JournalRow[]) => {
        // Le fichier est écrit au build à partir de données déjà validées par Zod.
        if (cancelled) return;
        if (!Array.isArray(json)) throw new Error("format");
        setAll(json);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [src, attempt]);

  const choices = useMemo(() => journalChoices(all), [all]);
  const maps = useMemo(() => choices.maps.map((key) => ({ key, label: mapLabel(key) })).sort((a, b) => a.label.localeCompare(b.label, "fr")), [choices]);
  const rows = useMemo(() => filterJournal(all, filter), [all, filter]);
  useEffect(() => setLimit(PAGE), [filter]);

  // Le bouton qui vient de servir peut disparaître : le clavier reprend à la première ligne ajoutée. Le tableau et les cartes coexistent, seul l'un des deux est visible.
  useEffect(() => {
    if (focusRow === null) return;
    const links = [...(lines.current?.querySelectorAll<HTMLElement>('[data-testid="journal-replay"]') ?? [])].filter((a) => a.offsetParent !== null);
    links[focusRow]?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const ready = state === "ready";
  const visible = rows.slice(0, limit);
  const set = (change: Partial<JournalFilter>) => setFilter({ ...filter, ...change });
  const unread = ready ? journalUnread({ total: all.length, read: all.filter((r) => r.map !== null).length }, filter) : null;

  return (
    <div>
      <div class="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Résultat" class="flex flex-wrap gap-2">
          {RESULTS.map((r, i) => (
            <button key={r.key} ref={i === 0 ? firstChip : undefined} type="button" class="chip" aria-pressed={filter.result === r.key} disabled={!ready} onClick={() => set({ result: r.key })}>
              {r.label}
            </button>
          ))}
        </div>
        <label class="block basis-full sm:max-w-52 sm:flex-1 sm:basis-40" htmlFor="journal-format">
          <span class="mb-1 block text-sm font-semibold">Format</span>
          <select id="journal-format" class="field" value={filter.format} disabled={!ready} onChange={(e) => set({ format: e.currentTarget.value })}>
            <option value="">Tous les formats</option>
            {choices.formats.map((key) => (
              <option key={key} value={key}>{formatLabel(key)}</option>
            ))}
          </select>
        </label>
        <label class="block basis-full sm:max-w-64 sm:flex-1 sm:basis-40" htmlFor="journal-map">
          <span class="mb-1 block text-sm font-semibold">Carte</span>
          <select id="journal-map" class="field" value={filter.map} disabled={!ready} onChange={(e) => set({ map: e.currentTarget.value })}>
            <option value="">Toutes les cartes</option>
            {maps.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        {sides && (
          <label class="block basis-full sm:max-w-52 sm:flex-1 sm:basis-40" htmlFor="journal-rival">
            <span class="mb-1 block text-sm font-semibold">Contre le clan</span>
            <select id="journal-rival" class="field" value={filter.rival} disabled={!ready} onChange={(e) => set({ rival: e.currentTarget.value })}>
              <option value="">Tous les clans</option>
              {choices.rivals.map((tag) => (
                <option key={tag} value={tag}>[{tag}]</option>
              ))}
            </select>
          </label>
        )}
        {isFiltered(filter) && (
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => {
              setFilter(NO_FILTER);
              firstChip.current?.focus();
            }}
          >
            Retirer les filtres
          </button>
        )}
      </div>

      <p class="tnum mt-3 text-sm text-muted" role="status" tabIndex={-1} ref={status} data-testid="journal-count">
        {ready ? `${journalCount(rows, filter)} ${fmtInt(visible.length)} ${visible.length > 1 ? "affichées" : "affichée"}.` : `Les ${fmtInt(initial.length)} dernières parties.`}
      </p>
      {unread && <p class="tnum mt-1 text-sm text-muted" data-testid="journal-unread">{unread}</p>}
      <p class="mt-1 max-w-3xl text-sm text-muted" data-testid="journal-link-note">
        « Ouvrir » lance le replay sur OpenFront. Une partie ancienne peut s'arrêter sur « Rejoindre un salon privé ».
      </p>
      {state === "error" && (
        <div class="card mt-3 p-4" role="alert">
          <p class="font-semibold">Le reste du journal n'a pas pu être chargé : seules les dernières parties s'affichent, sans les filtres.</p>
          <button
            type="button"
            class="btn btn-ghost mt-3"
            onClick={() => {
              setAttempt(attempt + 1);
              status.current?.focus();
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p class="card mt-4 p-5 text-muted" data-testid="journal-empty">Aucune partie ne correspond à ces filtres sur cette période.</p>
      ) : (
        <div ref={lines}>
          <div class="card mt-4 hidden overflow-hidden lg:block">
            <table class="data-table tnum w-full text-sm [overflow-wrap:break-word]">
              <caption class="sr-only">Les parties du clan, de la plus récente à la plus ancienne</caption>
              <thead>
                <tr>
                  <th scope="col">Quand</th>
                  <th scope="col">Carte</th>
                  <th scope="col">Format</th>
                  <th scope="col" class="whitespace-nowrap">Gaulois</th>
                  {sides && <th scope="col">Autres clans</th>}
                  <th scope="col" class="num">Durée</th>
                  <th scope="col">Résultat</th>
                  <th scope="col"><span class="sr-only">Lien vers OpenFront</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} data-testid="journal-row">
                    <td class="whitespace-nowrap">{fmtDayAndTime(r.at)}</td>
                    <td>{mapOf(r)}</td>
                    <td class="whitespace-nowrap">{formatOf(r)}</td>
                    <td class="whitespace-nowrap">{fmtInt(r.gaulois)} sur {fmtInt(r.players)}</td>
                    {sides && <td class="text-muted"><Clans row={r} /></td>}
                    <td class="num whitespace-nowrap">{durationOf(r)}</td>
                    <td><Result won={r.won} /></td>
                    <td class="whitespace-nowrap"><Replay row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul class="mt-4 space-y-2 lg:hidden">
            {visible.map((r) => (
              <li key={r.id} class="card tnum p-3 text-sm" data-testid="journal-card">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span class="font-semibold">{fmtDayAndTime(r.at)}</span>
                  <Result won={r.won} />
                </div>
                <p class="mt-1">{mapOf(r)} · {formatOf(r)}</p>
                <p class="mt-1 text-muted">{fmtInt(r.gaulois)} Gaulois sur {fmtCount(r.players, "joueur")} · {durationOf(r)}</p>
                {(r.rivals.length > 0 || r.allies.length > 0) && <p class="mt-1 text-muted"><Clans row={r} /></p>}
                <p class="mt-2"><Replay row={r} /></p>
              </li>
            ))}
          </ul>

          {visible.length < rows.length && (
            <div class="mt-4 text-center">
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  setFocusRow(visible.length);
                  setLimit(limit + PAGE);
                }}
              >
                Afficher {fmtInt(Math.min(PAGE, rows.length - visible.length))} de plus
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
