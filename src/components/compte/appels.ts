/**
 * Les appels aux salons pour toute la page : un seul relevé toutes les 20 secondes (`get_lobby_calls`), que se partagent
 * le pop-up de toutes les pages (`AppelsGaulois.tsx`) et la liste du QG (`QgSalons.tsx`). Et le son des appels : deux
 * notes jouées par le navigateur, sans fichier. Rien ne démarre sans session : un visiteur ne déclenche aucun appel au
 * serveur. Le serveur ne répond qu'à un membre validé ; à tout autre compte, la relecture s'arrête au premier refus.
 */
import { ServerError, call, mayHaveSession } from "../../lib/compte/api";
import { isFinalRefusal, parseLobbyCalls, type LobbyCalls } from "../../lib/compte/salons";

/** Un salon pris loin dans la file laisse plusieurs minutes. En arrière-plan, le navigateur peut espacer ses minuteries jusqu'à une minute. */
const REFRESH_MS = 20_000;
/** Le choix du son, gardé dans ce seul navigateur. Le son est prévu par défaut : seul « 0 » le coupe. */
const SOUND_KEY = "gal-qg-son";

export interface AppelsState {
  data: LobbyCalls | null;
  /** L'écart entre l'heure du serveur et celle du navigateur, en millisecondes : les minutes se comptent à l'heure du serveur. */
  offset: number;
  problem: string | null;
  /** Le serveur refuse ce compte (plus de session, pas encore validé, suspendu) : plus aucune relecture. */
  closed: boolean;
  soundOn: boolean;
  /** Le navigateur a laissé démarrer le son, après un geste du membre sur la page. */
  audioReady: boolean;
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

let state: AppelsState = { data: null, offset: 0, problem: null, closed: false, soundOn: readSound(), audioReady: false };
const listeners = new Set<(next: AppelsState) => void>();
let timer: number | null = null;
let running: Promise<void> | null = null;

function update(change: Partial<AppelsState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) listener(state);
}

/** Reçoit l'état tout de suite, puis à chaque changement. Rend de quoi se désabonner. */
export function subscribe(listener: (next: AppelsState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

const onVisible = () => {
  if (!document.hidden) void refresh();
};

function stop(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisible);
}

/** Relit les appels maintenant. Deux demandes simultanées n'en font qu'une. */
export function refresh(): Promise<void> {
  running ??= (async () => {
    try {
      const answer = parseLobbyCalls(await call<unknown>("get_lobby_calls"));
      if (answer === null) update({ problem: "La réponse du serveur est illisible. La liste réessaie toute seule." });
      else update({ data: answer, offset: answer.now - Date.now(), problem: null });
    } catch (e) {
      if (e instanceof ServerError && isFinalRefusal(e.code)) {
        stop();
        update({ closed: true });
      } else {
        update({ problem: `${e instanceof ServerError ? e.message : "Le serveur ne répond pas pour l'instant."} La liste réessaie toute seule.` });
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Après une écriture (`save_lobby_call`, `end_lobby_call`) : attend la lecture en cours, partie peut-être avant l'écriture,
 * puis en relance une, pour que la page montre tout de suite l'appel lancé ou retiré.
 */
export async function refreshAfterWrite(): Promise<void> {
  if (running) await running;
  await refresh();
}

/** Lance la relecture toutes les 20 secondes, et dès que l'onglet redevient visible. Sans effet sans session, si elle tourne déjà, ou si le serveur a refusé ce compte. */
export function start(): void {
  if (timer !== null || state.closed || !mayHaveSession()) return;
  void refresh();
  timer = window.setInterval(() => void refresh(), REFRESH_MS);
  document.addEventListener("visibilitychange", onVisible);
}

/* ---------- Le son ---------- */

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
export async function unlockAudio(): Promise<boolean> {
  const context = audio();
  if (!context) return false;
  if (context.state !== "running") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  const ready = context.state === "running";
  if (ready !== state.audioReady) update({ audioReady: ready });
  return ready;
}

/** Un appel, pas une alarme : deux notes brèves qui montent, à volume modéré, moins d'une seconde en tout. */
export function chime(): void {
  const context = audio();
  if (!context || context.state !== "running") return;
  const begin = context.currentTime + 0.02;
  for (const [frequency, delay] of [
    [660, 0],
    [880, 0.18],
  ] as const) {
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, begin + delay);
    volume.gain.exponentialRampToValueAtTime(0.18, begin + delay + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, begin + delay + 0.5);
    tone.connect(volume).connect(context.destination);
    tone.start(begin + delay);
    tone.stop(begin + delay + 0.55);
  }
}

/** Active ou coupe le son des appels, pour toutes les pages de ce navigateur. */
export function setSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    // Stockage indisponible : le choix vaut seulement pour cette page.
  }
  update({ soundOn: on });
}
