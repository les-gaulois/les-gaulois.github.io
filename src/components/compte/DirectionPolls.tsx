import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, cleanOptions, fmtVotes, pollProblem, pollRows, validPollTotals } from "../../lib/compte/polls";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { DeleteButton, Loading, Problem, Success, messageOf, useRun } from "./common";

interface PollRow {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  created_at: string;
  closes_at: string | null;
  closed_at: string | null;
  is_open: boolean;
  author: string | null;
  editable: boolean;
}

export const EMPTY_POLL = { question: "", options: ["", ""], closes: "" };
export type PollDraft = typeof EMPTY_POLL;

function status(poll: PollRow): string {
  if (poll.is_open) return poll.closes_at ? `Ouvert jusqu'au ${fmtDateTime(poll.closes_at)}` : "Ouvert, sans date de fin";
  const end = poll.closed_at ?? poll.closes_at;
  return end ? `Fermé le ${fmtDateTime(end)}` : "Fermé";
}

/**
 * Les sondages du clan : la Direction les lance, les ferme ou les supprime ; les membres validés votent au QG.
 * Le serveur vérifie tout (`save_poll`, `close_poll`, `delete_poll`) et ne donne jamais qui a voté quoi.
 * Le brouillon est gardé par l'espace Direction : un aller-retour en vue joueur ne l'efface pas.
 */
export default function DirectionPolls({ form, setForm }: { form: PollDraft; setForm: (draft: PollDraft) => void }) {
  const [polls, setPolls] = useState<PollRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    try {
      setPolls((await call<{ rows: PollRow[] }>("list_polls")).rows);
      setLoadError(null);
    } catch (e) {
      setLoadError(messageOf(e));
    }
  };
  const { busy, error, done, run } = useRun(load);

  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    const issue = pollProblem(form.question, form.options);
    setProblem(issue);
    if (issue) return;
    const ok = await run(
      () => call("save_poll", { p_question: form.question.trim(), p_options: cleanOptions(form.options), p_closes_at: form.closes ? new Date(form.closes).toISOString() : null }),
      "Sondage lancé : il est au QG, et les membres validés peuvent voter.",
    );
    if (ok) setForm(EMPTY_POLL);
  };

  const setOption = (index: number, value: string) => setForm({ ...form, options: form.options.map((o, i) => (i === index ? value : o)) });

  return (
    <section class="card p-5" aria-labelledby="polls-title" data-testid="direction-polls">
      <h2 id="polls-title" class="text-xl">
        Sondages
      </h2>
      <p class="mt-2 text-sm text-muted">Les membres validés votent au QG, une voix chacun, qu'ils peuvent changer tant que le sondage est ouvert. Seuls les membres validés voient les totaux ; personne ne voit qui a voté quoi. Trois sondages ouverts au plus.</p>
      <form
        class="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div>
          <label for="poll-q" class="text-sm font-semibold">
            Question
          </label>
          <input id="poll-q" class="field mt-1" required maxLength={POLL_QUESTION_MAX} value={form.question} onInput={(e) => setForm({ ...form, question: e.currentTarget.value })} />
        </div>
        <fieldset class="grid gap-2">
          <legend class="text-sm font-semibold">
            Choix ({POLL_MIN_OPTIONS} à {POLL_MAX_OPTIONS})
          </legend>
          {form.options.map((option, i) => (
            <div key={i} class="flex gap-2">
              <input class="field" aria-label={`Choix ${i + 1}`} maxLength={POLL_OPTION_MAX} value={option} onInput={(e) => setOption(i, e.currentTarget.value)} />
              {form.options.length > POLL_MIN_OPTIONS && (
                <button type="button" class="chip !min-h-11 shrink-0" aria-label={`Retirer le choix ${i + 1}`} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                  Retirer
                </button>
              )}
            </div>
          ))}
          {form.options.length < POLL_MAX_OPTIONS && (
            <div>
              <button type="button" class="chip !min-h-10" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                Ajouter un choix
              </button>
            </div>
          )}
        </fieldset>
        <div>
          <label for="poll-end" class="text-sm font-semibold">
            Fin du vote (facultative, dans les 90 jours)
          </label>
          <input id="poll-end" class="field mt-1" type="datetime-local" value={form.closes} onInput={(e) => setForm({ ...form, closes: e.currentTarget.value })} />
        </div>
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy}>
            Lancer le sondage
          </button>
        </div>
      </form>
      <Problem message={problem ?? error} />
      {done && <Success message={done} />}
      <Problem message={loadError} onRetry={() => void load()} />
      {polls === null ? (
        !loadError && <Loading />
      ) : (
        polls.length > 0 && (
          <ul class="mt-5 grid gap-4">
            {polls.map((poll) => {
              // Un total absent n'est pas zéro : sans totaux lisibles, pas de résultat du tout.
              const readable = validPollTotals(poll);
              const { rows, total } = readable ? pollRows(poll) : { rows: [], total: 0 };
              return (
                <li key={poll.id} class="border-t border-line pt-3" data-testid="direction-poll">
                  <p class="font-semibold">{poll.question}</p>
                  <p class="tnum text-xs text-muted">
                    {status(poll)}
                    {readable ? ` · ${fmtVotes(total)}` : ""}
                    {poll.author ? ` · ${poll.author}` : ""}
                  </p>
                  {!readable && <p class="mt-2 text-sm text-warn">Les totaux de ce sondage n'ont pas pu être lus. Rechargez la page.</p>}
                  <ul class="mt-2 grid gap-2">
                    {rows.map((row, i) => (
                      <li key={i}>
                        <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span>{row.label}</span>
                          <span class="tnum text-muted">
                            {fmtVotes(row.count)}
                            {row.share !== null ? ` · ${fmtInt(row.share)} %` : ""}
                          </span>
                        </div>
                        <div class="meter mt-1" aria-hidden="true">
                          <i style={{ "--v": `${row.share ?? 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  {poll.editable && (
                    <div class="mt-3 flex flex-wrap gap-2">
                      {poll.is_open && (
                        <button type="button" class="btn btn-secondary btn-sm" disabled={busy} aria-label={`Fermer le sondage « ${poll.question} »`} onClick={() => void run(() => call("close_poll", { p_id: poll.id }), "Sondage fermé : son résultat reste au QG, dans les décisions passées.")}>
                          Fermer
                        </button>
                      )}
                      <DeleteButton busy={busy} label={poll.question} onConfirm={() => void run(() => call("delete_poll", { p_id: poll.id }), "Sondage supprimé, avec ses votes.")} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </section>
  );
}
