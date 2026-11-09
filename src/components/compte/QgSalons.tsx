import { createPortal } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { FORMAT_ORDER, LOBBY_FORMATS, callKey, callSentence, freshCalls, lobbyIdOf, lobbyUrl, parseLobbyCalls, salonOf, seatsNote, sinceLabel, type LobbyCall, type LobbyCalls, type LobbyFormat } from "../../lib/compte/salons";
import { Avatar, Problem, messageOf } from "./common";

/** Une relecture toutes les 20 secondes : un salon pris loin dans la file laisse plusieurs minutes. En arrière-plan, le navigateur peut espacer ses minuteries jusqu'à une minute. */
const REFRESH_MS = 20_000;
/** Les pop-ups montrés ensemble sur un grand écran, un seul sur téléphone ; les suivants restent dans la liste du QG. */
const POPUPS_SHOWN = 2;
const othersWaiting = (n: number) => (n === 1 ? "Un autre appel attend dans la liste du QG" : `${n} autres appels attendent dans la liste du QG`);
/** Ce que ce navigateur garde, et lui seul : le choix du son, et les appels déjà fermés d'un clic sur la croix. */
const SOUND_KEY = "gal-qg-son";
const CLOSED_KEY = "gal-qg-appels-fermes";
const CLOSED_KEPT = 50;

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : le choix vaut seulement pour cette page.
  }
}

