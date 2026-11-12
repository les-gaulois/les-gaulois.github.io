import { useEffect, useState } from "preact/hooks";
import { fetchLiveNewsOnce, pickWeekEnding, type WeeklyPick } from "../lib/compte/news";

/** Où mène le pseudo : sa fiche ; nulle part si la liste publique est illisible ; `gone` s'il n'est plus dans la liste. */
type Place = { kind: "link"; href: string } | { kind: "plain" } | { kind: "gone" };

/**
 * Le Gaulois de la semaine sur l'accueil : un membre choisi par l'encadrement depuis l'espace Direction, avec son mot.
 * Il vient du serveur au chargement de la page, dans la même lecture que les annonces (`fetchLiveNewsOnce`) : rien n'est
 * écrit dans la page publiée. Le nom de qui l'a choisi n'est jamais donné. Le bloc n'existe pas sans choix, si le serveur
 * ne répond pas, ou si le joueur n'est plus dans la liste publique du clan (parti, ou pseudo retiré) : comme la gazette,
 * le site ne nomme plus un joueur qu'il ne trouve plus. Il n'apparaît qu'une fois la liste lue, pour ne pas clignoter.
 * Son titre, « À l'honneur », le distingue du bloc « Les Gaulois de la semaine » qui l'entoure ; il ne dit pas « cette
 * semaine », car le serveur montre encore le choix de la semaine passée tant qu'aucun autre n'est fait : la ligne du dessous
 * donne sa semaine. `class` : sa place dans la grille de ce bloc.
 */
export default function WeeklyPickCard({ membersSrc, fichesBase, class: placement }: { membersSrc: string; fichesBase: string; class?: string }) {
  const [pick, setPick] = useState<WeeklyPick | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    void fetchLiveNewsOnce().then((news) => setPick(news?.weeklyPick ?? null));
  }, []);

  useEffect(() => {
    if (!pick) return;
    fetch(membersSrc)
      .then((res) => (res.ok ? (res.json() as Promise<{ members?: unknown }>) : null))
      .then((list) => {
        if (!list || !Array.isArray(list.members)) {
          setPlace({ kind: "plain" });
          return;
        }
        // Comme `singlePseudos` : un pseudo porté par deux membres garde son nom, sans lien, plutôt que la fiche de l'autre.
        const same = (list.members as { username?: string | null; publicId?: string | null }[]).filter((m) => m.username?.toLocaleLowerCase("fr") === pick.player.toLocaleLowerCase("fr"));
        const exact = same.find((m) => m.username === pick.player);
        if (!exact) setPlace({ kind: "gone" });
        else if (same.length > 1 || !exact.publicId) setPlace({ kind: "plain" });
        else setPlace({ kind: "link", href: `${fichesBase}/${encodeURIComponent(exact.publicId)}` });
      })
      .catch(() => setPlace({ kind: "plain" }));
  }, [pick]);

  if (!pick || place === null || place.kind === "gone") return null;
  return (
    <div class={placement ? `panel ${placement}` : "panel"} data-testid="weekly-pick">
      <h3 class="text-xl">À l'honneur</h3>
      <p class="tnum mt-1 text-sm text-muted">Choisi par l'encadrement, pour {pickWeekEnding(pick.week)}</p>
      <p class="mt-3 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">{place.kind === "link" ? <a href={place.href}>{pick.player}</a> : pick.player}</p>
      {pick.note && <p class="mt-2 max-w-3xl whitespace-pre-line text-muted [overflow-wrap:anywhere]">« {pick.note} »</p>}
    </div>
  );
}
