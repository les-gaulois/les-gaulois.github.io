import { fmtVotes, pollRows } from "../../lib/compte/polls";
import type { QgPoll } from "../../lib/compte/qg";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";

/**
 * Les sondages du QG : la question, les totaux de chaque choix et, tant que le sondage est ouvert, de quoi voter.
 * Les longueurs des jauges viennent des totaux du serveur, écrits à côté. Personne ne voit qui a voté quoi.
 * Les boutons restent à leur place pendant un envoi : le focus du clavier ne se perd pas.
 */
export default function QgPolls({ polls, busy, onVote, testId }: { polls: QgPoll[]; busy: boolean; onVote: (poll: number, choice: number) => void; testId: string }) {
  return (
    <ul class="mt-4 grid gap-3 md:grid-cols-2" data-testid={testId}>
      {polls.map((poll) => {
        const { rows, total } = pollRows(poll);
        const state = poll.is_open
          ? poll.closes_at
            ? `Ouvert jusqu'au ${fmtDateTime(poll.closes_at)}`
            : "Ouvert"
          : poll.ended_at
            ? `Fermé le ${fmtDate(poll.ended_at)} : résultat final`
            : "Fermé : résultat final";
        return (
          <li key={poll.id} class="card p-5" data-testid="qg-poll">
            <h4 class="text-lg [overflow-wrap:anywhere]">{poll.question}</h4>
            <p class="tnum mt-1 text-sm text-muted">
              {state} · {fmtVotes(total)}
            </p>
            <ul class="mt-3 grid gap-3">
              {rows.map((row, i) => (
                <li key={i} data-testid="qg-poll-option">
                  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span class="font-semibold [overflow-wrap:anywhere]">
                      {row.label}
                      {poll.mine === i && <span class="font-normal text-muted"> · votre choix</span>}
                    </span>
                    <span class="tnum text-muted">
                      {fmtVotes(row.count)}
                      {row.share !== null ? ` · ${fmtInt(row.share)} %` : ""}
                    </span>
                  </div>
                  <div class="meter mt-1" aria-hidden="true">
                    <i style={{ "--v": `${row.share ?? 0}%` }} />
                  </div>
                  {poll.is_open && (
                    <button
                      type="button"
                      class="chip mt-2 !min-h-9"
                      aria-pressed={poll.mine === i}
                      aria-disabled={busy || undefined}
                      aria-label={`Voter « ${row.label} »`}
                      onClick={() => {
                        if (!busy && poll.mine !== i) onVote(poll.id, i);
                      }}
                    >
                      Voter
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
