import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { isWaiting, isWebhookLink, lastSendSentence, parseDiscordCalls, roleOf, type DiscordCalls } from "../../lib/compte/discord-appels";
import { errorMessage } from "../../lib/compte/errors";
import { PING_WAIT_CLAN_MINUTES, PING_WAIT_MEMBER_MINUTES } from "../../lib/compte/salons";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, Success, messageOf } from "./common";
import { PartieTete } from "./Onglets";

/** Les relectures qui suivent un essai, le temps que Discord réponde : pg_net envoie d'ordinaire en moins d'une seconde. */
const FOLLOW_UP_MS = [1_500, 4_000, 10_000, 30_000];

/**
 * Les appels sur Discord, pour les admins et le fondateur : le lien du webhook d'un salon du clan et le rôle à mentionner.
 * Chaque nouvel appel lancé au QG y part, posté par le serveur (`save_lobby_call`). Le lien n'est jamais relu : le
 * serveur le garde, et le champ se vide après l'enregistrement. Chaque enregistrement envoie un essai, qui montre la
 * mention dans le salon sans notifier personne ; la page relit ensuite la réponse de Discord.
 */
export default function DirectionDiscord() {
  const [state, setState] = useState<DiscordCalls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  // `null` tant que le réglage n'est pas lu : le champ prend alors le rôle enregistré.
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const timers = useRef<number[]>([]);

  const load = async (): Promise<DiscordCalls | null> => {
    try {
      const next = parseDiscordCalls(await call<unknown>("get_discord_calls"));
      if (next === null) {
        setLoadError("La réponse du serveur est illisible.");
        return null;
      }
      setState(next);
      setLoadError(null);
      setRole((current) => current ?? next.role ?? "");
      return next;
    } catch (e) {
      setLoadError(messageOf(e));
      return null;
    }
  };

  const stopFollowing = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  // Après un envoi : quelques relectures, jusqu'à la réponse de Discord.
  const follow = () => {
    stopFollowing();
    timers.current = FOLLOW_UP_MS.map((ms) =>
      window.setTimeout(() => {
        void load().then((next) => {
          if (next !== null && !isWaiting(next)) stopFollowing();
        });
      }, ms),
    );
  };

  useEffect(() => {
    void load();
    return stopFollowing;
  }, []);

  const act = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      const next = await load();
      if (isWaiting(next)) follow();
      return true;
    } catch (e) {
      setProblem(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const pasted = link.trim();
    const roleId = roleOf(role ?? "");
    setDone(null);
    // Le serveur refait chaque contrôle : ceux-ci évitent seulement un aller-retour.
    if ((pasted === "" && !state?.set) || (pasted !== "" && !isWebhookLink(pasted))) return setProblem(errorMessage("invalid_webhook"));
    if (roleId === false) return setProblem(errorMessage("invalid_role"));
    const ok = await act(() => call("save_discord_calls", { p_webhook: pasted === "" ? null : pasted, p_role: roleId }), "Réglage enregistré : un essai part dans le salon, sans notifier personne.");
    if (ok) setLink("");
  };

  const stop = async () => {
    setArmed(false);
    await act(() => call("clear_discord_calls"), "Salon débranché : les appels ne partent plus sur Discord.");
  };

  return (
    <section aria-labelledby="discord-title" data-testid="direction-discord">
      <PartieTete id="discord-title" title="Les appels sur Discord">
        <p>Un salon Discord du clan peut recevoir chaque appel lancé au QG, avec un ping du rôle quand l'appel le demande.</p>
      </PartieTete>
      {loadError && (
        <div class="mt-6">
          <Problem message={loadError} onRetry={() => void load()} />
        </div>
      )}
      {state === null ? (
        !loadError && (
          <div class="mt-6">
            <Loading />
          </div>
        )
      ) : (
        <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <form
            class="card grid gap-4 p-5"
            data-testid="direction-discord-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void save();
            }}
          >
            <h3 class="text-lg">{state.set ? "Changer le réglage" : "Brancher un salon"}</h3>
            <div>
              <label for="discord-lien" class="text-sm font-semibold">
                Lien du webhook du salon
              </label>
              <input
                id="discord-lien"
                class="field mt-1"
                inputMode="url"
                autoComplete="off"
                spellcheck={false}
                placeholder="https://discord.com/api/webhooks/…"
                aria-describedby={state.set ? "discord-lien-note" : undefined}
                value={link}
                onInput={(e) => setLink(e.currentTarget.value)}
              />
              {state.set && (
                <p id="discord-lien-note" class="mt-1 text-sm text-muted">
                  Vide : le lien enregistré est gardé.
                </p>
              )}
            </div>
            <div>
              <label for="discord-role" class="text-sm font-semibold">
                Identifiant du rôle à mentionner
              </label>
              <input
                id="discord-role"
                class="field tnum mt-1"
                inputMode="numeric"
                autoComplete="off"
                spellcheck={false}
                placeholder="17 à 20 chiffres"
                aria-describedby="discord-role-note"
                value={role ?? ""}
                onInput={(e) => setRole(e.currentTarget.value)}
              />
              <p id="discord-role-note" class="mt-1 text-sm text-muted">
                Vide : pas de ping possible.
              </p>
            </div>
            <div>
              <button type="submit" class="btn btn-primary" disabled={busy}>
                Enregistrer et envoyer un essai
              </button>
            </div>
            <details class="text-sm">
              <summary class="cursor-pointer font-semibold">Où trouver le lien et l'identifiant ?</summary>
              <ol class="mt-2 grid list-decimal gap-2 pl-5 text-muted">
                <li>Le lien : dans Discord, Modifier le salon → Intégrations → Webhooks → Nouveau webhook, puis Copier l'URL du webhook. Il permet d'écrire dans le salon : ne le montrez à personne.</li>
                <li>Le rôle : Paramètres utilisateur → Avancés → Mode développeur. Puis Paramètres du serveur → Rôles, clic droit sur le rôle → Copier l'identifiant du rôle. Si l'essai n'affiche pas le nom du rôle, l'identifiant n'est pas le bon.</li>
                <li>Si un ping ne notifie personne : dans les réglages du rôle, autorisez tout le monde à le mentionner.</li>
              </ol>
            </details>
          </form>

          {state.set && (
            <div class="card grid gap-3 p-5" data-testid="direction-discord-state">
              <h3 class="text-lg">Réglage en place</h3>
              <p>
                {state.role ? (
                  <>
                    Rôle des pings : <span class="tnum">{state.role}</span>
                  </>
                ) : (
                  "Aucun rôle : pas de ping possible."
                )}
              </p>
              {state.role && (
                <p class="text-sm text-muted" data-testid="direction-discord-ping-rule">
                  Le ping est une case de chaque appel, au QG : au plus un toutes les {PING_WAIT_CLAN_MINUTES} minutes pour le clan, et toutes les {PING_WAIT_MEMBER_MINUTES} minutes par membre.
                </p>
              )}
              {state.updatedAt && (
                <p class="tnum text-sm text-muted">
                  Réglé le {fmtDateTime(state.updatedAt)}
                  {state.updatedBy ? ` par ${state.updatedBy}` : ""}.
                </p>
              )}
              <p role="status" data-testid="direction-discord-last">
                {state.last ? lastSendSentence(state.last, fmtDateTime) : ""}
              </p>
              <div>
                <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void act(() => call("test_discord_calls"), state.role ? "Essai envoyé : il montre la mention sans notifier personne." : "Essai envoyé.")}>
                  Renvoyer un essai
                </button>
              </div>
              {/* Débrancher efface le réglage, lien compris : à part, sous un filet, et seulement au second clic. Le 11 novembre
                  2026, « Arrêter l'envoi », à côté de « Dernier envoi : l'essai », a été lu comme la fin de l'essai. */}
              {/* L'avertissement vient sous le bouton : le bouton ne bouge pas entre les deux clics. */}
              <div class="grid gap-2 border-t border-line pt-4">
                <div>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    disabled={busy}
                    aria-describedby={armed ? "discord-stop-note" : undefined}
                    onClick={() => (armed ? void stop() : setArmed(true))}
                    onBlur={() => setArmed(false)}
                    data-testid="direction-discord-stop"
                  >
                    {armed ? "Confirmer : débrancher" : "Débrancher le salon"}
                  </button>
                </div>
                {armed && (
                  <p id="discord-stop-note" class="text-sm text-warn">
                    Les appels ne partiront plus sur Discord, et il faudra recoller le lien du webhook pour rebrancher le salon.
                  </p>
                )}
              </div>
            </div>
          )}

          <div class="lg:col-span-2">
            <Problem message={problem} />
            {done && <Success message={done} />}
          </div>
        </div>
      )}
    </section>
  );
}
