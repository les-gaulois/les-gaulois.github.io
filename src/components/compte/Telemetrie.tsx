import { useEffect, useState } from "preact/hooks";
import { heureDeCollecte } from "../../lib/etat-site";
import { fmtEpochTime } from "../../lib/format";

/** L'heure qui change à la minute pile, pas une minute après l'ouverture de la page. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

/**
 * La ligne du rôle, dans la fenêtre « session » du QG et de la Direction (style Terminal, voir docs/DESIGN.md) : le rôle
 * derrière un voyant vert, la session est ouverte. Elle donne aussi l'heure de Paris et celle de la dernière collecte
 * publiée, datée si ce n'est pas aujourd'hui et en jaune si elle est en retard (`heureDeCollecte`) : des valeurs vraies,
 * décoratives pour les lecteurs d'écran, qui trouvent la date des données ailleurs (pied de page, état du site).
 * `testId` : le préfixe de la page (`qg`, `direction`).
 */
export default function Telemetrie({ role, lastRunAt, testId }: { role: string; lastRunAt: string | null; testId: string }) {
  const now = useMinute();
  const collecte = lastRunAt ? heureDeCollecte(lastRunAt, now) : null;
  return (
    <p class="console-acces text-muted">
      <span class="console-voyant" aria-hidden="true" />
      <span>{role}</span>
      <span class="console-heure tnum" aria-hidden="true">
        {fmtEpochTime(now.getTime() / 1000)}
      </span>
      {/* La date ne se coupe jamais ; la ligne peut passer à la ligne avant elle (au QG, sur téléphone, l'avatar laisse
          moins de place, et une collecte d'un autre jour est plus longue : « collecte 30 sept., 22:50 »). */}
      {collecte && (
        <span class={`console-collecte tnum ${collecte.enRetard ? "text-warn" : ""}`} aria-hidden="true" data-testid={`${testId}-collecte`}>
          collecte <span class="console-collecte-date">{collecte.texte}</span>
        </span>
      )}
    </p>
  );
}
