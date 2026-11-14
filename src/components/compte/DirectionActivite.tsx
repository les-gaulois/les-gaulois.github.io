import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { SOURCE_LABELS, allHours, lastDays, namedPages, type DayBar, type SiteActivity, type VisitSource } from "../../lib/activite-site";
import { call } from "../../lib/compte/api";
import {
  TREND_EARLY,
  TREND_HELP,
  TREND_LOOK,
  busiestHour,
  dayReadout,
  dayTicksLegend,
  dayWords,
  hourReadout,
  periodText,
  traitLength,
  trendText,
  trendWaitText,
  visitShares,
  visitorsWord,
  visitsWord,
  viewsWord,
  weekTicks,
  weekTrend,
  yesterdayVisitors,
  type WeekTrend,
} from "../../lib/compte/direction-activite";
import { fmtInt, fmtLongDay } from "../../lib/format";
import { Loading, Problem, messageOf } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

const timeParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/** Un chiffre clé de la bande du haut, sans lien : rien à décider ici. `console-*` : l'ambiance console de la Direction. */
function Chiffre({ label, value, sub, testId }: { label: string; value: number; sub: string; testId: string }) {
  return (
    <div class="dir-activite-chiffre" data-testid={testId}>
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class="console-valeur tnum block font-display text-3xl font-extrabold sm:text-4xl">{fmtInt(value)}</span>
      <span class="tnum block text-sm text-muted">{sub}</span>
    </div>
  );
}

/**
 * Les sept derniers jours finis contre les sept d'avant (`weekTrend`), en visites : une somme de jours. Tant que le
 * compteur n'a pas ses deux semaines entières, la case dit quand la comparaison sera possible ; avec trop peu de visites,
 * elle donne les deux chiffres sans pour cent : pas de chiffre plutôt qu'un chiffre qui ne veut rien dire.
 */
function Tendance({ trend }: { trend: WeekTrend }) {
  const look = trend.ready ? TREND_LOOK[trend.way] : TREND_EARLY;
  return (
    <div class="dir-activite-chiffre dir-activite-tendance" data-testid="activity-trend">
      <span class="console-libelle font-semibold text-muted">7 derniers jours</span>
      {trend.ready ? (
        <>
          <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="console-valeur tnum font-display text-3xl font-extrabold sm:text-4xl">{fmtInt(trend.current)}</span>
            <Pastille ton={look.tone} testid="activity-trend-way">
              {look.word}
            </Pastille>
          </span>
          <span class="tnum block text-sm text-muted">{trendText(trend)}</span>
        </>
      ) : (
        <>
          <span class="dir-activite-attente">
            <Pastille ton={look.tone} testid="activity-trend-way">
              {look.word}
            </Pastille>
          </span>
          <span class="tnum block text-sm text-muted">{trendWaitText(trend.from)}</span>
        </>
      )}
    </div>
  );
}

/**
 * Des colonnes, une par jour ou par heure. La hauteur vient de la donnée ; la colonne survolée ou touchée écrit sa
 * valeur au-dessus, sinon la plus récente. Le trait du haut porte la plus haute valeur, écrite à son bout. Les mêmes
 * valeurs sont dans le tableau replié dessous : le dessin est masqué aux lecteurs d'écran.
 */
function Colonnes({
  bars,
  slots,
  readout,
  label,
  current,
  ticks,
  initial,
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
  ticks: Map<number, string>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = Math.max(0, ...bars.map((b) => b.value));
  const max = Math.max(1, top);
  const shown = active ?? initial ?? current ?? bars.length - 1;
  const grid = { "--n": String(Math.max(slots, bars.length)) };
  return (
    <div>
      <p class="tnum text-sm" data-testid="activity-readout">
        {readout(shown)}
      </p>
      <div class="dir-activite-trace mt-2" aria-hidden="true">
        <span class="dir-activite-haut tnum">{fmtInt(top)}</span>
        {/* Le survol ne vaut que pour une souris. Au doigt, le toucher choisit la colonne et elle reste lue : un « mouseleave »
            que le navigateur envoie après un toucher (souris fictive restée ailleurs) la faisait revenir aussitôt. */}
        <div
          class="dir-activite-colonnes"
          style={grid}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
        >
          {bars.map((bar, i) => (
            <span
              key={bar.key}
              data-actif={i === shown ? "" : undefined}
              data-encours={i === current ? "" : undefined}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setActive(i);
              }}
              onClick={() => setActive(i)}
            >
              <i style={{ "--v": `${(bar.value / max) * 100}%` }} />
            </span>
          ))}
        </div>
        <div class="dir-activite-reperes tnum" style={grid}>
          {[...ticks].map(([i, text]) => (
            <span key={i} style={{ gridColumn: String(i + 1) }}>
              {text}
            </span>
          ))}
        </div>
      </div>
      <span class="sr-only">{label}</span>
    </div>
  );
}

