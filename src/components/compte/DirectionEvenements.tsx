/** L'onglet Événements de la Direction : publier un événement ou une série, voir qui vient. */
import { call } from "../../lib/compte/api";
import { toLocalInput } from "../../lib/compte/news";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { DeleteButton, Problem, Success, focusField, useRun } from "./common";
import type { EventRow } from "./direction-overview";
import { PartieTete } from "./Onglets";

// `repeat` et `weeks` : seulement pour un nouvel événement. Une série crée un événement par semaine, chacun modifiable seul.
export const EMPTY_EVENT = { id: null as number | null, title: "", description: "", url: "", start: "", repeat: false, weeks: "4" };
export type EventDraft = typeof EMPTY_EVENT;
const SERIES_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function DirectionEvenements({ rows, attendance, reload, form, setForm }: { rows: EventRow[]; attendance: Map<number, string[]> | null | undefined; reload: () => Promise<void>; form: EventDraft; setForm: (draft: EventDraft) => void }) {
  const empty = EMPTY_EVENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const start = form.start ? new Date(form.start).toISOString() : null;
    const series = form.id === null && form.repeat;
    const ok = series
      ? await run(
          () => call("save_event_series", { p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start, p_weeks: Number(form.weeks) }),
          `${form.weeks} événements publiés, un par semaine. L'accueil ne montre que le prochain.`,
        )
      : await run(
          () => call("save_event", { p_id: form.id, p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start }),
          form.id ? "Événement modifié." : "Événement publié : il est visible sur l'accueil.",
        );
    if (ok) setForm(empty);
  };

  return (
    <section aria-labelledby="evt-title" data-testid="direction-events">
      <PartieTete id="evt-title" title="Événements">
        <p>Visibles aussitôt sur l'accueil.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 class="text-lg">{form.id ? "Modifier l'événement" : "Nouvel événement"}</h3>
          <div>
            <label for="evt-t" class="text-sm font-semibold">
              Nom de l'événement
            </label>
            <input id="evt-t" class="field mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-s" class="text-sm font-semibold">
              Date et heure
            </label>
            <input id="evt-s" class="field mt-1" type="datetime-local" required value={form.start} onInput={(e) => setForm({ ...form, start: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-d" class="text-sm font-semibold">
              Description (facultative)
            </label>
            <textarea id="evt-d" class="field mt-1" rows={3} maxLength={2000} value={form.description} onInput={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="evt-u" class="field mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          {form.id === null && (
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
              <label class="flex min-h-11 items-center gap-3 font-semibold">
                <input type="checkbox" class="size-5" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.currentTarget.checked })} />
                Répéter chaque semaine
              </label>
              {form.repeat && (
                <div>
                  <label for="evt-w" class="text-sm font-semibold">
                    Pendant
                  </label>
                  <select id="evt-w" class="field mt-1 !w-auto" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.currentTarget.value })}>
                    {SERIES_WEEKS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n} semaines
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {form.id ? "Enregistrer" : form.repeat ? `Publier ${form.weeks} événements` : "Publier l'événement"}
            </button>
            {form.id && (
              <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
                Annuler
              </button>
            )}
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
        {rows.length > 0 && (
          <div>
            <h3 class="text-lg">À venir</h3>
            {attendance === null && <p class="mt-2 text-warn">Les réponses « Je viens » n'ont pas pu être lues : rechargez la page.</p>}
            <ul class="mt-3 grid gap-3">
              {rows.map((ev) => {
                const names = attendance?.get(ev.id) ?? [];
                return (
                  <li key={ev.id} class="card p-5" data-testid="direction-event">
                    <p class="font-semibold [overflow-wrap:anywhere]">{ev.title}</p>
                    <p class="tnum mt-1 text-sm text-muted">
                      {fmtDateTime(ev.starts_at)}
                      {ev.author ? ` · ${ev.author}` : ""}
                    </p>
                    {names.length > 0 && (
                      <p class="mt-2" data-testid="direction-event-going">
                        {names.length === 1 ? "1 vient" : `${fmtInt(names.length)} viennent`} : {names.join(", ")}
                      </p>
                    )}
                    {ev.editable && (
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
                          disabled={busy}
                          aria-label={`Modifier « ${ev.title} »`}
                          onClick={() => {
                            setForm({ ...EMPTY_EVENT, id: ev.id, title: ev.title, description: ev.description ?? "", url: ev.url ?? "", start: toLocalInput(ev.starts_at) });
                            focusField("evt-t");
                          }}
                        >
                          Modifier
                        </button>
                        <DeleteButton busy={busy} label={ev.title} onConfirm={() => void run(() => call("delete_event", { p_id: ev.id }), "Événement supprimé.")} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