function closedKeys(): string[] {
  try {
    const list: unknown = JSON.parse(readStore(CLOSED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/* ---------- Le son : deux notes douces, jouées par le navigateur, sans fichier ---------- */

let audioContext: AudioContext | null = null;

function audio(): AudioContext | null {
  if (audioContext) return audioContext;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    audioContext = new Context();
  } catch {
    return null;
  }
  return audioContext;
}

/** À lancer pendant un clic ou une touche : un navigateur ne laisse une page jouer un son qu'après un geste de son visiteur. */
async function unlockAudio(): Promise<boolean> {
  const context = audio();
  if (!context) return false;
  if (context.state !== "running") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  return context.state === "running";
}

/** Un appel, pas une alarme : deux notes brèves qui montent, à volume modéré, moins d'une seconde en tout. */
function chime(): void {
  const context = audio();
  if (!context || context.state !== "running") return;
  const start = context.currentTime + 0.02;
  for (const [frequency, delay] of [
    [660, 0],
    [880, 0.18],
  ] as const) {
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start + delay);
    volume.gain.exponentialRampToValueAtTime(0.18, start + delay + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.5);
    tone.connect(volume).connect(context.destination);
    tone.start(start + delay);
    tone.stop(start + delay + 0.55);
  }
}

/* ---------- L'affichage ---------- */

/** Ce qu'on sait d'un appel : qui, où, depuis quand, la place qui reste, et le lien du salon tant que l'appel dure. */
function CallBody({ call: item, now, ended = false }: { call: LobbyCall; now: number; ended?: boolean }) {
  const seats = seatsNote(item.format);
  return (
    <>
      <div class="mt-2 flex items-center gap-3">
        <Avatar name={item.name} avatar={item.avatar} />
        <p class="min-w-0 font-semibold [overflow-wrap:anywhere]">{callSentence(item)}</p>
      </div>
      <p class="tnum mt-1 text-sm text-muted">{ended ? "Cet appel est terminé." : `Appel lancé ${sinceLabel(item.createdAt, now)}.`}</p>
      {!ended && seats && <p class="mt-1 text-sm text-muted">{seats}</p>}
      {!ended && (
        <a class="btn btn-primary mt-3 !min-h-10 !py-1.5 !text-sm" href={lobbyUrl(item.game)} target="_blank" rel="noopener" data-testid="qg-salons-join">
          Rejoindre la partie<span class="sr-only"> (nouvel onglet)</span>
        </a>
      )}
    </>
  );
}

/**
 * Rejoindre un Gaulois : les appels aux salons, au QG. Un membre validé colle le lien de son salon d'OpenFront ; les
 * membres validés qui ont le QG ouvert le voient dans la liste et dans un pop-up qui reste jusqu'à la croix, avec un son
 * s'ils l'ont gardé. Le site ne lit rien chez OpenFront. Le serveur revérifie chaque appel (`save_lobby_call`).
 */
export default function QgSalons() {
  const [data, setData] = useState<LobbyCalls | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [popups, setPopups] = useState<LobbyCall[]>([]);
  const [said, setSaid] = useState("");
  const [soundOn, setSoundOn] = useState(() => readStore(SOUND_KEY) !== "0");
  const [audioReady, setAudioReady] = useState(false);
  const [link, setLink] = useState("");
  const [format, setFormat] = useState<LobbyFormat | "">("");
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  // L'écart entre l'heure du serveur et celle de ce navigateur : les minutes se comptent à l'heure du serveur.
  const offset = useRef(0);
  // Les appels déjà montrés dans cette page, et ceux fermés d'un clic sur la croix, même lors d'une visite précédente.
  const seen = useRef<Set<string>>(new Set(closedKeys()));
  const soundWanted = useRef(soundOn);
  soundWanted.current = soundOn;
  const baseTitle = useRef<string | null>(null);
  const popupBox = useRef<HTMLDivElement>(null);
  const open = popups.length > 0;

  const load = useCallback(async () => {
    try {
      const answer = parseLobbyCalls(await call<unknown>("get_lobby_calls"));
      if (answer === null) {
        setLoadProblem("La réponse du serveur est illisible. La liste réessaie toute seule.");
        return;
      }
      offset.current = answer.now - Date.now();
      setData(answer);
      setLoadProblem(null);
      const fresh = freshCalls(answer.calls, seen.current);
      if (fresh.length === 0) return;
      for (const item of fresh) seen.current.add(callKey(item));
      setPopups((shown) => [...fresh, ...shown]);
      setSaid(fresh.map(callSentence).join(" "));
      if (soundWanted.current) chime();
    } catch (e) {
      setLoadProblem(`${messageOf(e)} La liste réessaie toute seule.`);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const minutes = window.setInterval(() => setTick((n) => n + 1), 30_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(minutes);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Le son attend le premier geste du membre sur la page, comme l'exigent les navigateurs.
  useEffect(() => {
    if (!soundOn || audioReady) return;
    const onGesture = () => void unlockAudio().then(setAudioReady);
    document.addEventListener("pointerdown", onGesture, { once: true });
    document.addEventListener("keydown", onGesture, { once: true });
    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, [soundOn, audioReady]);

  // Le titre de l'onglet compte les pop-ups ouverts, sans clignoter : il se voit même quand le QG est en arrière-plan.
  useEffect(() => {
    baseTitle.current ??= document.title;
    document.title = popups.length > 0 ? `(${popups.length}) ${baseTitle.current}` : baseTitle.current;
  }, [popups.length]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  const close = useCallback((item: LobbyCall) => {
    const key = callKey(item);
    setPopups((shown) => shown.filter((other) => callKey(other) !== key));
    writeStore(CLOSED_KEY, JSON.stringify([...closedKeys().filter((other) => other !== key), key].slice(-CLOSED_KEPT)));
  }, []);

  // Le pop-up reste en bas de l'écran : tant qu'il est ouvert, la page garde au-dessus de lui la place de l'élément qui a le
  // focus et du bas de la page (WCAG 2.2, 2.4.11). Rien n'est caché dessous, au clavier comme au doigt.
  useEffect(() => {
    const box = popupBox.current;
    if (!open || !box) return;
    const root = document.documentElement;
    const fit = () => {
      const room = `${Math.ceil(box.getBoundingClientRect().height) + 24}px`;
      root.style.scrollPaddingBottom = room;
      document.body.style.paddingBottom = room;
    };
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(box);
    return () => {
      observer?.disconnect();
      root.style.scrollPaddingBottom = "";
      document.body.style.paddingBottom = "";
    };
  }, [open]);

  // Échap ferme le pop-up le plus récent, sans déplacer le focus. Un menu ouvert de l'en-tête, qui écoute aussi Échap, passe d'abord.
  useEffect(() => {
    const newest = popups[0];
    if (!newest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("details[data-menu][open]")) return;
      close(newest);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [popups, close]);

  const tryAudio = () =>
    void unlockAudio().then((ok) => {
      setAudioReady(ok);
      if (ok) chime();
    });

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    writeStore(SOUND_KEY, next ? "1" : "0");
    if (next) tryAudio();
  };

  const submit = async () => {
    const game = lobbyIdOf(link);
    if (game === null) return setFormProblem(errorMessage("invalid_game"));
    if (format === "") return setFormProblem(errorMessage("invalid_format"));
    setBusy(true);
    setFormProblem(null);
    setSaid("");
    try {
      await call("save_lobby_call", { p_game: game, p_format: format });
      setLink("");
      await load();
      setSaid("Les Gaulois sont prévenus.");
    } catch (e) {
      setFormProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setFormProblem(null);
    setSaid("");
    try {
      await call("end_lobby_call");
      await load();
      setSaid("Votre appel est retiré.");
    } catch (e) {
      setFormProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now() + offset.current;
  const mine = data?.calls.find((item) => item.mine) ?? null;
  const others = data?.calls.filter((item) => !item.mine) ?? [];
  const live = new Set(data?.calls.map(callKey) ?? []);

  return (
    <section id="salons" class="scroll-mt-24" aria-labelledby="salons-title" data-testid="qg-salons">
      <h2 id="salons-title" class="text-2xl">
        Rejoindre un Gaulois
      </h2>
      <p class="mt-2 text-sm text-muted">
        Quand un Gaulois attend dans un salon d'OpenFront et le dit ici, les membres qui ont le QG ouvert le voient dans une fenêtre qui reste jusqu'à ce qu'ils la ferment (croix ou touche Échap), avec un son. Le site ne lit rien chez OpenFront : c'est le joueur qui partage son salon.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" class="chip" aria-pressed={soundOn} onClick={toggleSound} data-testid="qg-salons-sound">
          Son des appels
        </button>
        {soundOn && !audioReady && (
          <button type="button" class="text-sm underline" onClick={tryAudio} data-testid="qg-salons-try">
            Essayer le son
          </button>
        )}
      </div>
      <p class="mt-2 text-sm text-muted">
        {soundOn
          ? audioReady
            ? "Le son jouera à chaque nouvel appel, tant que le QG reste ouvert dans un onglet."
            : "Le son jouera après votre premier clic sur la page : les navigateurs l'exigent. Il ne joue que si le QG reste ouvert dans un onglet."
          : "Sans son : les appels s'affichent seulement."}{" "}
        En arrière-plan, le navigateur peut ne relire les appels qu'une fois par minute. Sur téléphone, gardez le QG à l'écran : un onglet en arrière-plan ou un écran éteint ne reçoit ni appel ni son.
      </p>

      <h3 class="mt-6 text-lg">Ils attendent</h3>
      {data === null && loadProblem === null && (
        <p class="mt-2 text-muted" role="status">
          Lecture des appels…
        </p>
      )}
      {data !== null && others.length === 0 && <p class="mt-2 text-muted">Aucun Gaulois n'attend dans un salon en ce moment. La liste se met à jour toute seule.</p>}
      {others.length > 0 && (
        <ul class="mt-3 grid gap-3 md:grid-cols-2" data-testid="qg-salons-list">
          {others.map((item) => (
            <li key={callKey(item)} class="card p-4">
              <CallBody call={item} now={now} />
            </li>
          ))}
        </ul>
      )}
      <Problem message={loadProblem} />

      <h3 class="mt-8 text-lg">Vous attendez dans un salon ?</h3>
      {mine && (
        <div class="card mt-3 p-4" data-testid="qg-salons-mine">
          <p>
            <strong>Votre appel :</strong> {salonOf(mine.format)}, lancé {sinceLabel(mine.createdAt, now)}. Les membres qui ont le QG ouvert sont prévenus, pendant 15 minutes au plus.
          </p>
          <button type="button" class="chip mt-3" aria-disabled={busy || undefined} onClick={() => !busy && void withdraw()} data-testid="qg-salons-withdraw">
            Retirer mon appel
          </button>
        </div>
      )}
      <ol class="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>Dans OpenFront, entrez dans un salon en équipes. Dans « À venir », un salon pris 2 ou 3 places plus loin dans la file laisse plusieurs minutes aux autres pour vous rejoindre.</li>
        <li>Copiez son lien : le jeu le donne en haut de l'écran du salon, et dans la barre d'adresse.</li>
        <li>Collez-le ici, indiquez le format, puis prévenez les Gaulois.</li>
      </ol>
      <form
        class="card mt-4 grid gap-3 p-5"
        data-testid="qg-salons-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
      >
        <div>
          <label for="salon-lien" class="text-sm font-semibold">
            Le lien de votre salon
          </label>
          <input id="salon-lien" class="field mt-1" inputMode="url" autoComplete="off" spellcheck={false} placeholder="https://openfront.io/game/…" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
        </div>
        <div>
          <label for="salon-format" class="text-sm font-semibold">
            Le format du salon
          </label>
          <select id="salon-format" class="field mt-1 sm:!w-auto" value={format} onChange={(e) => setFormat(e.currentTarget.value as LobbyFormat | "")}>
            <option value="">Choisir…</option>
            {FORMAT_ORDER.map((value) => (
              <option key={value} value={value}>
                {LOBBY_FORMATS[value]}
              </option>
            ))}
          </select>
        </div>
        <p class="text-sm text-muted">
          Pas de « chacun pour soi » : le jeu y cache les tags, et ses conditions y interdisent toute entente arrangée hors de la partie. Votre pseudo est montré aux membres validés le temps de l'appel, 15 minutes au plus ; votre photo Discord, seulement si vous avez choisi de vous montrer.
        </p>
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy}>
            Prévenir les Gaulois
          </button>
        </div>
        <Problem message={formProblem} />
      </form>

      <p class="sr-only" role="status">
        {said}
      </p>

      {/* Hors de <main> : la page et son pied de page ont chacun leur plan (z-index 1), qui recouvrirait le pop-up en bas de page. */}
      {open &&
        createPortal(
          <div ref={popupBox} class="pointer-events-none fixed inset-x-4 bottom-4 z-50 grid gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96" data-testid="qg-salons-popups">
            {popups.slice(0, POPUPS_SHOWN).map((item, index) => (
              // Sur téléphone, un seul pop-up à la fois : deux couvriraient presque tout l'écran.
              <div key={callKey(item)} role="group" aria-label={`Appel de ${item.name}`} class={`card pointer-events-auto relative p-4 pr-12 shadow-2xl ring-1 ring-blue ${index > 0 ? "max-sm:hidden" : ""}`} data-testid="qg-salons-popup">
                <button type="button" class="absolute right-1 top-1 grid size-10 place-items-center rounded-full text-muted hover:text-white" aria-label={`Fermer l'appel de ${item.name}`} onClick={() => close(item)} data-testid="qg-salons-close">
                  <span aria-hidden="true" class="text-xl leading-none">
                    ×
                  </span>
                </button>
                <p class="font-display text-lg font-extrabold">Un Gaulois vous attend</p>
                <CallBody call={item} now={now} ended={!live.has(callKey(item))} />
              </div>
            ))}
            {popups.length > 1 && (
              <p class="card pointer-events-auto p-3 text-sm sm:hidden" data-testid="qg-salons-more">
                <a href="#salons">{othersWaiting(popups.length - 1)}</a>
              </p>
            )}
            {popups.length > POPUPS_SHOWN && (
              <p class="card pointer-events-auto p-3 text-sm max-sm:hidden" data-testid="qg-salons-more">
                <a href="#salons">{othersWaiting(popups.length - POPUPS_SHOWN)}</a>
              </p>
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
