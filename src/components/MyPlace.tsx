import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import { gamesOf, placeOf, rateOf, suggestMembers } from "../lib/members";
import { hasLeftList, ME_KEY, rememberedMember } from "../lib/moi";
import { ME_VISIT_KEY, meVisitLines, nextMeVisitState, readMeVisitState, type MeSnapshot } from "../lib/moi-visite";
import { nextTier } from "../lib/paliers";
import type { StoredMember, StoredMembers } from "../lib/schemas";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: StoredMembers };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ordinal = (n: number) => `${n}${n === 1 ? "er" : "e"}`;
const nameOf = (m: StoredMember) => m.username ?? "un membre anonyme";

function Result({ members, member }: { members: readonly StoredMember[]; member: StoredMember }) {
  const place = placeOf(members, member);
  if (!place) {
    return (
      <p class="mt-4 font-semibold" data-testid="my-place-result">
        {member.username} : pas de données pour ce membre.
      </p>
    );
  }
  const games = gamesOf(member) ?? 0;
  if (games === 0) {
    return (
      <p class="mt-4 font-semibold" data-testid="my-place-result">
        {member.username} : aucune partie sous le tag pour l'instant. Une victoire avec le tag GAL, et vous entrez dans le classement.
      </p>
    );
  }
  const target = place.next?.team?.wins ?? place.wins;
  const tier = nextTier(place.wins);
  return (
    <div class="mt-4 grid gap-4 sm:grid-cols-2" data-testid="my-place-result">
      <div>
        <p class="truncate text-sm font-semibold text-muted">
          {member.publicId ? <a href={`${BASE}/membres/${encodeURIComponent(member.publicId)}`}>{member.username}</a> : member.username}
        </p>
        <p class="figure text-4xl">{ordinal(place.rank)}</p>
        <p class="tnum text-sm text-muted">sur {fmtInt(place.ranked)} membres, aux victoires sous le tag</p>
        <p class="tnum mt-2 text-sm">
          {fmtInt(place.wins)} victoires · {fmtInt(member.team?.losses ?? 0)} défaites · {fmtPct(rateOf(member))}
        </p>
        {tier && (
          <p class="tnum mt-1 text-sm text-muted" data-testid="my-place-tier">
            Prochain palier : {fmtInt(tier.wins)} victoires, encore {fmtInt(tier.missing)}.
          </p>
        )}
      </div>
      <div>
        {place.next && place.missing !== null ? (
          <>
            <p class="font-semibold">Prochain à dépasser : {nameOf(place.next)}</p>
            <p class="tnum text-sm text-muted">
              Encore {fmtInt(place.missing)} {place.missing > 1 ? "victoires" : "victoire"} sous le tag.
            </p>
            <div class="meter mt-2" aria-hidden="true">
              <i style={{ "--v": `${target > 0 ? (place.wins / target) * 100 : 0}%` }}></i>
            </div>
          </>
        ) : (
          <p class="font-semibold">Personne devant : vous menez le clan aux victoires sous le tag.</p>
        )}
        {place.behind && place.lead !== null && (
          <p class="tnum mt-2 text-sm text-muted">
            Juste derrière : {nameOf(place.behind)}, à {fmtInt(place.lead)} {place.lead > 1 ? "victoires" : "victoire"}.
          </p>
        )}
      </div>
    </div>
  );
}

