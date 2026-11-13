import { useEffect, useRef, useState } from "preact/hooks";
import { SOURCE_LABELS, allHours, dayBefore, lastDays, namedPages, share, type DayBar, type SiteActivity, type VisitSource } from "../../lib/activite-site";
import { call } from "../../lib/compte/api";
import { fmtDay, fmtInt, fmtLongDay } from "../../lib/format";
import { Loading, Problem, messageOf } from "./common";
import { PartieTete } from "./Onglets";

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const visitorsWord = (n: number) => (n > 1 ? "visiteurs" : "visiteur");
const viewsWord = (n: number) => (n > 1 ? "pages vues" : "page vue");

/** Un chiffre clé, sans lien : rien à décider ici. `console-*` : l'ambiance console de la Direction (global.css). */
function Chiffre({ label, value, sub, testId }: { label: string; value: number; sub: string; testId: string }) {
  return (
    <div class="card p-4 sm:p-5" data-testid={testId}>
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class="console-valeur tnum mt-1 block font-display text-4xl font-extrabold">{fmtInt(value)}</span>
      <span class="tnum mt-1 block text-sm text-muted">{sub}</span>
    </div>
  );
}

/**
 * Des colonnes, une par jour ou par heure. La hauteur vient de la donnée ; la colonne survolée ou touchée écrit sa
 * valeur au-dessus, sinon la plus récente. Les mêmes valeurs sont dans le tableau replié dessous.
 */
