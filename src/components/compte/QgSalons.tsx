import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { PING_RULE, callKey, callSentence, lobbyIdOf, lobbyUrl, pingRefusal, seatsNote, sinceLabel, type LobbyCall } from "../../lib/compte/salons";
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
  // Le ping est un choix de chaque appel, décoché au départ (migration 20261111000200_appels_discord_ping_au_choix.sql).
  const [ping, setPing] = useState(false);
  // Pourquoi le dernier ping demandé n'est pas parti : l'anti-spam du serveur, un rôle absent, une panne.
  const [pingNote, setPingNote] = useState<string | null>(null);
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

  /**
   * Lance l'appel. Le serveur décide de tout : il ne renvoie rien pour un même salon, sauf un ping demandé après coup, si
   * l'anti-spam le permet. `discord` : le message est parti vers Discord, sans savoir encore ce que Discord en fait ;
   * `ping` : 'sent', ou la raison d'un ping refusé. `p_ping` n'est envoyé que coché : la page marche aussi avec un serveur
   * d'avant la migration 20261111000200_appels_discord_ping_au_choix.sql, qui ne connaît pas ce paramètre.
   */
  const submit = async () => {
    const game = lobbyIdOf(link);
    if (game === null) return setFormProblem(errorMessage("invalid_game"));
    const withPing = ping && data?.pingPossible === true;
    setBusy(true);
    setFormProblem(null);
    setPingNote(null);
    setSaid("");
    try {
      // Plus de format à choisir (migration 20261110000100_appels_sans_format.sql) : le lien suffit.
      const answer = await call<{ discord?: boolean; ping?: unknown }>("save_lobby_call", { p_game: game, p_format: null, ...(withPing ? { p_ping: true } : {}) });
      setLink("");
      setPing(false);
      await refreshAfterWrite();
      const refusal = pingRefusal(answer?.ping);
      setPingNote(refusal);
      const discord = answer?.ping === "sent" ? " L'appel part aussi sur Discord, avec un ping." : answer?.discord === true ? " L'appel part aussi sur Discord." : "";
      setSaid(`Les Gaulois sont prévenus.${discord}${refusal ? ` ${refusal}` : ""}`);
    } catch (e) {
      setFormProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /** Le bouton « Ping sur Discord » : un ping pour l'appel en cours, et lui seul (`ping_lobby_call`). Un appel fini ne repart pas. */
  const pingNow = async () => {
    setBusy(true);
    setFormProblem(null);
    setPingNote(null);
    setSaid("");
    try {
      const answer = await call<{ ping?: unknown }>("ping_lobby_call");
      await refreshAfterWrite();
      const refusal = pingRefusal(answer?.ping);
      setPingNote(refusal);
      setSaid(answer?.ping === "sent" ? "Ping parti sur Discord." : (refusal ?? ""));
    } catch (e) {
      const problem = messageOf(e);
      setPingNote(problem);
      setSaid(problem);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setFormProblem(null);
    setPingNote(null);
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
                {mine.ping && " Ping parti sur Discord."}
              </p>
              <div class="mt-3 flex flex-wrap gap-3">
                <button type="button" class="chip" aria-disabled={busy || undefined} onClick={() => !busy && void withdraw()} data-testid="qg-salons-withdraw">
                  Retirer mon appel
                </button>
                {/* Le ping après coup, pour cet appel : le serveur refait son message Discord avec la mention, si l'anti-spam le permet. */}
                {data?.pingPossible && !mine.ping && (
                  <button type="button" class="chip" aria-disabled={busy || undefined} onClick={() => !busy && void pingNow()} data-testid="qg-salons-ping-now">
                    Ping sur Discord
                  </button>
                )}
              </div>
              {pingNote && (
                <p class="mt-3 text-sm text-muted" data-testid="qg-salons-ping-note">
                  {pingNote}
                </p>
              )}
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
            {/* Le ping n'est proposé que si un rôle est réglé : sans lui, il ne pourrait pas partir. */}
            {data?.pingPossible && (
              <div>
                <label class="flex min-h-11 items-center gap-3 font-semibold">
                  <input type="checkbox" class="size-5" checked={ping} aria-describedby="salon-ping-regle" onChange={(e) => setPing(e.currentTarget.checked)} data-testid="qg-salons-ping" />
                  Ping du rôle sur Discord
                </label>
                <p id="salon-ping-regle" class="text-sm text-muted">
                  {PING_RULE}
                </p>
              </div>
            )}
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
