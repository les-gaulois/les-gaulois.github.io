import { fmtVotes, pollRows } from "../../lib/compte/polls";
import type { QgPoll } from "../../lib/compte/qg";
import { choixEnTete, egaliteEnTete, etatSondage, fermeturePassee, partEcrite, tempsRestant, type EtatSondage } from "../../lib/compte/qg-decisions";
import { fmtDate } from "../../lib/format";
import { Problem } from "./common";
import { Pastille, type DirTon } from "./direction-kit";

/** L'état d'un sondage pour le membre : son mot et sa couleur, toujours ensemble. */
const ETATS: Record<EtatSondage, { mot: string; ton: DirTon }> = {
  "a-voter": { mot: "À voter", ton: "warn" },
  vote: { mot: "Voté", ton: "ok" },
  ferme: { mot: "Fermé", ton: "muted" },
};

/**
 * Les sondages du QG, un bloc par sondage : son état en pastille, le temps qui reste, la question, puis une ligne courte
 * par choix. Tant que le sondage est ouvert, la ligne entière est le bouton du vote (`aria-pressed` : mon choix) ; son nom
 * est ce qu'il montre (le choix, ses voix, sa part), puis la question pour les lecteurs d'écran. Fermé, le choix en tête
 * est mis en avant, sauf à égalité ou sans voix : on ne désigne alors rien. Les longueurs des jauges viennent des totaux du
 * serveur, écrits à côté. Personne ne voit qui a voté quoi. Les boutons restent à leur place pendant un envoi
 * (`aria-disabled`, jamais `disabled`) : le focus du clavier ne se perd pas. `probleme` : le refus du serveur, écrit sous
 * le sondage où l'on a voté.
 */
export default function QgPolls({ polls, busy, now, onVote, testId, probleme = null }: { polls: QgPoll[]; busy: boolean; now: number; onVote: (poll: number, choice: number) => void; testId: string; probleme?: { poll: number; message: string } | null }) {
  return (
    <ul class="qgd-liste" data-testid={testId}>
      {polls.map((poll) => {
        const { rows, total } = pollRows(poll);
        const etat = etatSondage(poll);
        const { mot, ton } = ETATS[etat];
        const reste = poll.is_open ? tempsRestant(poll.closes_at, now) : null;
        const passee = poll.is_open && fermeturePassee(poll.closes_at, now);
        const tete = poll.is_open ? null : choixEnTete(poll.counts);
        const egalite = !poll.is_open && egaliteEnTete(poll.counts);
        return (
          <li key={poll.id} class="qgd-sondage" data-dir-ton={ton} data-etat={etat} data-poll={poll.id} data-testid="qg-poll">
            <p class="qgd-tete">
              <Pastille ton={ton} testid="qg-poll-etat">
                {mot}
              </Pastille>
              {reste && (
                <span class="qgd-delai" data-proche={reste.proche && etat === "a-voter" ? "" : undefined} data-testid="qg-poll-delai">
                  Ferme dans {reste.texte}
                </span>
              )}
              {passee && (
                <span class="qgd-delai" data-passee="" data-testid="qg-poll-delai">
                  Heure de fermeture passée
                </span>
              )}
              {!poll.is_open && poll.ended_at && <span class="qgd-delai">{fmtDate(poll.ended_at)}</span>}
              {egalite && (
                <Pastille ton="muted" plain testid="qg-poll-egalite">
                  Égalité
                </Pastille>
              )}
              <span class="qgd-total tnum">{fmtVotes(total)}</span>
            </p>
            {/* `tabIndex` à -1 : le focus du clavier revient ici quand le bouton cliqué quitte la liste (sondage fermé entre-temps). */}
            <h3 class="qgd-question" tabIndex={-1}>
              {poll.question}
            </h3>
            <ul class="qgd-options">
              {rows.map((row, i) => {
                const mien = poll.mine === i;
                const part = partEcrite(row, total);
                const contenu = (
                  <>
                    {poll.is_open && (
                      <span class="qgd-case" aria-hidden="true">
                        {mien ? "[x]" : "[ ]"}
                      </span>
                    )}
                    <span class="qgd-choix">
                      {poll.is_open && <span class="sr-only">Voter </span>}
                      <span class="qgd-nom">{row.label}</span>{" "}
                      {tete === i && (
                        <Pastille ton="ally" plain testid="qg-poll-tete">
                          En tête
                        </Pastille>
                      )}{" "}
                      {mien && (
                        <Pastille ton={poll.is_open ? "ok" : "muted"} plain testid="qg-poll-mien">
                          Votre choix
                        </Pastille>
                      )}
                    </span>{" "}
                    <span class="qgd-compte tnum">
                      <span class="qgd-voix">{fmtVotes(row.count)}</span> {part !== null && <span class="qgd-part">{part}</span>}
                    </span>
                    <span class="meter qgd-jauge" aria-hidden="true">
                      <i style={{ "--v": `${row.share ?? 0}%` }} />
                    </span>
                    {poll.is_open && <span class="sr-only">, à la question : {poll.question}</span>}
                  </>
                );
                return (
                  <li key={i} data-testid="qg-poll-option">
                    {poll.is_open ? (
                      <button
                        type="button"
                        class="qgd-option"
                        aria-pressed={mien}
                        aria-disabled={busy || undefined}
                        onClick={() => {
                          if (!busy && !mien) onVote(poll.id, i);
                        }}
                      >
                        {contenu}
                      </button>
                    ) : (
                      <div class="qgd-option" data-tete={tete === i ? "" : undefined}>
                        {contenu}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {probleme?.poll === poll.id && <Problem message={probleme.message} />}
          </li>
        );
      })}
    </ul>
  );
}
