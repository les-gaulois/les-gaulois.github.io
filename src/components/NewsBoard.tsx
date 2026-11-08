import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ServerError, call, mayHaveSession } from "../lib/compte/api";
import {
  fetchLiveNews,
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
import NewsPolls from "./NewsPolls";

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
 * Les annonces, les événements et les sondages de l'accueil. Le HTML construit contient ceux du dépôt.
 * Avec `live`, le navigateur y ajoute ceux publiés depuis l'espace Direction. Un membre validé connecté
 * peut en plus répondre « Je viens » et voter : sans session, rien de Supabase n'est chargé pour cela.
 */
export default function NewsBoard({ announcements, events, now, live = false }: { announcements: StaticAnnouncement[]; events: StaticEvent[]; now: number; live?: boolean }) {
  const [news, setNews] = useState<LiveNews>({ announcements: [], events: [], polls: [] });
  const [mine, setMine] = useState<Participation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ce que les lecteurs d'écran entendent après une réponse ou un vote : la zone existe déjà, seul son texte change.
  const [said, setSaid] = useState("");

  const reload = async () => {
    const data = await fetchLiveNews();
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

  const vote = async (poll: number, choice: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      await call("vote_poll", { p_poll: poll, p_choice: choice });
      setMine((current) => (current ? { ...current, votes: new Map(current.votes).set(poll, choice) } : current));
      // Les totaux viennent du serveur : on les relit plutôt que de les recompter ici.
      await reload();
      const label = news.polls.find((p) => p.id === poll)?.options[choice];
      setSaid(label ? `Vote enregistré : ${label}.` : "Vote enregistré.");
    } catch (e) {
      setError(refusal(e));
    } finally {
      setBusy(false);
    }
  };

  const allAnnouncements = mergeAnnouncements(announcements, news.announcements);
  const allEvents = mergeEvents(events, news.events, now);
  const polls = news.polls;
  // Sans annonce, événement ni sondage, le bloc n'existe pas : un visiteur n'a rien à y lire.
  if (allAnnouncements.length === 0 && allEvents.length === 0 && polls.length === 0) return null;

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
    <section class="grid gap-6 md:grid-cols-2" aria-label="Annonces, événements et sondages" data-testid="news-board">
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
      {polls.length > 0 && (
        <div class="md:col-span-2">
          <h2 class="text-2xl">Sondages</h2>
          <NewsPolls polls={polls} votes={mine?.votes ?? null} busy={busy} onVote={(poll, choice) => void vote(poll, choice)} />
          {mine === null && polls.some((p) => p.is_open) && <p class="mt-3 text-sm text-muted">Les membres validés votent ici, une fois connectés.</p>}
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
