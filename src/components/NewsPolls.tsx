import type { LivePoll } from "../lib/compte/news";
import { fmtVotes, pollRows } from "../lib/compte/polls";
import { fmtDateTime, fmtInt } from "../lib/format";

/**
 * Les sondages de l'accueil : la question, les totaux de chaque choix et, pour un membre validé connecté, de quoi voter.
 * Les longueurs des jauges viennent des totaux du serveur, écrits à côté. Personne ne voit qui a voté quoi.
 * Les boutons restent à leur place pendant un envoi : le focus du clavier ne se perd pas.
 */
export default function NewsPolls({ polls, votes, busy, onVote }: { polls: LivePoll[]; votes: Map<number, number> | null; busy: boolean; onVote: (poll: number, choice: number) => void }) {
  return (
    <ul class="mt-4 grid gap-3 md:grid-cols-2" data-testid="news-polls">
      {polls.map((poll) => {
        const { rows, total } = pollRows(poll);
        const mine = votes?.get(poll.id) ?? null;
        const canVote = votes !== null && poll.is_open;
        return (
          <li key={poll.id} class="card p-5" data-testid="news-poll">
            <h3 class="text-lg [overflow-wrap:anywhere]">{poll.question}</h3>
            <p class="tnum mt-1 text-sm text-muted">
              {poll.is_open ? (poll.closes_at ? `Ouvert jusqu'au ${fmtDateTime(poll.closes_at)}` : "Ouvert") : "Fermé : résultat final"} · {fmtVotes(total)}
            </p>
            <ul class="mt-3 grid gap-3">
              {rows.map((row, i) => (
                <li key={i} data-testid="news-poll-option">
                  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span class="font-semibold">
                      {row.label}
                      {mine === i && <span class="font-normal text-muted"> · votre choix</span>}
                    </span>
                    <span class="tnum text-muted">
                      {fmtVotes(row.count)}
                      {row.share !== null ? ` · ${fmtInt(row.share)} %` : ""}
                    </span>
                  </div>
                  <div class="meter mt-1" aria-hidden="true">
                    <i style={{ "--v": `${row.share ?? 0}%` }} />
                  </div>
                  {canVote && (
                    <button
                      type="button"
                      class="chip mt-2 !min-h-9"
                      aria-pressed={mine === i}
                      aria-disabled={busy || undefined}
                      aria-label={`Voter « ${row.label} »`}
                      onClick={() => {
                        if (!busy && mine !== i) onVote(poll.id, i);
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
