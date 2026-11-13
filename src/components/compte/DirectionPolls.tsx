import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { POLLS_LIMIT, POLLS_OPEN_MAX, POLL_FILTERS, inPollFilter, openPollCount, pollEnd, pollFilterCounts, pollResult, type DirectionPoll, type PollFilter } from "../../lib/compte/direction-sondages";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, cleanOptions, fmtVotes, pollProblem } from "../../lib/compte/polls";
import { fmtCount, fmtDateTime, fmtInt } from "../../lib/format";
import { Loading, Problem, Success, messageOf, useRun } from "./common";
import { Pastille, useBarreCollante } from "./direction-kit";
import { PartieTete } from "./Onglets";

export const EMPTY_POLL = { question: "", options: ["", ""], closes: "" };
export type PollDraft = typeof EMPTY_POLL;

/** Ce qui suit la pastille : jusqu'à quand le vote est ouvert, ou quand il a été fermé. */
function whenOf(poll: DirectionPoll): string | null {
  const end = pollEnd(poll);
  if (poll.is_open) return end ? `jusqu'au ${fmtDateTime(end)}` : "sans date de fin";
  return end ? `le ${fmtDateTime(end)}` : null;
}

/**
 * Supprimer efface le sondage et ses votes : le bouton demande une confirmation, au même endroit, et se désarme dès qu'on
 * le quitte. Gris au repos, comme « Suspendre » dans l'onglet Comptes : le rouge ne vient que sous la souris ou au clavier.
 */
