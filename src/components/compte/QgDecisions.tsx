import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { QgPoll } from "../../lib/compte/qg";
import { compterSondages, etatsVus, filtrerSondages, FILTRES_DES, rangerSondages, type EtatSondage, type FiltreSondages } from "../../lib/compte/qg-decisions";
import { fmtInt } from "../../lib/format";
import { Problem } from "./common";
import { Pastille, useBarreCollante, type DirTon } from "./direction-kit";
import { PartieTete } from "./Onglets";
import QgPolls from "./QgPolls";

/** Les sondages fermés montrés d'abord ; les suivants restent repliés, à portée. */
const PAST_SHOWN = 4;

const FILTRES: { id: FiltreSondages; mot: string; ton: DirTon }[] = [
  { id: "a-voter", mot: "À voter", ton: "warn" },
  { id: "ouverts", mot: "Ouverts", ton: "ally" },
  { id: "fermes", mot: "Fermés", ton: "muted" },
];

/**
 * La barre des filtres, collée sous l'en-tête pendant qu'on descend la liste. Elle est à part parce qu'elle peut paraître
 * en cours de visite (un septième sondage), et que `useBarreCollante` ne mesure l'en-tête qu'au montage : montée avec la
 * barre, la mesure est toujours juste. Les hauteurs se posent sur la barre elle-même, seule à les lire dans cet onglet.
 */