/** Un bloc de l'onglet : son titre, un chiffre ou une note à droite, son contenu. */
function Bloc({ id, title, aside, testId, children }: { id: string; title: string; aside?: string; testId: string; children: ComponentChildren }) {
  return (
    <section class="dir-activite-bloc card" aria-labelledby={id} data-testid={testId}>
      <div class="dir-activite-bloc-tete">
        <h3 id={id}>{title}</h3>
        {aside && <span class="tnum text-sm text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

interface Rang {
  label: string;
  value: number;
  /** Écrit à droite à la place du nombre seul (une part : le nombre, puis le pour cent). */
  detail?: ComponentChildren;
  /** La longueur du trait, de 0 à 100. */
  length: number;
}

/** Des lignes serrées : le rang, le nom, le nombre, et dessous un trait dont la longueur vient de la donnée. */
function Rangs({ rows, start = 1, numbered = true }: { rows: Rang[]; start?: number; numbered?: boolean }) {
  const List = numbered ? "ol" : "ul";
  return (
    <List class="dir-activite-rangs" start={numbered ? start : undefined}>
      {rows.map((row, i) => (
        <li key={row.label} class="dir-activite-rang">
          {numbered && (
            <span class="dir-activite-place tnum" aria-hidden="true">
              {start + i}
            </span>
          )}
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{row.label}</span>
          <span class="tnum shrink-0">{row.detail ?? fmtInt(row.value)}</span>
          {/* Un zéro n'a pas de trait : la largeur minimale du trait en dessinait un de 2 px. */}
          {row.length > 0 && <i aria-hidden="true" style={{ "--v": `${row.length}%` }} />}
        </li>
      ))}
    </List>
  );
}

/** Une liste classée : les dix premiers, la suite repliée. Les traits sont à la mesure du premier de toute la liste. */
function Classement({ id, title, period, rows, testId }: { id: string; title: string; period: string; rows: { label: string; value: number }[]; testId: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const all = rows.map((r) => ({ ...r, length: traitLength(r.value, max) }));
  const rest = all.slice(10);
  return (
    <Bloc id={id} title={title} aside={period} testId={testId}>
      <Rangs rows={all.slice(0, 10)} />
      {rest.length > 0 && (
        <details class="fold dir-activite-repli">
          <summary class="text-sm font-semibold">{rest.length === 1 ? "La suivante" : `Les ${fmtInt(rest.length)} suivantes`}</summary>
          <Rangs rows={rest} start={11} />
        </details>
      )}
    </Bloc>
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

  // `aria-disabled` et non `disabled` pendant la lecture : un bouton désactivé perd le focus, qui tombait sur la page après
  // « Actualiser » au clavier. Un deuxième appui pendant la lecture ne relance rien.
  const reload = (
    <button
      type="button"
      class="btn btn-ghost"
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) void load();
      }}
      data-testid="activity-reload"
    >
      Actualiser
    </button>
  );

  return (
    <section class="dir-activite" aria-labelledby="activite-titre" data-testid="direction-activity">
      <PartieTete id="activite-titre" title="Activité du site" aside={reload}>
        {/* Le total et l'heure de la lecture : la zone existe avant d'être remplie, pour être annoncée à chaque lecture. */}
        <p class="tnum" role="status" data-testid="activity-read-at">
          {data?.since && `Depuis le ${fmtLongDay(data.since)} : ${fmtInt(data.total.visitors)} ${visitsWord(data.total.visitors)}, ${fmtInt(data.total.views)} ${viewsWord(data.total.views)}. `}
          {data && `Lu à ${timeParis.format(new Date(data.read_at))}, heure de Paris.`}
        </p>
      </PartieTete>
      <div class="dir-activite-corps">
        <Problem message={error} onRetry={() => void load()} />
        {data === null ? (
          !error && <Loading />
        ) : data.since === null ? (
          <p class="dir-note" data-testid="activity-empty">
            Pas encore de visite comptée.
          </p>
        ) : (
          <Tableau data={data} />
        )}
      </div>
    </section>
  );
}

function Tableau({ data }: { data: SiteActivity }) {
  // Aujourd'hui est toujours compté (`since` n'est pas nul ici) : sans ligne, c'est un vrai zéro.
  const today = data.days.find((d) => d.day === data.today);
  const yesterday = yesterdayVisitors(data);

  // La période des listes et des parts : 30 jours, ou moins si le compteur est plus jeune.
  const counted = lastDays(data, 30).filter((d): d is DayBar & { visitors: number; views: number } => d.visitors !== null);
  const countedDays = counted.map((d) => d.day);
  const period = periodText(data);
  const trend = weekTrend(data);
  const { visits, shares } = visitShares(data.days);

  const hours = allHours(data.hours);
  const hourViews = hours.reduce((total, h) => total + h.views, 0);
  const busiest = busiestHour(hours);

  // Un seul jour compté ne fait pas une courbe : le graphique des jours attend le deuxième.
  const withDays = counted.length >= 2;

  return (
    <>
      <div class="dir-activite-chiffres">
        {/* Des libellés courts : sur un téléphone, la case n'a la place que pour un mot par ligne. */}
        <Chiffre label="Aujourd'hui" value={today?.visitors ?? 0} sub={`${visitorsWord(today?.visitors ?? 0)}${yesterday === null ? "" : `, hier ${fmtInt(yesterday)}`}`} testId="activity-today" />
        <Chiffre label="Cette semaine" value={data.week.visitors} sub={`${visitorsWord(data.week.visitors)} depuis lundi`} testId="activity-week" />
        <Chiffre label="Ce mois-ci" value={data.month.visitors} sub={`${visitorsWord(data.month.visitors)} depuis le 1er`} testId="activity-month" />
        <Chiffre label="Pages vues" value={today?.views ?? 0} sub="aujourd'hui" testId="activity-views" />
        {trend && <Tendance trend={trend} />}
      </div>

      {(withDays || hourViews > 0) && (
        <div class="dir-activite-graphes" data-seul={withDays && hourViews > 0 ? undefined : ""}>
          {withDays && (
            <Bloc id="activite-jours" title="Visiteurs par jour" aside={period} testId="activity-days">
              <Colonnes
                bars={counted.map((d) => ({ key: d.day, value: d.visitors }))}
                slots={14}
                current={counted.length - 1}
                readout={(i) => {
                  const d = counted[i];
                  return d ? dayReadout(d, data.today) : "";
                }}
                label="Les mêmes chiffres, jour par jour, sont dans le tableau qui suit."
                ticks={new Map(weekTicks(countedDays).map((i) => [i, dayWords(countedDays[i] ?? data.today)]))}
              />
              <p class="dir-activite-legende">{dayTicksLegend(countedDays)}</p>
              <details class="fold dir-activite-repli">
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
                        <th scope="row">{dayWords(d.day)}</th>
                        <td>{fmtInt(d.visitors)}</td>
                        <td>{fmtInt(d.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Bloc>
          )}

          {hourViews > 0 && (
            <Bloc id="activite-heures" title="Pages vues selon l'heure" aside={period} testId="activity-hours">
              <Colonnes
                bars={hours.map((h) => ({ key: String(h.hour), value: h.views }))}
                slots={24}
                initial={busiest}
                readout={(i) => {
                  const h = hours[i];
                  return h ? hourReadout(h) : "";
                }}
                label="Les mêmes chiffres, heure par heure, sont dans le tableau qui suit."
                ticks={new Map([0, 6, 12, 18].map((h) => [h, `${h} h`]))}
              />
              <p class="dir-activite-legende">Heure de Paris. En blanc : l'heure lue au-dessus.</p>
              <details class="fold dir-activite-repli">
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
            </Bloc>
          )}
        </div>
      )}

      <div class="dir-activite-listes">
        {data.pages.length > 0 && <Classement id="activite-pages" title="Pages les plus vues" period={period} rows={namedPages(data.pages)} testId="activity-pages" />}
        {data.sources.length > 0 && (
          // « visites » : une somme de jours, comme le total et la tendance (un navigateur venu trois jours compte trois fois).
          <Classement id="activite-sources" title="D'où arrivent les visites" period={period} rows={data.sources.map((s) => ({ label: SOURCE_LABELS[s.source as VisitSource] ?? s.source, value: s.visitors }))} testId="activity-sources" />
        )}
        {visits > 0 && (
          <Bloc id="activite-qui" title="Les visites" aside={`${fmtInt(visits)} ${period}`} testId="activity-who">
            <Rangs
              numbered={false}
              rows={shares.map((s) => ({
                label: s.label,
                value: s.count,
                length: s.percent ?? 0,
                detail: (
                  <>
                    <span class="text-muted">{fmtInt(s.count)}, soit </span>
                    <strong>{fmtInt(s.percent)} %</strong>
                  </>
                ),
              }))}
            />
          </Bloc>
        )}
      </div>

      <details class="fold">
        <summary class="font-semibold">Comment c'est compté</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Le site compte lui-même, sans cookie, sans adresse IP et sans service extérieur. Chaque navigateur garde seulement la date de sa dernière visite : il compte une fois par jour, une fois par semaine et une fois par mois. Une visite : un navigateur, un jour. Un joueur qui vient avec son téléphone et son ordinateur compte deux fois ; un navigateur dont on efface les données compte de nouveau.</p>
          <p>Ne comptent pas : les programmes de test et les robots qui se déclarent comme tels, les navigateurs qui demandent de ne pas être suivis ou dont le visiteur a refusé d'être compté (page Confidentialité), et les visites sans JavaScript. Un navigateur qui ne garde rien ne compte que des pages vues. « Sans provenance » : un favori, une adresse tapée, ou un lien ouvert depuis une application, Discord compris. « Venus pour la première fois » : sans aucune trace d'une visite d'avant dans ce navigateur.</p>
          <p>{TREND_HELP}</p>
        </div>
      </details>
    </>
  );
}
