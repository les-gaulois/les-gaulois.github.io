import { ETAT_PASTILLE, etatResume } from "../../lib/compte/direction-ensemble";
import { siteHealth, type HealthLine, type SiteHealthInput } from "../../lib/etat-site";
import { useNow } from "./common";
import { Pastille } from "./direction-kit";

/**
 * Une ligne de l'état : la pastille de couleur avec son mot, le nom, puis le détail. Le trait au bord de la ligne reprend
 * la couleur de la pastille. `plain` : le point et le mot seuls, pour les sources du repli.
 */
function Ligne({ line, testid, plain = false }: { line: HealthLine; testid: string; plain?: boolean }) {
  const { ton, mot } = ETAT_PASTILLE[line.level];
  return (
    <div class="dir-ligne dir-ensemble-ligne" data-dir-ton={ton} data-testid={testid} data-level={line.level}>
      <dt class="dir-ensemble-source">{line.label}</dt>
      <dd class="dir-ensemble-niveau">
        <Pastille ton={ton} plain={plain}>
          {mot}
        </Pastille>
      </dd>
      <dd class="dir-ensemble-detail tnum">{line.text}</dd>
    </div>
  );
}

/**
 * L'état du site, dans l'espace Direction : voir `src/lib/etat-site.ts`.
 * L'âge se recalcule chaque minute : une page laissée ouverte reste juste.
 */
export default function SiteHealth(props: SiteHealthInput) {
  const health = siteHealth(props, useNow());
  const resume = etatResume(health.lines);

  return (
    <section class="dir-ensemble-site console-journal card" aria-labelledby="health-title" data-testid="direction-health" data-titre="etat-du-site.log">
      <div class="dir-ensemble-tete">
        <h2 id="health-title" class="text-xl">
          État du site
        </h2>
        <p class="dir-ensemble-resume">
          <Pastille ton={resume.ton} testid="health-summary">
            {resume.mot}
          </Pastille>
        </p>
      </div>
      <dl class="dir-liste dir-ensemble-lignes">
        {health.lines.map((line) => (
          <Ligne key={line.label} line={line} testid="health-line" />
        ))}
      </dl>
      <details class="fold dir-ensemble-sources">
        <summary class="text-sm font-semibold">Les {health.sources.length} sources de l'API, une par une</summary>
        <dl class="dir-liste dir-ensemble-lignes">
          {health.sources.map((source) => (
            <Ligne key={source.key} line={source} testid="health-source" plain />
          ))}
        </dl>
      </details>
    </section>
  );
}
