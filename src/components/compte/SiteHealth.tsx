import { siteHealth, type HealthLevel, type SiteHealthInput } from "../../lib/etat-site";
import { useNow } from "./common";

const TONE: Record<HealthLevel, string> = { ok: "text-muted", info: "text-muted", warn: "font-semibold text-warn" };

/**
 * L'état du site, dans l'espace Direction : voir `src/lib/etat-site.ts`.
 * L'âge se recalcule chaque minute : une page laissée ouverte reste juste.
 */
export default function SiteHealth(props: SiteHealthInput) {
  const health = siteHealth(props, useNow());
  const warnings = health.lines.filter((line) => line.level === "warn").length;

  return (
    <section class="card p-5" aria-labelledby="health-title" data-testid="direction-health">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="health-title" class="text-xl">
          État du site
        </h2>
        <p class={`text-sm ${warnings > 0 ? "font-semibold text-warn" : "text-muted"}`} data-testid="health-summary">
          {warnings === 0 ? "Rien à signaler" : warnings === 1 ? "1 point à surveiller" : `${warnings} points à surveiller`}
        </p>
      </div>
      <dl class="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {health.lines.map((line) => (
          <div key={line.label} data-testid="health-line" data-level={line.level}>
            <dt class="text-sm font-semibold">{line.label}</dt>
            <dd class={`tnum text-sm ${TONE[line.level]}`}>{line.text}</dd>
          </div>
        ))}
      </dl>
      <details class="fold mt-4 !pb-0">
        <summary class="text-sm font-semibold">Les {health.sources.length} sources de l'API, une par une</summary>
        <dl class="grid gap-y-2 pb-1">
          {health.sources.map((source) => (
            <div key={source.key} class="grid gap-x-4 sm:grid-cols-[12rem_1fr]" data-testid="health-source" data-level={source.level}>
              <dt class="text-sm font-semibold">{source.label}</dt>
              <dd class={`tnum text-sm ${TONE[source.level]}`}>{source.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