function BarreFiltres({ compte, actif, choisir }: { compte: Record<FiltreSondages, number>; actif: FiltreSondages | null; choisir: (id: FiltreSondages) => void }) {
  const { root, bar } = useBarreCollante<HTMLDivElement>();
  const lier = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      bar.current = el;
    },
    [root, bar],
  );
  // Le filtre qu'on vient de lever disparaît s'il ne compte plus rien : le focus passe au premier filtre qui reste.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (!bar.current?.contains(document.activeElement)) bar.current?.querySelector<HTMLElement>("button")?.focus();
  });
  return (
    <div ref={lier} class="dir-outils" data-testid="qg-decisions-outils">
      <div class="dir-filtres" role="group" aria-label="Filtrer les sondages">
        {FILTRES.filter(({ id }) => compte[id] > 0 || actif === id).map(({ id, mot, ton }) => (
          <button
            key={id}
            type="button"
            class="dir-filtre"
            data-dir-ton={ton}
            aria-pressed={actif === id}
            data-testid={`qg-decisions-filtre-${id}`}
            onClick={() => {
              if (actif === id && compte[id] === 0) refocus.current = true;
              choisir(id);
            }}
          >
            {mot} <span class="dir-nombre tnum">{fmtInt(compte[id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * « Décisions » : les sondages de l'encadrement, ceux à voter d'abord, puis ceux où l'on a voté, puis les fermés. Vote
 * secret, modifiable tant que le sondage est ouvert ; le serveur revérifie chaque vote (`vote_poll`). `problem` : le
 * refus du serveur pour un vote, écrit sous le sondage où l'on a voté. `now` : l'heure de la page, pour le temps qui reste
 * avant une fermeture.
 */
export default function QgDecisions({ polls, busy, problem, now, onVote }: { polls: QgPoll[]; busy: boolean; problem: string | null; now: number; onVote: (poll: number, choice: number) => void }) {
  const [filtre, setFiltre] = useState<FiltreSondages | null>(null);
  /** Les sondages où l'on vient de voter sous un filtre : ils restent à l'écran, le bouton cliqué ne disparaît pas. */
  const [gardes, setGardes] = useState<ReadonlySet<number>>(new Set());
  /** Le dernier sondage où l'on a voté : le refus du serveur s'écrit sous lui. */
  const [dernier, setDernier] = useState<number | null>(null);
  const section = useRef<HTMLElement>(null);
  // L'état de chaque sondage à son arrivée sur la page : un sondage où l'on vient de voter reste à sa place, sous le doigt
  // ou sous le focus du clavier, au lieu de descendre parmi les « Voté » (`rangerSondages`).
  const vus = useRef<ReadonlyMap<number, EtatSondage>>(new Map());
  vus.current = etatsVus(vus.current, polls);
  /** Le bouton qui avait le focus au moment du vote, et son sondage. */
  const focusAuVote = useRef<{ poll: number; el: Element } | null>(null);

  const compte = compterSondages(polls);
  const avecFiltres = polls.length > FILTRES_DES;
  const { actif, montres } = filtrerSondages(rangerSondages(polls, vus.current), avecFiltres ? filtre : null, gardes);
  const ouverts = montres.filter((poll) => poll.is_open);
  const fermes = montres.filter((poll) => !poll.is_open);
  const recents = fermes.slice(0, PAST_SHOWN);
  const anciens = fermes.slice(PAST_SHOWN);
  const probleme = problem !== null && dernier !== null && [...ouverts, ...recents].some((poll) => poll.id === dernier) ? { poll: dernier, message: problem } : null;

  // Un filtre levé de lui-même (plus rien à montrer, ou plus de filtres) l'est aussi dans l'état : il ne revient pas seul.
  useEffect(() => {
    if (filtre !== null && actif === null) {
      setFiltre(null);
      setGardes(new Set());
    }
  }, [filtre, actif]);

  // Le bouton du vote a quitté la page à la relecture (le sondage a fermé entre-temps) : le focus du clavier, perdu, va à
  // la question du sondage, ou à la partie si elle n'est plus à l'écran.
  useEffect(() => {
    const avant = focusAuVote.current;
    focusAuVote.current = null;
    if (!avant || avant.el.isConnected) return;
    const ici = document.activeElement;
    if (ici && ici !== document.body) return;
    const question = section.current?.querySelector<HTMLElement>(`[data-poll="${avant.poll}"] .qgd-question`);
    const cible = question && !question.closest("details:not([open])") ? question : section.current?.closest<HTMLElement>('[role="tabpanel"]');
    cible?.focus();
  }, [polls]);

  const choisir = (id: FiltreSondages) => {
    setFiltre(actif === id ? null : id);
    setGardes(new Set());
  };
  const voter = (poll: number, choice: number) => {
    const ici = document.activeElement;
    focusAuVote.current = ici && section.current?.contains(ici) ? { poll, el: ici } : null;
    if (actif !== null) setGardes((avant) => new Set(avant).add(poll));
    setDernier(poll);
    onVote(poll, choice);
  };

  const resume =
    !avecFiltres && compte.ouverts > 0 ? (
      compte["a-voter"] > 0 ? (
        <Pastille ton="warn" testid="qg-decisions-resume">
          <span class="tnum">{fmtInt(compte["a-voter"])}</span> à voter
        </Pastille>
      ) : (
        <Pastille ton="ok" testid="qg-decisions-resume">
          Tout est voté
        </Pastille>
      )
    ) : undefined;

  return (
    <section ref={section} class="qg-decisions" aria-labelledby="decisions-titre" data-testid="qg-decisions">
      <PartieTete id="decisions-titre" title="Décisions" aside={resume} />
      {avecFiltres && <BarreFiltres compte={compte} actif={actif} choisir={choisir} />}
      {ouverts.length > 0 && <QgPolls polls={ouverts} busy={busy} now={now} onVote={voter} probleme={probleme} testId="qg-polls-open" />}
      {probleme === null && <Problem message={problem} />}
      {recents.length > 0 && <QgPolls polls={recents} busy={busy} now={now} onVote={voter} probleme={probleme} testId="qg-polls-past" />}
      {anciens.length > 0 && (
        <details class="fold qgd-anciens">
          <summary>
            <span>
              Sondages plus anciens <span class="tnum">({fmtInt(anciens.length)})</span>
            </span>
          </summary>
          <QgPolls polls={anciens} busy={busy} now={now} onVote={voter} testId="qg-polls-older" />
        </details>
      )}
      <details class="fold qgd-aide">
        <summary>Vote secret</summary>
        <p>Personne ne voit qui a voté quoi : seuls les totaux s'affichent. Votre vote se change tant que le sondage est ouvert.</p>
      </details>
    </section>
  );
}
