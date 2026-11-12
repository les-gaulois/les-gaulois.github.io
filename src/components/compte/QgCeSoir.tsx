import { counted } from "../../lib/compte/qg";
import { liveHours, liveMine, peakHour, planChoices, planLabel, planOthersLabel, sameHour, type QgTools } from "../../lib/compte/outils";
import { Avatar, Problem, useNow } from "./common";
import { PartieTete } from "./Onglets";

/**
 * « Ce soir je joue » : chacun dit à quelle heure il compte jouer, l'heure en cours ou l'une des onze suivantes. Un second
 * clic sur son heure la retire. Chaque heure dit combien de membres viennent, avec le visage de ceux qui se montrent sur
 * le mur ; les autres sont seulement comptés. Une heure passée disparaît d'elle-même. Le serveur vérifie tout (`set_play_plan`).
 */
export default function QgCeSoir({ plans, busy, problem, onChoose }: { plans: QgTools["plans"]; busy: boolean; problem: string | null; onChoose: (at: string | null) => void }) {
  const now = useNow(60_000);
  // Une heure finie s'efface même si la page reste ouverte : le serveur ne l'efface qu'à la lecture suivante.
  const hours = liveHours(plans.hours, now);
  const mineNow = liveMine(plans.mine, now);
  const peak = peakHour(hours);

  return (
    <section aria-labelledby="ce-soir-titre" data-testid="qg-ce-soir">
      <PartieTete id="ce-soir-titre" title="Ce soir je joue">
        {peak && (
          <p class="tnum" data-testid="qg-ce-soir-pic">
            Le plus de monde : {planLabel(peak.at, now).toLocaleLowerCase("fr")}, {counted(peak.count, "Gaulois", "Gaulois")}.
          </p>
        )}
      </PartieTete>

      <div class="mt-6 flex flex-wrap gap-2" role="group" aria-label="Votre heure de jeu" data-testid="qg-ce-soir-heures">
        {planChoices(now).map((at) => {
          const mine = sameHour(at, mineNow);
          return (
            <button key={at} type="button" class="chip tnum" aria-pressed={mine} aria-disabled={busy || undefined} onClick={() => !busy && onChoose(mine ? null : at)}>
              {planLabel(at, now)}
            </button>
          );
        })}
      </div>
      <Problem message={problem} />

      {hours.length > 0 && (
        <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="qg-ce-soir-liste">
          {hours.map((hour) => {
            const others = planOthersLabel(hour.count, hour.faces.length);
            return (
              <li key={hour.at} class={`card p-5 ${peak && sameHour(peak.at, hour.at) ? "!border-line-strong" : ""}`}>
                <p class="console-valeur font-display text-3xl font-extrabold tnum">{planLabel(hour.at, now)}</p>
                <p class="tnum text-muted">{counted(hour.count, "Gaulois", "Gaulois")}</p>
                {hour.faces.length > 0 && (
                  <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label={`Ils jouent : ${planLabel(hour.at, now)}`}>
                    {hour.faces.map((face, i) => (
                      <li key={i} class="flex items-center gap-2 text-sm">
                        <Avatar name={face.name} avatar={face.avatar} />
                        <span class="[overflow-wrap:anywhere]">{face.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {others && <p class="tnum mt-2 text-sm text-muted">{others}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
