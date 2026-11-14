import { useCallback, useEffect, useState } from "preact/hooks";
import { othersLabel, type QgEvent } from "../../lib/compte/qg";
import { AGENDA_FILTERS_FROM, agendaDate, agendaHold, agendaMine, agendaSeries, agendaShown, agendaWhen, type AgendaFilter } from "../../lib/compte/qg-evenements";
import { fmtInt } from "../../lib/format";
import { Avatar, Problem } from "./common";
import { Pastille, useBarreCollante } from "./direction-kit";
import { PartieTete } from "./Onglets";

/** Les visages montrés en petit sur la ligne ; tous sont nommés dans « Détails ». */
const FACES_SHOWN = 4;

/**
 * « Événements » : ceux que l'encadrement annonce, à venir, en agenda. Une ligne par événement : le jour et l'heure de
 * Paris en colonne, le titre, quand c'est en pastille, ceux qui viennent, et « Je viens ». La description, le lien, la
 * série et les noms sont repliés sous « Détails ». Les visages sont ceux des membres qui se montrent sur le mur, les
 * autres sont seulement comptés. Le serveur revérifie (`set_attendance`).
 * `problemAt` : le refus du serveur pour un événement (`event-<id>`), affiché sous lui.
 */
export default function QgEvenements({
  events,
  now,
  busy,
  problemAt,
  onAnswer,
}: {
  events: QgEvent[];
  now: Date;
  busy: boolean;
  problemAt: (at: string) => string | null;
  onAnswer: (event: number, going: boolean) => void;
}) {
  const [chosen, setChosen] = useState<AgendaFilter>("all");
  // Sous le filtre « Je viens », une présence retirée garde sa ligne : le bouton qu'on vient d'actionner ne disparaît pas.
  const [held, setHeld] = useState<readonly number[]>([]);
  const filters = events.length >= AGENDA_FILTERS_FROM;
  const filter: AgendaFilter = filters ? chosen : "all";
  const shown = agendaShown(events, filter, held);
  const choose = (next: AgendaFilter) => {
    setChosen(next);
    setHeld([]);
  };
  // La barre disparaît sous six événements : revenue, elle repart de « Tous », sans ligne gardée d'avant.
  useEffect(() => {
    if (filters) return;
    setChosen("all");
    setHeld((ids) => (ids.length > 0 ? [] : ids));
  }, [filters]);
  const at = now.getTime();

  return (
    <section class="qg-evenements" aria-labelledby="evenements-titre" data-testid="qg-events">
      <PartieTete id="evenements-titre" title="Événements à venir" />
      {filters && <Filtres total={events.length} mine={agendaMine(events)} filter={filter} onChoose={choose} />}
      <ul class="dir-liste" data-testid="qg-events-list">
        {shown.map((event) => {
          const date = agendaDate(event.starts_at, at);
          const when = agendaWhen(event.starts_at, at);
          const series = agendaSeries(event.series);
          const count = othersLabel(event.going, 0);
          const others = othersLabel(event.going, event.faces.length);
          const details = Boolean(event.description || event.url || series || event.faces.length > 0);
          // Le titre porte aussi le jour et l'heure pour les lecteurs d'écran (la colonne de la date leur est cachée, pour ne
          // pas la lire deux fois) : on l'entend en sautant de titre en titre, et il décrit « Détails » et « Je viens » de sa ligne.
          const titleId = `qg-evenement-${event.id}-titre`;
          return (
            <li key={event.id} class="dir-ligne qg-evenements-ligne" data-dir-ton={event.mine ? "ok" : undefined} data-testid="qg-event">
              {date && (
                <time class="qg-evenements-date tnum" dateTime={event.starts_at} aria-hidden="true" data-testid="qg-event-date">
                  <span class="qg-evenements-jour">{date.day}</span> <span class="qg-evenements-heure">{date.time}</span>
                </time>
              )}
              <div class="qg-evenements-corps">
                <div class="qg-evenements-titre">
                  <h3 id={titleId} class="text-lg [overflow-wrap:anywhere]">
                    {event.title}
                    {date && <span class="sr-only">{` (${date.day} à ${date.time})`}</span>}
                  </h3>
                  {when && (
                    <Pastille ton={when.ton} testid="qg-event-when">
                      {when.label}
                    </Pastille>
                  )}
                  {series && (
                    <Pastille ton="ally" plain testid="qg-event-series">
                      Se répète
                    </Pastille>
                  )}
                </div>
                {details && (
                  <details class="fold qg-evenements-plus" data-testid="qg-event-details">
                    <summary aria-describedby={titleId}>Détails</summary>
                    <div class="qg-evenements-detail">
                      {event.description && <p class="whitespace-pre-line [overflow-wrap:anywhere]">{event.description}</p>}
                      {event.url && (
                        <p>
                          <a href={event.url} rel="noopener" class="text-blue-text underline">
                            En savoir plus
                          </a>
                        </p>
                      )}
                      {series && <p class="tnum text-muted">{series}</p>}
                      {event.faces.length > 0 && (
                        <ul class="qg-evenements-noms" aria-label="Ils viennent" data-testid="qg-event-faces">
                          {event.faces.map((face, i) => (
                            <li key={i}>
                              <Avatar name={face.name} avatar={face.avatar} />
                              <span class="[overflow-wrap:anywhere]">{face.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {event.faces.length > 0 && others && <p class="tnum text-muted">{others}</p>}
                    </div>
                  </details>
                )}
              </div>
              {count && (
                <p class="qg-evenements-venus" data-testid="qg-event-count">
                  {event.faces.length > 0 && (
                    <span class="qg-evenements-visages" aria-hidden="true">
                      {event.faces.slice(0, FACES_SHOWN).map((face, i) => (
                        <Avatar key={i} name={face.name} avatar={face.avatar} />
                      ))}
                    </span>
                  )}
                  <span class="tnum">{count}</span>
                </p>
              )}
              {/* Pas de `disabled` pendant l'envoi : un bouton désactivé perd le focus du clavier. */}
              <button
                type="button"
                class="dir-filtre qg-evenements-viens"
                data-dir-ton={event.mine ? "ok" : undefined}
                aria-pressed={event.mine}
                aria-disabled={busy || undefined}
                aria-describedby={titleId}
                onClick={() => {
                  if (busy) return;
                  setHeld((ids) => agendaHold(ids, event, filter));
                  onAnswer(event.id, !event.mine);
                }}
                data-testid="qg-going"
              >
                Je viens
              </button>
              <div class="qg-evenements-refus">
                <Problem message={problemAt(`event-${event.id}`)} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * La barre des filtres, collée sous l'en-tête du site. Elle n'est montée que lorsqu'elle paraît : `useBarreCollante` ne
 * mesure qu'à son montage, et des filtres arrivés en cours de visite (5, puis 6 événements) garderaient sinon une hauteur
 * d'en-tête devinée. Les mesures se posent sur la barre elle-même, la seule à s'en servir ici.
 */
function Filtres({ total, mine, filter, onChoose }: { total: number; mine: number; filter: AgendaFilter; onChoose: (next: AgendaFilter) => void }) {
  const { root, bar } = useBarreCollante<HTMLDivElement>();
  const lier = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      bar.current = el;
    },
    [root, bar],
  );
  return (
    <div ref={lier} class="dir-outils" data-testid="qg-events-filters">
      <div class="dir-filtres" role="group" aria-label="Filtrer les événements">
        <button type="button" class="dir-filtre" aria-pressed={filter === "all"} onClick={() => onChoose("all")} data-testid="qg-events-filter-all">
          Tous <span class="dir-nombre tnum">{fmtInt(total)}</span>
        </button>
        <button type="button" class="dir-filtre" data-dir-ton="ok" aria-pressed={filter === "mine"} onClick={() => onChoose("mine")} data-testid="qg-events-filter-mine">
          Je viens <span class="dir-nombre tnum">{fmtInt(mine)}</span>
        </button>
      </div>
    </div>
  );
}
