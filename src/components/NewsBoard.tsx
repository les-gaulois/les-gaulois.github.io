import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ServerError, call, mayHaveSession } from "../lib/compte/api";
import {
  fetchLiveNewsOnce,
  fetchMyParticipation,
  goingLabel,
  mergeAnnouncements,
  mergeEvents,
  seriesNote,
  type LiveNews,
  type NewsItem,
  type Participation,
  type StaticAnnouncement,
  type StaticEvent,
} from "../lib/compte/news";
import { fmtDate, fmtDateTime } from "../lib/format";

function Items({ items, date, testId, extra }: { items: NewsItem[]; date: (iso: string) => string; testId: string; extra?: (item: NewsItem) => ComponentChildren }) {
  return (
    <ul class="mt-4 space-y-3" data-testid={testId}>
      {items.map((item) => (
        <li key={item.key} class="card p-5">
          <p class="tnum text-sm text-muted">{date(item.at)}</p>
          <h3 class="mt-1 text-lg [overflow-wrap:anywhere]">{item.title}</h3>
          {item.body && <p class="mt-2 whitespace-pre-line text-muted">{item.body}</p>}
          {item.url && (
            <a href={item.url} rel="noopener" class="mt-2 inline-block text-blue-text underline">
              En savoir plus
            </a>
          )}
          {extra?.(item)}
        </li>
      ))}
    </ul>
  );
}

const refusal = (e: unknown) => (e instanceof ServerError ? e.message : "Le serveur ne répond pas pour l'instant. Réessayez dans un moment.");

/**
 * Les annonces et les événements de l'accueil : la face publique. Le HTML construit contient ceux du dépôt.
 * Avec `live`, le navigateur y ajoute ceux publiés depuis l'espace Direction. Un membre validé connecté
 * peut en plus répondre « Je viens » : sans session, rien de Supabase n'est chargé pour cela.
 * Les sondages n'y sont plus : ils sont au QG, réservé aux membres validés.
 */
export default function NewsBoard({ announcements, events, now, live = false }: { announcements: StaticAnnouncement[]; events: StaticEvent[]; now: number; live?: boolean }) {
  const [news, setNews] = useState<LiveNews>({ announcements: [], events: [], weeklyPick: null });
  const [mine, setMine] = useState<Participation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ce que les lecteurs d'écran entendent après une réponse : la zone existe déjà, seul son texte change.
  const [said, setSaid] = useState("");

  // La première lecture est partagée avec le Gaulois de la semaine, plus bas sur l'accueil : un seul appel au serveur.
  const reload = async () => {
    const data = await fetchLiveNewsOnce();
    if (data) setNews(data);
  };

  useEffect(() => {
    if (!live) return;
    void reload();
    if (mayHaveSession()) void fetchMyParticipation().then(setMine);
  }, [live]);

  const answer = async (event: number, going: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      const result = await call<{ going: number }>("set_attendance", { p_event: event, p_going: going });
      setNews((current) => ({ ...current, events: current.events.map((e) => (e.id === event ? { ...e, going: result.going } : e)) }));
      setMine((current) => {
        if (!current) return current;
        const events = new Set(current.events);
        if (going) events.add(event);
        else events.delete(event);
        return { ...current, events };
      });
      setSaid(going ? "Votre présence est notée." : "Votre présence est retirée.");
    } catch (e) {
      setError(refusal(e));
    } finally {
      setBusy(false);
    }
  };

  const allAnnouncements = mergeAnnouncements(announcements, news.announcements);
  const allEvents = mergeEvents(events, news.events, now);
  // Sans annonce ni événement, le bloc n'existe pas : un visiteur n'a rien à y lire.
  if (allAnnouncements.length === 0 && allEvents.length === 0) return null;

  const eventExtra = (item: NewsItem) => {
    const going = goingLabel(item.going);
    const series = seriesNote(item.series);
    const coming = item.eventId !== undefined && mine !== null && mine.events.has(item.eventId);
    return (
      <>
        {(series || going) && <p class="tnum mt-2 text-sm text-muted">{[series, going].filter(Boolean).join(" · ")}</p>}
        {item.eventId !== undefined && mine !== null && (
          <div class="mt-3 flex flex-wrap items-center gap-2">
            {/* Pas de `disabled` pendant l'envoi : un bouton désactivé perd le focus du clavier. */}
            <button type="button" class="chip !min-h-9" aria-pressed={coming} aria-disabled={busy || undefined} onClick={() => void answer(item.eventId as number, !coming)} data-testid="news-going">
              Je viens
            </button>
            {coming && <span class="text-sm text-muted">Votre présence est notée.</span>}
          </div>
        )}
      </>
    );
  };

  return (
    <section class="grid gap-6 md:grid-cols-2" aria-label="Annonces et événements" data-testid="news-board">
      {allAnnouncements.length > 0 && (
        <div>
          <h2 class="text-2xl">Annonces</h2>
          <Items items={allAnnouncements} date={fmtDate} testId="news-announcements" />
        </div>
      )}
      {allEvents.length > 0 && (
        <div>
          <h2 class="text-2xl">Événements à venir</h2>
          <Items items={allEvents} date={fmtDateTime} testId="news-events" extra={eventExtra} />
        </div>
      )}
      {error && (
        <p class="form-problem md:col-span-2" role="alert">
          {error}
        </p>
      )}
      <p class="sr-only" role="status">
        {said}
      </p>
    </section>
  );
}
