import { useEffect, useState } from "preact/hooks";
import { fetchLiveNews, mergeAnnouncements, mergeEvents, type LiveNews, type NewsItem, type StaticAnnouncement, type StaticEvent } from "../lib/compte/news";
import { fmtDate, fmtDateTime } from "../lib/format";

function Items({ items, date, testId }: { items: NewsItem[]; date: (iso: string) => string; testId: string }) {
  return (
    <ul class="mt-4 space-y-3" data-testid={testId}>
      {items.map((item) => (
        <li key={item.key} class="card p-5">
          <p class="tnum text-sm text-muted">{date(item.at)}</p>
          <h3 class="mt-1 text-lg">{item.title}</h3>
          {item.body && <p class="mt-2 whitespace-pre-line text-muted">{item.body}</p>}
          {item.url && (
            <a href={item.url} rel="noopener" class="mt-2 inline-block text-blue-text underline">
              En savoir plus
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Les annonces et les événements de l'accueil. Le HTML construit contient ceux du dépôt.
 * Avec `live`, le navigateur y ajoute ceux publiés depuis l'espace Direction.
 */
export default function NewsBoard({ announcements, events, now, live = false }: { announcements: StaticAnnouncement[]; events: StaticEvent[]; now: number; live?: boolean }) {
  const [news, setNews] = useState<LiveNews>({ announcements: [], events: [] });

  useEffect(() => {
    if (!live) return;
    void fetchLiveNews().then((data) => {
      if (data) setNews(data);
    });
  }, [live]);

  const allAnnouncements = mergeAnnouncements(announcements, news.announcements);
  const allEvents = mergeEvents(events, news.events, now);
  // Sans annonce ni événement, le bloc n'existe pas : un visiteur n'a rien à y lire.
  if (allAnnouncements.length === 0 && allEvents.length === 0) return null;
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
          <Items items={allEvents} date={fmtDateTime} testId="news-events" />
        </div>
      )}
    </section>
  );
}