function Colonnes({
  bars,
  slots,
  readout,
  label,
  current,
  ticks,
  initial,
  caption,
}: {
  bars: { key: string; value: number }[];
  /** Le nombre de places : des colonnes moins nombreuses restent étroites, à gauche. */
  slots: number;
  readout: (index: number) => string;
  label: string;
  /** La colonne de la période en cours, plus pâle. */
  current?: number;
  /** La colonne lue au départ, sinon celle en cours, sinon la dernière. */
  initial?: number;
  /** Des repères sous certaines colonnes, par leur place. */
  ticks?: Map<number, string>;
  caption?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const shown = active ?? initial ?? current ?? bars.length - 1;
  const grid = { "--n": String(Math.max(slots, bars.length)) };
  return (
    <div>
      <p class="tnum text-sm text-muted" data-testid="activity-readout">
        {readout(shown)}
      </p>
      <div class="colonnes mt-2" style={grid} aria-hidden="true" onMouseLeave={() => setActive(null)}>
        {bars.map((bar, i) => (
          <span key={bar.key} data-actif={i === shown ? "" : undefined} data-encours={i === current ? "" : undefined} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
            <i style={{ "--v": `${(bar.value / max) * 100}%` }} />
          </span>
        ))}
      </div>
      {ticks && (
        <div class="colonnes-reperes tnum mt-1 text-xs text-muted" style={grid} aria-hidden="true">
          {[...ticks].map(([i, text]) => (
            <span key={i} style={{ gridColumn: String(i + 1) }}>
              {text}
            </span>
          ))}
        </div>
      )}
      {caption && <p class="tnum mt-1 text-xs text-muted">{caption}</p>}
      <span class="sr-only">{label}</span>
    </div>
  );
}

/** Les lignes d'une liste classée : le nom, le nombre, et une jauge à la mesure du premier de toute la liste. */
function Lignes({ rows, max, start = 1 }: { rows: { label: string; value: number }[]; max: number; start?: number }) {
  return (
    <ol class="mt-3 grid gap-3" start={start}>
      {rows.map((row) => (
        <li key={row.label}>
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
            <span class="tnum shrink-0 text-muted">{fmtInt(row.value)}</span>
          </div>
          <div class="meter mt-1" aria-hidden="true">
            <i style={{ "--v": `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Une liste classée : les dix premiers, la suite repliée. */
function Classement({ id, title, rows, testId }: { id: string; title: string; rows: { label: string; value: number }[]; testId: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const rest = rows.slice(10);
  return (
    <section class="card p-5" aria-labelledby={id} data-testid={testId}>
      <h3 id={id} class="text-lg">
        {title}
      </h3>
      <Lignes rows={rows.slice(0, 10)} max={max} />
      {rest.length > 0 && (
        <details class="fold mt-4 !pb-0">
          <summary class="text-sm font-semibold">{rest.length === 1 ? "La suivante" : `Les ${fmtInt(rest.length)} suivantes`}</summary>
          <Lignes rows={rest} max={max} start={11} />
        </details>
      )}
    </section>
  );
}

/**
 * L'onglet « Activité » de la Direction : les visites du site, comptées par le site lui-même (`src/lib/activite-site.ts`).
 * Lu à l'ouverture de l'onglet, puis à la demande. Le serveur ne le rend qu'aux officiers et au-dessus.
 */
export default function DirectionActivite() {
  const [data, setData] = useState<SiteActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);

  const load = async () => {
    const mine = ++reads.current;
    setBusy(true);
    try {
      const next = await call<SiteActivity>("get_site_activity");
      if (mine !== reads.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (mine === reads.current) setError(messageOf(e));
    } finally {
      if (mine === reads.current) setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reload = (
    <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void load()} data-testid="activity-reload">
      Actualiser
    </button>
  );

  return (
    <section aria-labelledby="activite-titre" data-testid="direction-activity">
      <PartieTete id="activite-titre" title="Activité du site" aside={reload}>
        {data?.since && (
          <p class="tnum">
            Compté depuis le {fmtLongDay(data.since)} : {fmtInt(data.total.visitors)} {data.total.visitors > 1 ? "visites" : "visite"}, {fmtInt(data.total.views)} {viewsWord(data.total.views)}. Lu à {timeParis.format(new Date(data.read_at))}, heure de Paris.
          </p>
        )}
      </PartieTete>
      <div class="mt-6 grid gap-6">
        <Problem message={error} onRetry={() => void load()} />
        {data === null ? !error && <Loading /> : data.since === null ? <p data-testid="activity-empty">Pas encore de visite comptée.</p> : <Tableau data={data} />}
      </div>
    </section>
  );
}

function Tableau({ data }: { data: SiteActivity }) {
  const today = data.days.find((d) => d.day === data.today);
  const yesterday = dayBefore(data.today);
  const yesterdayRow = data.days.find((d) => d.day === yesterday);
  const yesterdayCounted = data.since !== null && yesterday >= data.since;
  const yesterdayVisitors = yesterdayRow ? yesterdayRow.visitors : yesterdayCounted ? 0 : null;

  // La période des listes et des parts : 30 jours, ou moins si le compteur est plus jeune.
  const days = lastDays(data, 30);
  const counted = days.filter((d): d is DayBar & { visitors: number; views: number } => d.visitors !== null);
  const period = counted.length < 30 ? `depuis le ${fmtDay(counted[0]?.day ?? data.today)}` : "sur 30 jours";
  const sum = (key: "visitors" | "touch" | "signed_in" | "newcomers") => data.days.reduce((total, d) => total + d[key], 0);
  const visitors = sum("visitors");

  const hours = allHours(data.hours);
  const hourViews = hours.reduce((total, h) => total + h.views, 0);
  const busiest = hours.reduce((best, h) => (h.views > (hours[best]?.views ?? 0) ? h.hour : best), 0);

  const parts = [
    { label: "Sur téléphone ou tablette", part: sum("touch") },
    { label: "Connectés à leur compte du site", part: sum("signed_in") },
    { label: "Venus pour la première fois", part: sum("newcomers") },
  ];

  return (
    <>
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Des libellés courts : sur un téléphone, la case n'a la place que pour un mot par ligne. */}
        <Chiffre label="Aujourd'hui" value={today?.visitors ?? 0} sub={`${visitorsWord(today?.visitors ?? 0)}${yesterdayVisitors === null ? "" : `, hier ${fmtInt(yesterdayVisitors)}`}`} testId="activity-today" />
        <Chiffre label="Cette semaine" value={data.week.visitors} sub={`${visitorsWord(data.week.visitors)} depuis lundi`} testId="activity-week" />
        <Chiffre label="Ce mois-ci" value={data.month.visitors} sub={`${visitorsWord(data.month.visitors)} depuis le 1er`} testId="activity-month" />
        <Chiffre label="Pages vues" value={today?.views ?? 0} sub="aujourd'hui" testId="activity-views" />
      </div>

      {/* Un seul jour compté ne fait pas une courbe : le graphique attend le deuxième. */}
      {counted.length >= 2 && (
        <section class="card p-5" aria-labelledby="activite-jours" data-testid="activity-days">
          <h3 id="activite-jours" class="text-lg">
            Visiteurs par jour
          </h3>
          <div class="mt-3">
            <Colonnes
              bars={counted.map((d) => ({ key: d.day, value: d.visitors }))}
              slots={14}
              current={counted.length - 1}
              readout={(i) => {
                const d = counted[i];
                return d ? `${fmtDay(d.day)}${d.day === data.today ? " (en cours)" : ""} : ${fmtInt(d.visitors)} ${visitorsWord(d.visitors)}, ${fmtInt(d.views)} ${viewsWord(d.views)}` : "";
              }}
              label="Les mêmes chiffres, jour par jour, sont dans le tableau qui suit."
              caption={`Du ${fmtDay(counted[0]?.day ?? data.today)} à aujourd'hui`}
            />
          </div>
          <details class="fold mt-4 !pb-0">
            <summary class="text-sm font-semibold">Jour par jour</summary>
            <table class="data-table tnum w-full text-sm">
              <thead>
                <tr>
                  <th scope="col">Jour</th>
                  <th scope="col">Visiteurs</th>
                  <th scope="col">Pages vues</th>
                </tr>
              </thead>
              <tbody>
                {[...counted].reverse().map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{fmtDay(d.day)}</th>
                    <td>{fmtInt(d.visitors)}</td>
                    <td>{fmtInt(d.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      <div class="grid items-start gap-6 lg:grid-cols-2">
        {data.pages.length > 0 && <Classement id="activite-pages" title={`Pages les plus vues, ${period}`} rows={namedPages(data.pages)} testId="activity-pages" />}
        {data.sources.length > 0 && (
          <Classement id="activite-sources" title={`D'où arrivent les visiteurs, ${period}`} rows={data.sources.map((s) => ({ label: SOURCE_LABELS[s.source as VisitSource] ?? s.source, value: s.visitors }))} testId="activity-sources" />
        )}
      </div>

      {hourViews > 0 && (
        <section class="card p-5" aria-labelledby="activite-heures" data-testid="activity-hours">
          <h3 id="activite-heures" class="text-lg">
            Pages vues selon l'heure, {period}
          </h3>
          <div class="mt-3">
            <Colonnes
              bars={hours.map((h) => ({ key: String(h.hour), value: h.views }))}
              slots={24}
              initial={busiest}
              readout={(i) => {
                const h = hours[i];
                return h ? `De ${h.hour} h à ${h.hour + 1} h : ${fmtInt(h.views)} ${viewsWord(h.views)}` : "";
              }}
              label="Les mêmes chiffres, heure par heure, sont dans le tableau qui suit."
              ticks={new Map([0, 6, 12, 18].map((h) => [h, `${h} h`]))}
            />
          </div>
          <details class="fold mt-4 !pb-0">
            <summary class="text-sm font-semibold">Heure par heure</summary>
            <table class="data-table tnum w-full text-sm">
              <thead>
                <tr>
                  <th scope="col">Heure de Paris</th>
                  <th scope="col">Pages vues</th>
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.hour}>
                    <th scope="row">
                      De {h.hour} h à {h.hour + 1} h
                    </th>
                    <td>{fmtInt(h.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      {visitors > 0 && (
        <section class="card p-5" aria-labelledby="activite-qui" data-testid="activity-who">
          <h3 id="activite-qui" class="text-lg">
            Les visites, {period}
          </h3>
          <dl class="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-3">
            {parts.map((p) => (
              <div key={p.label}>
                <dt class="text-sm font-semibold">{p.label}</dt>
                <dd class="tnum text-sm text-muted">
                  {fmtInt(share(p.part, visitors))} %, {fmtInt(p.part)} {p.part > 1 ? "visites" : "visite"} sur {fmtInt(visitors)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <details class="fold">
        <summary class="font-semibold">Comment c'est compté</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Le site compte lui-même, sans cookie, sans adresse IP et sans service extérieur. Chaque navigateur garde seulement la date de sa dernière visite : il compte une fois par jour, une fois par semaine et une fois par mois. Une visite : un navigateur, un jour. Un joueur qui vient avec son téléphone et son ordinateur compte deux fois ; un navigateur dont on efface les données compte de nouveau.</p>
          <p>Ne comptent pas : les programmes de test et les robots qui se déclarent comme tels, les navigateurs qui demandent de ne pas être suivis ou dont le visiteur a refusé d'être compté (page Confidentialité), et les visites sans JavaScript. Un navigateur qui ne garde rien ne compte que des pages vues. « Sans provenance » : un favori, une adresse tapée, ou un lien ouvert depuis une application, Discord compris. « Venus pour la première fois » : sans aucune trace d'une visite d'avant dans ce navigateur.</p>
        </div>
      </details>
    </>
  );
}
