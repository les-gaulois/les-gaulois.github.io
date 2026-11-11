import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { callKey, callSentence, lobbyIdOf, lobbyUrl, seatsNote, sinceLabel, type LobbyCall } from "../../lib/compte/salons";
import { chime, refreshAfterWrite, setSound, start, subscribe, unlockAudio, type AppelsState } from "./appels";
import { Avatar, Problem, messageOf } from "./common";
import { PartieTete } from "./Onglets";

/** Ce qu'on sait d'un appel : qui, où, depuis quand, la taille des équipes, et le lien du salon. */
function CallBody({ call: item, now }: { call: LobbyCall; now: number }) {
  const seats = seatsNote(item.format);
  return (
    <>
      <div class="flex items-center gap-3">
        <Avatar name={item.name} avatar={item.avatar} />
        <p class="min-w-0 font-semibold [overflow-wrap:anywhere]">{callSentence(item)}</p>
      </div>
      <p class="tnum mt-1 text-sm text-muted">Appel lancé {sinceLabel(item.createdAt, now)}.</p>
      {seats && <p class="mt-1 text-sm text-muted">{seats}</p>}
      <a class="btn btn-primary mt-3 !min-h-10 !py-1.5 !text-sm" href={lobbyUrl(item.game)} target="_blank" rel="noopener" data-testid="qg-salons-join">
        Rejoindre la partie<span class="sr-only"> (nouvel onglet)</span>
      </a>
    </>
  );
}

/**
 * Rejoindre un Gaulois, au QG : la liste des appels en cours et le formulaire pour prévenir les autres. Le pop-up et le son
 * sont communs aux pages du site (`AppelsGaulois.tsx`), et le relevé des appels aussi (`appels.ts`). Le site ne lit
 * rien chez OpenFront. Le serveur revérifie chaque appel (`save_lobby_call`). C'est l'onglet « Salons » du QG : sans `id`,
 * l'adresse #salons ouvre l'onglet (`Onglets.tsx`) au lieu de faire défiler la page.
 */
export default function QgSalons() {
  const [appels, setAppels] = useState<AppelsState | null>(null);
  const [said, setSaid] = useState("");
  const [link, setLink] = useState("");
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe(setAppels);
    start();
    const minutes = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(minutes);
    };
  }, []);

  const tryAudio = () =>
    void unlockAudio().then((ok) => {
      if (ok) chime();
    });

  const toggleSound = () => {
    const next = !(appels?.soundOn ?? true);
    setSound(next);
    if (next) tryAudio();
  };

  const submit = async () => {
    const game = lobbyIdOf(link);
    if (game === null) return setFormProblem(errorMessage("invalid_game"));
    setBusy(true);
    setFormProblem(null);
    setSaid("");
    try {
      // Plus de format à choisir (migration 20261110000100_appels_sans_format.sql) : le lien suffit.
      const answer = await call<{ discord?: boolean }>("save_lobby_call", { p_game: game, p_format: null });
      setLink("");
      await refreshAfterWrite();
      // `discord` : le message est parti vers Discord, sans savoir encore ce que Discord en fait.
      setSaid(answer?.discord === true ? "Les Gaulois sont prévenus. L'appel part aussi sur Discord." : "Les Gaulois sont prévenus.");
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
      await refreshAfterWrite();
      setSaid("Votre appel est retiré.");
    } catch (e) {
      setFormProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const data = appels?.data ?? null;
  const now = Date.now() + (appels?.offset ?? 0);
  const soundOn = appels?.soundOn ?? true;
  const mine = data?.calls.find((item) => item.mine) ?? null;
  const others = data?.calls.filter((item) => !item.mine) ?? [];

  return (
    <section aria-labelledby="salons-title" data-testid="qg-salons">
      <PartieTete
        id="salons-title"
        title="Rejoindre un Gaulois"
        aside={
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="chip" aria-pressed={soundOn} onClick={toggleSound} data-testid="qg-salons-sound">
              Son des appels
            </button>
            {soundOn && appels !== null && !appels.audioReady && (
              <button type="button" class="underline" onClick={tryAudio} data-testid="qg-salons-try">
                Essayer le son
              </button>
            )}
          </div>
        }
      >
        <p>Les membres connectés sont prévenus sur les pages du site.</p>
      </PartieTete>
      {soundOn && appels !== null && !appels.audioReady && <p class="mt-2 text-sm text-muted">Le son jouera après un premier clic sur la page.</p>}
      <p class="mt-2 text-sm text-muted">Sur téléphone, gardez le site à l'écran.</p>
      <Problem message={appels?.problem ?? null} />

      {/* Deux colonnes sur grand écran quand quelqu'un attend : la liste à gauche, le formulaire à droite. */}
      <div class={`mt-6 grid grid-cols-1 items-start gap-8 ${others.length > 0 ? "lg:grid-cols-2" : ""}`}>
        {/* Personne n'attend : rien, ni titre ni phrase. */}
        {others.length > 0 && (
          <div>
            <h3 class="text-lg">Ils attendent</h3>
            <ul class="mt-3 grid gap-3" data-testid="qg-salons-list">
              {others.map((item) => (
                <li key={callKey(item)} class="card p-5">
                  <CallBody call={item} now={now} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div class={others.length > 0 ? "" : "max-w-2xl"}>
          <h3 class="text-lg">Vous attendez dans un salon ?</h3>
          {mine && (
            <div class="card mt-3 p-5" data-testid="qg-salons-mine">
              <p>
                <strong>Votre appel</strong>, lancé {sinceLabel(mine.createdAt, now)}, dure 15 minutes au plus.
              </p>
              <button type="button" class="chip mt-3" aria-disabled={busy || undefined} onClick={() => !busy && void withdraw()} data-testid="qg-salons-withdraw">
                Retirer mon appel
              </button>
            </div>
          )}
          <form
            class="card mt-3 grid gap-4 p-5"
            data-testid="qg-salons-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && data !== null) void submit();
            }}
          >
            <div>
              <label for="salon-lien" class="text-sm font-semibold">
                Le lien de votre salon, copié dans OpenFront
              </label>
              <input id="salon-lien" class="field mt-1" inputMode="url" autoComplete="off" spellcheck={false} placeholder="https://openfront.io/game/…" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
            </div>
            {/* Le site ne peut pas vérifier le mode du salon : cette phrase est le seul garde-fou contre le chacun pour soi public.
                Le message Discord reste dans le salon après l'appel, sauf si l'appel est retiré : la phrase le dit avant l'appel,
                et le bouton attend le premier relevé, qui seul dit si les appels partent sur Discord. */}
            <p class="text-sm text-muted" data-testid="qg-salons-privacy">
              Salons en équipes ou privés seulement : en chacun pour soi, OpenFront interdit de s'entendre hors de la partie. Les membres verront votre pseudo pendant l'appel.
              {data?.discord && " L'appel part aussi sur Discord, avec votre pseudo ; le message y reste, sauf si vous retirez l'appel."}
            </p>
            <div>
              <button type="submit" class="btn btn-primary" disabled={busy || data === null}>
                Prévenir les Gaulois
              </button>
            </div>
            <Problem message={formProblem} />
          </form>
        </div>
      </div>

      <p class="sr-only" role="status">
        {said}
      </p>
    </section>
  );
}