/** Chaque membre retrouve sa place à partir de son pseudo, avec les données déjà publiées sur la page Membres. */
export default function MyPlace({ src }: { src: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StoredMember | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Rien n'est chargé tant que personne n'a tapé de pseudo ni retenu le sien : l'accueil reste léger.
  const [wanted, setWanted] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  /** Ce qui a changé pour le membre retenu depuis sa dernière visite : ses chiffres d'alors restent dans son navigateur. */
  const [since, setSince] = useState<{ date: string; lines: string[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const forgetButton = useRef<HTMLButtonElement>(null);
  // Le bouton utilisé disparaît : le clavier reprend sur celui qui le remplace.
  const focusNext = useRef<"forget" | "input" | null>(null);

  // Un pseudo tapé avant le démarrage du composant n'est pas perdu.
  useLayoutEffect(() => {
    if (input.current?.value) {
      setQuery(input.current.value);
      setWanted(true);
    }
    try {
      const stored = localStorage.getItem(ME_KEY);
      if (stored) {
        setSavedId(stored);
        setWanted(true);
      }
    } catch {
      // Stockage indisponible : on tape son pseudo à chaque fois.
    }
  }, []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: StoredMembers) => {
        if (!cancelled) setState({ status: "ready", data: json });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [src, attempt, wanted]);

  const members = state.status === "ready" ? state.data.members : [];
  const saved = useMemo(() => rememberedMember(members, savedId), [members, savedId]);

  useEffect(() => {
    if (state.status !== "ready" || !saved?.publicId) return;
    const place = placeOf(state.data.members, saved);
    if (!place) return;
    const current: MeSnapshot = { id: saved.publicId, at: state.data.fetchedAt, wins: place.wins, losses: saved.team?.losses ?? 0, rank: place.rank, ranked: place.ranked };
    try {
      const next = nextMeVisitState(readMeVisitState(localStorage.getItem(ME_VISIT_KEY)), current, new Date());
      localStorage.setItem(ME_VISIT_KEY, JSON.stringify(next));
      setSince({ date: fmtDate(next.since), lines: meVisitLines(next.baseline, current) });
    } catch {
      // Stockage indisponible : pas de résumé personnel, la place s'affiche quand même.
    }
  }, [state, saved]);
  const matches = useMemo(() => suggestMembers(members, query), [members, query]);
  // Un seul résultat, ou un pseudo exact : inutile de demander de choisir.
  const exact = matches.find((m) => m.username?.toLowerCase() === query.trim().toLowerCase());
  const chosen = picked ?? exact ?? (matches.length === 1 ? (matches[0] ?? null) : null);

  useEffect(() => {
    if (focusNext.current === "forget") forgetButton.current?.focus();
    if (focusNext.current === "input") input.current?.focus();
    focusNext.current = null;
  }, [savedId]);

  // Parti du clan, ou devenu anonyme : son identifiant n'a plus à rester sur cet appareil.
  useEffect(() => {
    if (state.status !== "ready" || !hasLeftList(state.data.members, savedId)) return;
    try {
      localStorage.removeItem(ME_KEY);
      localStorage.removeItem(ME_VISIT_KEY);
    } catch {
      // Rien à retirer.
    }
    setSavedId(null);
    setGone(true);
  }, [state, savedId]);

  const remember = (member: StoredMember) => {
    if (!member.publicId) return;
    try {
      localStorage.setItem(ME_KEY, member.publicId);
    } catch {
      // Stockage indisponible : le résultat reste affiché, sans être retenu.
    }
    focusNext.current = "forget";
    setGone(false);
    setSavedId(member.publicId);
    setQuery("");
    setPicked(null);
  };
  const forget = () => {
    try {
      localStorage.removeItem(ME_KEY);
      localStorage.removeItem(ME_VISIT_KEY);
    } catch {
      // Rien à retirer.
    }
    focusNext.current = "input";
    setSavedId(null);
    setSince(null);
  };

  // Après un « Réessayer », le champ reste là : le clavier s'y pose, au lieu de retomber en haut de la page.
  if (savedId && state.status === "loading" && attempt === 0) {
    return <p class="text-sm text-muted" role="status" data-testid="my-place-loading">Chargement de votre place…</p>;
  }

  // Le joueur retenu : sa place tout de suite, sans champ de recherche.
  if (saved) {
    return (
      <div>
        <Result members={members} member={saved} />
        {since && since.lines.length > 0 && (
          <div class="tnum mt-4 text-sm" data-testid="my-place-since">
            <p class="font-semibold">Pour vous, depuis votre dernière visite, le {since.date}</p>
            <ul class="mt-1 grid gap-0.5 text-muted">
              {since.lines.map((line) => (
                <li key={line} data-testid="my-place-since-line">{line}</li>
              ))}
            </ul>
          </div>
        )}
        <button ref={forgetButton} type="button" class="mt-4 text-sm underline underline-offset-2" onClick={forget} data-testid="my-place-forget">
          Changer de pseudo
        </button>
      </div>
    );
  }

  return (
    <div>
      {gone && (
        <p class="mb-3 text-sm text-muted" role="status" data-testid="my-place-gone">
          Le pseudo retenu n'est plus dans la liste publique du clan : il n'est plus gardé sur cet appareil.
        </p>
      )}
      <label for="my-place-name" class="text-sm font-semibold">
        Votre pseudo dans le jeu
      </label>
      <input
        id="my-place-name"
        ref={input}
        class="field mt-1"
        type="search"
        autocomplete="off"
        placeholder="Tapez votre pseudo"
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setPicked(null);
          setWanted(true);
        }}
      />
      {state.status === "error" && (
        <p class="mt-3 text-sm font-semibold text-warn" role="alert">
          La liste des membres n'a pas pu être chargée.{" "}
          <button
            type="button"
            class="underline"
            onClick={() => {
              setAttempt((n) => n + 1);
              input.current?.focus();
            }}
          >
            Réessayer
          </button>
        </p>
      )}
      {query.trim() !== "" && state.status === "ready" && matches.length === 0 && (
        <p class="mt-3 text-sm text-muted" role="status">
          Aucun membre avec ce pseudo. Les membres sans pseudo public ne peuvent pas être cherchés.
        </p>
      )}
      {!chosen && matches.length > 1 && (
        <ul class="film-moments mt-3" aria-label="Pseudos trouvés">
          {matches.map((m) => (
            <li key={m.publicId ?? m.username}>
              <button type="button" class="chip" onClick={() => setPicked(m)}>
                {m.username}
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen && (
        <>
          <Result members={members} member={chosen} />
          {chosen.publicId && (
            <button type="button" class="btn btn-secondary mt-4" onClick={() => remember(chosen)} data-testid="my-place-remember">
              C'est moi : retenir sur cet appareil
            </button>
          )}
        </>
      )}
    </div>
  );
}
