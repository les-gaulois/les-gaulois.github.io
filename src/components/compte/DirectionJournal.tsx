/** L'onglet Journal de la Direction, réservé aux admins et au fondateur. */
import { useEffect, useRef, useState } from "preact/hooks";
import { LOG_CATEGORIES, LOG_LIMIT, LOG_PAGE, categoryOf, describe, fmtLogDay, groupByDay, logCounts, matchesLogSearch, toneOf, type LogCategory } from "../../lib/compte/admin-log";
import type { LogRow } from "../../lib/compte/types";
import { fmtCount, fmtDateTime, fmtEpochTime, fmtInt } from "../../lib/format";
import { useList } from "./AdminPanels";
import { Empty, Loading, Problem } from "./common";
import { Pastille, useBarreCollante } from "./direction-kit";
import { PartieTete } from "./Onglets";

const ONE: Record<LogCategory, string> = Object.fromEntries(LOG_CATEGORIES.map((c) => [c.id, c.one])) as Record<LogCategory, string>;

/**
 * Le journal en phrases, rangé par jour : l'heure, le type d'action à sa couleur, puis la phrase. La barre (recherche à
 * chaque lettre, un filtre par type avec son nombre) reste sous l'en-tête du site. Le serveur garde les codes ; les phrases,
 * les types et les couleurs sont dans `src/lib/compte/admin-log.ts`.
 */
export default function DirectionJournal() {
  const list = useList<LogRow>("list_admin_log", { p_limit: LOG_LIMIT });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LogCategory | null>(null);
  const [shown, setShown] = useState(LOG_PAGE);
  const { root, bar } = useBarreCollante<HTMLElement>();
  const top = useRef<HTMLDivElement>(null);

  const rows = list.rows ?? [];
  const typed = search.trim();
  // La recherche lit la phrase écrite à l'écran : le nom de qui agit, de qui est visé, et ce qui est fait.
  const lines = rows.map((row) => ({ row, line: describe(row, fmtDateTime) }));
  const found = lines.filter((l) => matchesLogSearch(l.line, typed));
  // Les nombres des filtres suivent la recherche. « Autres » ne s'offre que si le journal en contient.
  const counts = logCounts(found.map((l) => l.row));
  const withOther = rows.some((row) => categoryOf(row.action) === "other");
  const visible = category === null ? found : found.filter((l) => categoryOf(l.row.action) === category);
  const days = groupByDay(visible.slice(0, shown).map((l) => ({ ...l, at: l.row.at })));
  const narrowed = typed !== "" || category !== null;
  const showAll = () => {
    setSearch("");
    setCategory(null);
    setShown(LOG_PAGE);
  };

  // Un filtre choisi plus bas dans la page raccourcit la liste : la page revient au début de la liste, sans mouvement.
  useEffect(() => {
    const mark = top.current;
    if (!mark) return;
    const header = document.querySelector<HTMLElement>("header.barre");
    const gap = mark.getBoundingClientRect().top - (header?.offsetHeight ?? 0);
    // « instant » : sinon, le `scroll-behavior: smooth` de la page ferait glisser la liste à chaque lettre tapée.
    if (gap < 0) window.scrollBy({ top: gap, behavior: "instant" });
  }, [category, typed]);

  return (
    <section ref={root} class="dir-journal" aria-labelledby="journal-titre" data-testid="admin-log">
      <PartieTete id="journal-titre" title="Journal" />
      {/* Toujours présente : un lecteur d'écran annonce ce qui change dans une zone qui existait déjà (WCAG 4.1.3). */}
      <p class="sr-only" role="status" data-testid="log-count">
        {list.rows === null || rows.length === 0 ? "" : `${fmtCount(visible.length, "entrée")}${narrowed ? " pour ce choix" : ""}.`}
      </p>
      <div ref={top} />
      {/* La barre existe dès le début, pour que sa hauteur soit mesurée ; elle ne se montre qu'avec un journal à filtrer. */}
      <div ref={bar} class="dir-outils" hidden={rows.length === 0}>
        <form class="dir-recherche" role="search" onSubmit={(e) => e.preventDefault()}>
          <label class="sr-only" for="log-search">
            Rechercher dans le journal
          </label>
          <input
            id="log-search"
            class="field dir-champ"
            type="search"
            placeholder="Rechercher"
            autocomplete="off"
            data-testid="log-search"
            value={search}
            onInput={(e) => {
              setSearch(e.currentTarget.value);
              setShown(LOG_PAGE);
            }}
          />
        </form>
        <div class="dir-filtres" role="group" aria-label="Filtrer par type d'action">
          {[{ id: null, label: "Tout" }, ...LOG_CATEGORIES.filter((c) => c.id !== "other" || withOther)].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              class="dir-filtre"
              data-testid="log-filter"
              data-filter={c.id ?? "all"}
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setShown(LOG_PAGE);
              }}
            >
              {c.label} <span class="dir-nombre">{fmtInt(c.id === null ? found.length : counts[c.id])}</span>
            </button>
          ))}
        </div>
      </div>
      {rows.length >= LOG_LIMIT && (
        <p class="dir-note" data-testid="log-cut">
          Seules les {fmtInt(LOG_LIMIT)} dernières entrées sont lues.
        </p>
      )}
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
      ) : visible.length === 0 ? (
        <div class="dir-journal-vide" data-testid="log-empty">
          <p>Aucune entrée pour ce choix.</p>
          <button type="button" class="dir-bouton" onClick={showAll}>
            Tout montrer
          </button>
        </div>
      ) : (
        <>
          {days.map((d) => (
            <section key={d.day} class="dir-journal-jour" aria-labelledby={`journal-jour-${d.day}`}>
              <h3 id={`journal-jour-${d.day}`} class="dir-journal-date">
                {fmtLogDay(d.day)}
              </h3>
              <ol class="dir-liste">
                {d.rows.map(({ row, line }) => (
                  <li key={row.id} class="dir-ligne dir-journal-ligne" data-dir-ton={toneOf(row)} data-testid="log-row">
                    <time class="dir-journal-heure tnum" dateTime={row.at}>
                      {fmtEpochTime(Date.parse(row.at) / 1000)}
                    </time>
                    <span class="dir-journal-type">
                      <Pastille ton={toneOf(row)}>{ONE[categoryOf(row.action)]}</Pastille>
                    </span>
                    <p class="dir-journal-phrase">
                      <strong>{line.who}</strong> {line.what}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {visible.length > shown && (
            <div class="dir-journal-suite">
              <button type="button" class="dir-bouton" data-testid="log-more" onClick={() => setShown(shown + LOG_PAGE)}>
                Afficher {fmtInt(Math.min(LOG_PAGE, visible.length - shown))} de plus
              </button>
              <span class="tnum">
                {fmtInt(shown)} sur {fmtInt(visible.length)}
              </span>
            </div>
          )}
        </>
      )}
      {rows.length > 0 && (
        <details class="fold mt-4">
          <summary class="font-semibold">Comment lire ce journal</summary>
          <div class="grid gap-3 pb-1 text-muted">
            <p>Vert : accepté ou rétabli. Rouge : refusé, suspendu, ou message Discord qui n'a pas pu partir. Jaune : quelqu'un attend une suite. Bleu : un rôle. Gris : le reste.</p>
            {LOG_CATEGORIES.filter((c) => c.help !== null).map((c) => (
              <p key={c.id}>
                {c.label} : {c.help}.
              </p>
            ))}
            <p>La recherche lit toute la phrase : un nom, un titre, un mot. Les heures sont celles de Paris.</p>
          </div>
        </details>
      )}
    </section>
  );
}
