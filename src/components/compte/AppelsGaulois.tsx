import { createPortal } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { basePath, mayHaveSession } from "../../lib/compte/api";
import { callKey, callSentence, endedCallSentence, freshCalls, lobbyUrl, ownCallSentence, seatsNote, sinceLabel, type LobbyCall } from "../../lib/compte/salons";
import { chime, setSound, start, subscribe, unlockAudio, type AppelsState } from "./appels";
import { Avatar } from "./common";

/** Les appels fermés d'un clic sur la croix, gardés dans ce seul navigateur : ils ne reviennent pas d'une page à l'autre. */
const CLOSED_KEY = "gal-qg-appels-fermes";
const CLOSED_KEPT = 50;
/** Les appels déjà annoncés dans cet onglet : sur la page suivante, le pop-up revient, mais sans son ni nouvelle annonce. */
const RUNG_KEY = "gal-qg-appels-sonnes";
/** Les gestes qui laissent un navigateur jouer un son. Au doigt, c'est la fin du toucher qui compte, pas son début. */
const GESTURES = ["pointerup", "click", "touchend", "keydown"] as const;

function readKeys(storage: () => Storage, key: string): string[] {
  try {
    const list: unknown = JSON.parse(storage().getItem(key) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function addKeys(storage: () => Storage, key: string, added: readonly string[]): void {
  try {
    const kept = readKeys(storage, key).filter((item) => !added.includes(item));
    storage().setItem(key, JSON.stringify([...kept, ...added].slice(-CLOSED_KEPT)));
  } catch {
    // Stockage indisponible : l'appel pourra revenir, ou sonner de nouveau, à la page suivante.
  }
}

const local = () => localStorage;
const session = () => sessionStorage;
const othersWaiting = (n: number) => (n === 1 ? "Un autre appel attend au QG" : `${n} autres appels attendent au QG`);
/** Ce que les lecteurs d'écran entendent : l'appel d'un autre, ou la confirmation du sien. */
const spoken = (item: LobbyCall) => (item.mine ? `Votre appel est lancé. ${ownCallSentence(item)}` : callSentence(item));

/**
 * Les appels des Gaulois, sur les pages du site : quand un membre validé dit au QG qu'il attend dans un salon d'OpenFront,
 * les membres validés connectés le voient dans un pop-up, quelle que soit la page ouverte, avec un son la première fois.
 * Un seul pop-up à la fois, le plus récent ; il reste jusqu'à la croix ou la touche Échap. Pour un visiteur sans session,
 * rien ne se passe : aucun appel au serveur. Le serveur refuse tout compte qui n'est pas validé ; la page cesse alors de demander.
 */
export default function AppelsGaulois() {
  const [appels, setAppels] = useState<AppelsState | null>(null);
  const [popups, setPopups] = useState<LobbyCall[]>([]);
  const [said, setSaid] = useState("");
  const [, setTick] = useState(0);
  // Les appels déjà montrés sur cette page, et ceux fermés d'un clic sur la croix, même sur une page précédente.
  const seen = useRef<Set<string>>(new Set());
  const baseTitle = useRef<string | null>(null);
  const popupBox = useRef<HTMLDivElement>(null);
  const open = popups.length > 0;

  useEffect(() => {
    if (!mayHaveSession()) return;
    seen.current = new Set(readKeys(local, CLOSED_KEY));
    const unsubscribe = subscribe((next) => {
      setAppels(next);
      if (!next.data) return;
      // Derrière le pop-up montré, un appel fini entre-temps s'en va de lui-même. Celui qu'on voit reste, marqué « terminé ».
      const live = new Set(next.data.calls.map(callKey));
      setPopups((shown) => shown.filter((item, index) => index === 0 || live.has(callKey(item))));
      const fresh = freshCalls(next.data.calls, seen.current);
      if (fresh.length === 0) return;
      for (const item of fresh) seen.current.add(callKey(item));
      setPopups((shown) => [...fresh, ...shown]);
      const rung = new Set(readKeys(session, RUNG_KEY));
      const announced = fresh.filter((item) => !rung.has(callKey(item)));
      if (announced.length === 0) return;
      addKeys(session, RUNG_KEY, announced.map(callKey));
      setSaid(announced.map(spoken).join(" "));
      if (next.soundOn) chime();
    });
    // Après le chargement de la page : le reste du site passe d'abord.
    const begin = window.setTimeout(start, 1000);
    const minutes = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      unsubscribe();
      window.clearTimeout(begin);
      window.clearInterval(minutes);
    };
  }, []);

  // Le son attend un geste du membre sur la page, comme l'exigent les navigateurs : on l'écoute jusqu'à ce qu'il soit prêt.
  const wantsUnlock = appels !== null && !appels.closed && appels.soundOn && !appels.audioReady;
  useEffect(() => {
    if (!wantsUnlock) return;
    const onGesture = () => void unlockAudio();
    for (const name of GESTURES) document.addEventListener(name, onGesture, true);
    return () => {
      for (const name of GESTURES) document.removeEventListener(name, onGesture, true);
    };
  }, [wantsUnlock]);

  // Le titre de l'onglet compte les Gaulois qui vous attendent, sans clignoter : il se voit même quand la page est en
  // arrière-plan. Son propre appel n'y compte pas : personne ne l'attend.
  const waiting = popups.filter((item) => !item.mine).length;
  useEffect(() => {
    baseTitle.current ??= document.title;
    document.title = waiting > 0 ? `(${waiting}) ${baseTitle.current}` : baseTitle.current;
  }, [waiting]);
  useEffect(
    () => () => {
      if (baseTitle.current !== null) document.title = baseTitle.current;
    },
    [],
  );

  const close = useCallback((item: LobbyCall) => {
    const key = callKey(item);
    setPopups((shown) => shown.filter((other) => callKey(other) !== key));
    addKeys(local, CLOSED_KEY, [key]);
  }, []);

  // Tant qu'il est ouvert, la page garde au-dessus du pop-up la place de l'élément qui a le focus et du bas de la page
  // (WCAG 2.2, 2.4.11) : rien n'est caché dessous, au clavier comme au doigt.
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

  // Échap ferme le pop-up montré, sans déplacer le focus. Un menu ouvert de l'en-tête, qui écoute aussi Échap, passe d'abord.
  useEffect(() => {
    const shown = popups[0];
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("details[data-menu][open]")) return;
      close(shown);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [popups, close]);

  const toggleSound = () => {
    if (!appels) return;
    if (appels.soundOn) {
      setSound(false);
      setSaid("Son des appels coupé.");
      return;
    }
    setSound(true);
    setSaid("Son des appels remis.");
    void unlockAudio().then((ok) => {
      if (ok) chime();
    });
  };

  const shown = popups[0];
  const now = Date.now() + (appels?.offset ?? 0);
  // Ce que le dernier relevé dit de cet appel : le format a pu changer depuis son ouverture. Absent : l'appel est fini.
  const latest = shown ? appels?.data?.calls.find((other) => callKey(other) === callKey(shown)) : undefined;
  const ended = shown !== undefined && latest === undefined;
  const item = latest ?? shown;
  const seats = item && !ended ? seatsNote(item.format) : null;
  // Le lien vers les autres appels ne compte que ceux des autres : le sien est au QG, sous « Votre appel ».
  const othersQueued = popups.slice(1).filter((other) => !other.mine).length;
  const title = item?.mine ? (ended ? "Votre appel est terminé" : "Votre appel est lancé") : ended ? "Appel terminé" : "Un Gaulois vous attend";
  const sentence = item ? (ended ? endedCallSentence(item) : item.mine ? ownCallSentence(item) : callSentence(item)) : "";

  return (
    <>
      {/* Toujours présente, même vide : une annonce n'est lue que dans une zone déjà là. */}
      <p class="sr-only" role="status">
        {said}
      </p>
      {item &&
        appels &&
        createPortal(
          // Au-dessus des ondes du fond (z-index 60), sous l'infobulle des effets (70).
          <div ref={popupBox} class="pointer-events-none fixed inset-x-4 bottom-4 z-[65] grid gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[27rem]" data-testid="appels-popups">
            {/* Le dégradé des scènes bleues, sans la classe `.stage` et ses effets ; un fond plein et une vraie bordure pour le mode contraste élevé. */}
            <div
              role="group"
              aria-label={item.mine ? "Votre appel" : `Appel de ${item.name}`}
              class="stage-blue pointer-events-auto relative max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border-2 border-white/80 bg-blue p-4 pr-14 text-white shadow-2xl [background-image:var(--stage-bg)] sm:p-5 sm:pr-14"
              data-testid="appels-popup"
            >
              <button
                type="button"
                class="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-white hover:bg-white/15"
                aria-label={item.mine ? "Fermer la fenêtre de votre appel" : `Fermer l'appel de ${item.name}`}
                onClick={() => close(item)}
                data-testid="appels-close"
              >
                <span aria-hidden="true" class="text-2xl leading-none">
                  ×
                </span>
              </button>
              <p class="text-xs font-bold uppercase tracking-widest max-sm:hidden">Appel du QG</p>
              <p class="font-display text-xl font-extrabold leading-tight sm:mt-1 sm:text-2xl">{title}</p>
              <div class="mt-3 flex items-center gap-3">
                <Avatar name={item.name} avatar={item.avatar} />
                <p class="min-w-0 font-semibold [overflow-wrap:anywhere] sm:text-lg">{sentence}</p>
              </div>
              {!ended && <p class="tnum mt-2 text-sm text-white/85">Appel lancé {sinceLabel(item.createdAt, now)}.</p>}
              {/* Celui qui appelle a une fenêtre comme celle des autres : la phrase le lui dit. */}
              {!ended && item.mine && (
                <p class="mt-1 text-sm text-white/85">
                  {/* Le message est parti vers Discord : le serveur ne dit pas ici si Discord l'a accepté. */}
                  Les membres connectés reçoivent la même alerte{item.discord ? " ; l'appel part aussi sur Discord" : ""}.
                </p>
              )}
              {seats && <p class="mt-1 text-sm text-white/85">{seats}</p>}
              <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mt-4">
                {/* Celui qui appelle est déjà dans son salon : son bouton mène au QG, où il peut retirer l'appel. */}
                {!ended && item.mine && (
                  <a class="btn btn-secondary !min-h-11" href={`${basePath()}/qg#salons`} data-testid="appels-manage">
                    Gérer mon appel
                  </a>
                )}
                {!ended && !item.mine && (
                  <a class="btn btn-secondary !min-h-11" href={lobbyUrl(item.game)} target="_blank" rel="noopener" data-testid="appels-join">
                    Rejoindre la partie<span class="sr-only"> (nouvel onglet)</span>
                  </a>
                )}
                <button type="button" class="min-h-11 text-sm font-semibold underline" onClick={toggleSound} data-testid="appels-sound">
                  {appels.soundOn ? "Couper le son" : "Remettre le son"}
                </button>
              </div>
            </div>
            {othersQueued > 0 && (
              <p class="card pointer-events-auto p-3 text-sm" data-testid="appels-more">
                <a href={`${basePath()}/qg#salons`}>{othersWaiting(othersQueued)}</a>
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
