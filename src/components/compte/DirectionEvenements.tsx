/**
 * L'onglet Événements de la Direction : publier un événement ou une série, voir qui vient.
 * Le formulaire et la liste côte à côte ; une ligne serrée par événement, la date d'abord, un trait et un mot en couleur
 * pour ce qui est proche, le nombre de « Je viens » en pastille et les noms à la demande. Les règles (mots, couleurs,
 * écriture de la date) sont dans `src/lib/compte/direction-evenements.ts` ; le dessin dans `global.css`, section
 * « Direction, onglet Événements ».
 */
import { useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { jourEtHeure, proximite, viennentLabel } from "../../lib/compte/direction-evenements";
import { safeUrl, toLocalInput } from "../../lib/compte/news";
import { fmtInt } from "../../lib/format";
import { Problem, focusField, useNow, useRun } from "./common";
import { Pastille } from "./direction-kit";
import type { EventRow } from "./direction-overview";
import { PartieTete } from "./Onglets";

// `repeat` et `weeks` : seulement pour un nouvel événement. Une série crée un événement par semaine, chacun modifiable seul.
export const EMPTY_EVENT = { id: null as number | null, title: "", description: "", url: "", start: "", repeat: false, weeks: "4" };
export type EventDraft = typeof EMPTY_EVENT;
const SERIES_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * « Supprimer » demande une confirmation, sur le même bouton. Il est sur presque chaque ligne : il reste gris et ne passe
 * au rouge que sous la souris, au clavier, ou une fois armé (`global.css`).
 */
function Supprimer({ busy, label, onConfirm }: { busy: boolean; label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="dir-bouton evt-supprimer"
      data-armed={armed ? "" : undefined}
      disabled={busy}
      aria-label={armed ? `Confirmer la suppression de « ${label} »` : `Supprimer « ${label} »`}
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirmer la suppression" : "Supprimer"}
    </button>
  );
}

export default function DirectionEvenements({ rows, attendance, reload, form, setForm }: { rows: EventRow[]; attendance: Map<number, string[]> | null | undefined; reload: () => Promise<void>; form: EventDraft; setForm: (draft: EventDraft) => void }) {
  const empty = EMPTY_EVENT;
  const { busy, error, done, run } = useRun(reload);
  const now = useNow();
  // Les événements dont la liste des noms est dépliée.
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (id: number) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    setOpen(next);
  };

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
    <section class="dir-evenements" aria-labelledby="evt-title" data-testid="direction-events">
      <PartieTete id="evt-title" title="Événements">
        <p>Visibles aussitôt sur l'accueil.</p>
      </PartieTete>
      <div class="evt-plan">
        <form
          class="card evt-form"
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
            <input id="evt-t" class="field dir-champ mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-s" class="text-sm font-semibold">
              Date et heure
            </label>
            <input id="evt-s" class="field dir-champ mt-1" type="datetime-local" required value={form.start} onInput={(e) => setForm({ ...form, start: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-d" class="text-sm font-semibold">
              Description (facultative)
            </label>
            <textarea id="evt-d" class="field dir-champ mt-1" rows={2} maxLength={2000} value={form.description} onInput={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="evt-u" class="field dir-champ mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          {form.id === null && (
            <div class="evt-serie">
              <label class="flex min-h-11 items-center gap-3 font-semibold">
                <input type="checkbox" class="size-5" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.currentTarget.checked })} />
                Répéter chaque semaine
              </label>
              {form.repeat && (
                <div class="evt-semaines">
                  <label for="evt-w" class="text-sm font-semibold">
                    Pendant
                  </label>
                  <select id="evt-w" class="field dir-champ !w-auto" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.currentTarget.value })}>
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
          {/* La zone existe avant de changer : un lecteur d'écran annonce ce qui s'y écrit. */}
          <p class="form-success" role="status" data-testid="direction-event-done">
            {done}
          </p>
        </form>
        {rows.length > 0 && (
          <div class="evt-liste">
            <div class="evt-tete">
              <h3 class="text-lg">À venir</h3>
              <span class="dir-nombre" data-testid="direction-event-count">
                {fmtInt(rows.length)}
              </span>
              {attendance === null && (
                <p class="evt-panne" data-testid="direction-event-unread">
                  <Pastille ton="warn">Réponses « Je viens » non lues</Pastille>
                  <span>Rechargez la page.</span>
                </p>
              )}
            </div>
            <ul class="dir-liste">
              {rows.map((ev) => {
                const names = attendance ? (attendance.get(ev.id) ?? []) : null;
                const near = proximite(ev.starts_at, now);
                const { jour, heure } = jourEtHeure(ev.starts_at, now);
                const url = safeUrl(ev.url);
                const shown = open.has(ev.id) && names !== null && names.length > 0;
                const editing = form.id === ev.id;
                return (
                  <li key={ev.id} class="dir-ligne evt-ligne" data-dir-ton={near?.ton} data-editing={editing ? "" : undefined} data-testid="direction-event">
                    <p class="evt-quand">
                      <span class="evt-jour">{jour}</span>
                      <span class="evt-heure tnum">{heure}</span>
                      {near && (
                        <Pastille ton={near.ton} plain testid="direction-event-near">
                          {near.mot}
                        </Pastille>
                      )}
                    </p>
                    <div class="evt-quoi">
                      <p class="evt-nom">{ev.title}</p>
                      <p class="evt-suite">
                        {names !== null &&
                          (names.length > 0 ? (
                            <button
                              type="button"
                              class="dir-pastille evt-viennent"
                              data-dir-ton="ok"
                              aria-expanded={shown}
                              aria-controls={`evt-noms-${ev.id}`}
                              aria-label={`${viennentLabel(names.length)} à « ${ev.title} » : ${shown ? "masquer" : "voir"} les noms`}
                              data-testid="direction-event-going"
                              onClick={() => toggle(ev.id)}
                            >
                              {viennentLabel(names.length)}
                            </button>
                          ) : (
                            <Pastille ton="muted" plain testid="direction-event-nobody">
                              {viennentLabel(0)}
                            </Pastille>
                          ))}
                        {ev.author && <span class="evt-auteur">par {ev.author}</span>}
                        {url && (
                          <a class="evt-lien" href={url} rel="noopener noreferrer" aria-label={`Lien de « ${ev.title} »`}>
                            Lien
                          </a>
                        )}
                      </p>
                    </div>
                    {ev.editable && (
                      <div class="evt-actions">
                        <button
                          type="button"
                          class="dir-bouton evt-modifier"
                          disabled={busy}
                          aria-pressed={editing}
                          aria-label={`Modifier « ${ev.title} »`}
                          onClick={() => {
                            setForm({ ...EMPTY_EVENT, id: ev.id, title: ev.title, description: ev.description ?? "", url: ev.url ?? "", start: toLocalInput(ev.starts_at) });
                            focusField("evt-t");
                          }}
                        >
                          Modifier
                        </button>
                        <Supprimer busy={busy} label={ev.title} onConfirm={() => void run(() => call("delete_event", { p_id: ev.id }), "Événement supprimé.")} />
                      </div>
                    )}
                    {/* Le cadre existe toujours : le bouton le désigne (`aria-controls`) même replié. */}
                    <p class="evt-noms" id={`evt-noms-${ev.id}`} hidden={!shown} data-testid="direction-event-names">
                      {shown && names.join(", ")}
                    </p>
                  </li>
                );
              })}
            </ul>
            <details class="fold evt-aide">
              <summary class="font-semibold">Comment lire cette liste</summary>
              <div class="grid gap-3 pb-1 text-muted">
                <p>Jaune : aujourd'hui. Bleu : demain. Gris : dans la semaine. Vert : des membres ont répondu « Je viens » ; un clic montre leurs noms.</p>
                <p>Les dates et les heures sont celles de Paris. Une série crée un événement par semaine : chacun se modifie ou se supprime seul.</p>
                <p>« Modifier » et « Supprimer » n'apparaissent que sur vos événements, ou sur tous pour un admin. Le serveur revérifie chaque changement.</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