function Supprimer({ busy, label, onConfirm }: { busy: boolean; label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="dir-bouton"
      data-survol="danger"
      data-arme={armed ? "" : undefined}
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

/** Un sondage de la liste : son état en pastille, ses résultats en barres, le choix en tête repéré. */
function Sondage({ poll, busy, onClose, onDelete }: { poll: DirectionPoll; busy: boolean; onClose: () => void; onDelete: () => void }) {
  // Un total absent n'est pas zéro : sans totaux lisibles, pas de résultat du tout.
  const result = pollResult(poll);
  const when = whenOf(poll);
  return (
    <li class="dir-sondage" data-dir-ton={!result ? "warn" : poll.is_open ? "ok" : "muted"} data-testid="direction-poll">
      <div class="dir-sondage-tete">
        <p class="dir-sondage-question">{poll.question}</p>
        {poll.editable && (
          <div class="dir-sondage-actions">
            {poll.is_open && (
              <button type="button" class="dir-bouton" data-survol="warn" disabled={busy} aria-label={`Fermer le sondage « ${poll.question} »`} onClick={onClose}>
                Fermer
              </button>
            )}
            <Supprimer busy={busy} label={poll.question} onConfirm={onDelete} />
          </div>
        )}
      </div>
      <p class="dir-sondage-etat">
        <Pastille ton={poll.is_open ? "ok" : "muted"} testid="direction-poll-state">
          {poll.is_open ? "Ouvert" : "Fermé"}
        </Pastille>
        {when && <span>{when}</span>}
        {result && <span class="dir-sondage-total">{fmtVotes(result.total)}</span>}
        {poll.author && <span class="dir-sondage-auteur">par {poll.author}</span>}
      </p>
      {!result ? (
        <p class="dir-sondage-illisible">
          <Pastille ton="warn" plain>
            Totaux illisibles
          </Pastille>
          <span>Rechargez la page.</span>
        </p>
      ) : result.total === 0 ? (
        // Personne n'a voté : pas de barres vides, les choix sur une ligne.
        <p class="dir-sondage-sans-voix">Choix : {result.rows.map((row) => row.label).join(" · ")}</p>
      ) : (
        <ul class="dir-sondage-choix">
          {result.rows.map((row, i) => (
            <li key={i} data-tete={row.lead ? "" : undefined}>
              <span class="dir-sondage-nom">
                {row.label}
                {row.lead && (
                  <>
                    {" "}
                    <Pastille ton={result.tie ? "warn" : "ok"} plain testid="direction-poll-lead">
                      {result.tie ? "Égalité" : "En tête"}
                    </Pastille>
                  </>
                )}
              </span>
              <span class="meter dir-sondage-barre" aria-hidden="true">
                <i style={{ "--v": `${row.share ?? 0}%` }} />
              </span>
              <span class="tnum dir-sondage-voix">{fmtVotes(row.count)}</span>
              <span class="tnum dir-sondage-part">{row.share !== null ? `${fmtInt(row.share)} %` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Les sondages du clan : la Direction les lance, les ferme ou les supprime ; les membres validés votent au QG.
 * Le serveur vérifie tout (`save_poll`, `close_poll`, `delete_poll`) et ne donne jamais qui a voté quoi.
 * Le brouillon est gardé par l'espace Direction : un aller-retour en vue joueur ne l'efface pas.
 *
 * Le 14 novembre 2026, l'onglet a été refait « comme pour la section compte » : le formulaire à gauche, la liste à droite,
 * une couleur et un mot par état. Les règles sont dans `src/lib/compte/direction-sondages.ts`, le dessin dans `global.css`,
 * section « Direction, onglet Sondages », sous la classe `dir-sondages`.
 */
export default function DirectionPolls({ form, setForm }: { form: PollDraft; setForm: (draft: PollDraft) => void }) {
  const [polls, setPolls] = useState<DirectionPoll[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<PollFilter>("all");
  // D'où vient la dernière action : son résultat s'écrit près d'elle, sous le formulaire ou au-dessus de la liste.
  const [where, setWhere] = useState<"form" | "list">("form");
  const { root, bar } = useBarreCollante<HTMLElement>();

  const load = async () => {
    try {
      setPolls((await call<{ rows: DirectionPoll[] }>("list_polls")).rows);
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
    setWhere("form");
    const ok = await run(
      () => call("save_poll", { p_question: form.question.trim(), p_options: cleanOptions(form.options), p_closes_at: form.closes ? new Date(form.closes).toISOString() : null }),
      "Sondage lancé : il est au QG, et les membres validés peuvent voter.",
    );
    if (ok) setForm(EMPTY_POLL);
  };

  // Fermer ou supprimer retire le bouton sur lequel on était : le focus va au résultat, au-dessus de la liste.
  const act = async (action: () => Promise<unknown>, success: string) => {
    setWhere("list");
    await run(action, success);
    document.getElementById("polls-done")?.focus();
  };

  const setOption = (index: number, value: string) => setForm({ ...form, options: form.options.map((o, i) => (i === index ? value : o)) });

  const counts = pollFilterCounts(polls ?? []);
  const visible = (polls ?? []).filter((poll) => inPollFilter(poll, filter));
  const open = polls ? openPollCount(polls) : null;
  const full = open !== null && open >= POLLS_OPEN_MAX;

  return (
    <section ref={root} class="dir-sondages" aria-labelledby="polls-title" data-testid="direction-polls">
      <PartieTete id="polls-title" title="Sondages" />
      <div class="dir-sondages-plan">
        <form
          class="card dir-sondages-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div class="dir-sondages-form-tete">
            <h3 class="text-lg">Nouveau sondage</h3>
            {open !== null && (
              <Pastille ton={full ? "warn" : "ok"} testid="direction-polls-open">
                {open} ouvert{open > 1 ? "s" : ""} sur {POLLS_OPEN_MAX}
              </Pastille>
            )}
          </div>
          {full && <p class="dir-sondages-plein">Fermez-en un pour en lancer un autre.</p>}
          <div>
            <label for="poll-q">Question</label>
            <input id="poll-q" class="field dir-champ" required maxLength={POLL_QUESTION_MAX} value={form.question} onInput={(e) => setForm({ ...form, question: e.currentTarget.value })} />
          </div>
          <fieldset class="dir-sondages-choix">
            <legend>
              Choix <span class="dir-sondages-aide-champ">de {POLL_MIN_OPTIONS} à {POLL_MAX_OPTIONS}</span>
            </legend>
            {form.options.map((option, i) => (
              <div key={i} class="dir-sondages-choix-ligne">
                <input class="field dir-champ" aria-label={`Choix ${i + 1}`} maxLength={POLL_OPTION_MAX} value={option} onInput={(e) => setOption(i, e.currentTarget.value)} />
                {form.options.length > POLL_MIN_OPTIONS && (
                  <button type="button" class="dir-bouton" aria-label={`Retirer le choix ${i + 1}`} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                    Retirer
                  </button>
                )}
              </div>
            ))}
            {form.options.length < POLL_MAX_OPTIONS && (
              <div>
                <button type="button" class="dir-bouton" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
                  Ajouter un choix
                </button>
              </div>
            )}
          </fieldset>
          <div>
            <label for="poll-end">
              Fin du vote <span class="dir-sondages-aide-champ">facultative, dans les 90 jours</span>
            </label>
            <input id="poll-end" class="field dir-champ" type="datetime-local" value={form.closes} onInput={(e) => setForm({ ...form, closes: e.currentTarget.value })} />
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy}>
              Lancer le sondage
            </button>
          </div>
          <Problem message={problem ?? (where === "form" ? error : null)} />
          <Success message={where === "form" ? done : null} />
        </form>
        {/* Une liste vide n'est pas affichée : le formulaire reste seul. */}
        {(polls === null || polls.length > 0 || loadError) && (
          <div class="dir-sondages-suivi">
            {/* Elle dit combien de sondages restent après un filtre (WCAG 4.1.3). */}
            <p class="sr-only" role="status">
              {polls !== null && filter !== "all" ? `${fmtCount(visible.length, "sondage")} pour ce choix.` : ""}
            </p>
            {polls !== null && polls.length > 0 && (
              <div ref={bar} class="dir-outils">
                <div class="dir-filtres" role="group" aria-label="Filtrer les sondages">
                  {POLL_FILTERS.map((f) => (
                    <button key={f.id} type="button" class="dir-filtre" data-dir-ton={f.ton} aria-pressed={filter === f.id} data-testid={`direction-polls-filter-${f.id}`} onClick={() => setFilter(f.id)}>
                      {f.label} <span class="dir-nombre tnum">{fmtInt(counts[f.id])}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Problem message={loadError} onRetry={() => void load()} />
            <div id="polls-done" tabIndex={-1}>
              <Problem message={where === "list" ? error : null} />
              <Success message={where === "list" ? done : null} />
            </div>
            {polls === null ? (
              !loadError && <Loading />
            ) : (
              <>
                <ul class="dir-liste dir-sondages-liste" aria-label="Sondages lancés depuis le site">
                  {visible.map((poll) => (
                    <Sondage
                      key={poll.id}
                      poll={poll}
                      busy={busy}
                      onClose={() => void act(() => call("close_poll", { p_id: poll.id }), "Sondage fermé : son résultat reste au QG, dans les décisions passées.")}
                      onDelete={() => void act(() => call("delete_poll", { p_id: poll.id }), "Sondage supprimé, avec ses votes.")}
                    />
                  ))}
                </ul>
                {visible.length === 0 && polls.length > 0 && <p class="dir-note">Aucun sondage pour ce choix.</p>}
              </>
            )}
          </div>
        )}
      </div>
      <details class="fold dir-sondages-aide">
        <summary class="font-semibold">Comment lire ces sondages</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Vert : ouvert, les membres validés votent au QG. Gris : fermé. Jaune : à regarder.</p>
          <p>Le vote est secret : le site ne donne qu'un total par choix, jamais qui a voté quoi. Les parts sont arrondies au pour cent.</p>
          <p>« En tête » : le choix qui a le plus de voix. « Égalité » : plusieurs choix ont le plus de voix, aucun n'est en tête.</p>
          <p>
            {POLLS_OPEN_MAX} sondages ouverts au plus. Fermer garde les votes et le résultat, au QG ; supprimer les efface. Un officier ne touche qu'à ses sondages, un admin à tous. La liste montre les {POLLS_LIMIT} derniers.
          </p>
        </div>
      </details>
    </section>
  );
}
