import { useEffect, useState } from "preact/hooks";
import { fmtDate } from "../lib/format";
import { hasNewGazette, nextVisitState, readVisitState, VISIT_KEY, visitLines, type VisitSnapshot } from "../lib/visite";

interface View {
  since: string;
  lines: string[];
  gazette: boolean;
}

/**
 * Le résumé de l'accueil pour celui qui revient. À la première visite, ou si rien n'a changé, il n'affiche rien.
 * Sans stockage dans le navigateur, il n'affiche rien non plus : le reste de la page ne dépend pas de lui.
 */
export default function SinceLastVisit({ snapshot, gazetteHref }: { snapshot: VisitSnapshot; gazetteHref: string }) {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    try {
      const state = nextVisitState(readVisitState(localStorage.getItem(VISIT_KEY)), snapshot, new Date());
      localStorage.setItem(VISIT_KEY, JSON.stringify(state));
      const lines = visitLines(state.baseline, snapshot);
      const gazette = hasNewGazette(state.baseline, snapshot);
      if (lines.length > 0 || gazette) setView({ since: fmtDate(state.since), lines, gazette });
    } catch {
      // Stockage indisponible : pas de résumé, sans gêner le reste de la page.
    }
  }, [snapshot]);

  if (!view) return null;
  return (
    <section class="card card-accent mb-10 p-5 md:p-6" aria-labelledby="since-title" data-testid="since-visit">
      <h2 id="since-title" class="text-2xl">Depuis votre dernière visite, le {view.since}</h2>
      <ul class="tnum mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
        {view.lines.map((line) => (
          <li key={line} data-testid="since-line">{line}</li>
        ))}
        {view.gazette && (
          <li data-testid="since-gazette">
            <a href={gazetteHref}>Une nouvelle gazette est parue.</a>
          </li>
        )}
      </ul>
    </section>
  );
}
