import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { isWaiting, isWebhookLink, lastSendSentence, parseDiscordCalls, roleOf, type DiscordCalls } from "../../lib/compte/discord-appels";
import { etatDesAppels, etatDuPing } from "../../lib/compte/discord-etat";
import { errorMessage } from "../../lib/compte/errors";
import { PING_WAIT_CLAN_MINUTES, PING_WAIT_MEMBER_MINUTES } from "../../lib/compte/salons";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, messageOf } from "./common";
import { Pastille } from "./direction-kit";
import { rendreLeFocus, Retour, useSecondClic } from "./DirectionMessage";

/** Les relectures qui suivent un essai, le temps que Discord réponde : pg_net envoie d'ordinaire en moins d'une seconde. */
const FOLLOW_UP_MS = [1_500, 4_000, 10_000, 30_000];

/**
 * Les appels sur Discord, pour les admins et le fondateur (rubrique « Appels sur Discord » du menu de l'onglet Discord) : le lien du webhook d'un salon du clan et le rôle à mentionner.
 * Chaque nouvel appel lancé au QG y part, posté par le serveur (`save_lobby_call`). Le lien n'est jamais relu : le
 * serveur le garde, et le champ se vide après l'enregistrement. Chaque enregistrement envoie un essai, qui montre la
 * mention dans le salon sans notifier personne ; la page relit ensuite la réponse de Discord.
 *
 * Un bloc court, comme les salons du robot (14 novembre 2026) : l'état en pastille et ce qu'a répondu Discord d'un côté, les
 * champs et les boutons de l'autre, l'aide repliée. `premiere` : la lecture déjà faite par le menu de l'onglet, reprise
 * telle quelle (une seule lecture à l'ouverture) ; si elle a échoué, la rubrique relit le serveur en s'ouvrant. `onRead`
 * donne chaque lecture suivante au menu.
 */
export default function DirectionAppels({ premiere, onRead }: { premiere?: Promise<DiscordCalls | null>; onRead?: (calls: DiscordCalls) => void } = {}) {
  const [state, setState] = useState<DiscordCalls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  // `null` tant que le réglage n'est pas lu : le champ prend alors le rôle enregistré.
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  // Le numéro de la dernière lecture lancée, et de la dernière montrée : une réponse en retard n'écrase pas une plus récente.
  const lancee = useRef(0);
  const montree = useRef(0);

  const show = (next: DiscordCalls) => {
    setState(next);
    setLoadError(null);
    setRole((current) => current ?? next.role ?? "");
  };

  const load = async (): Promise<DiscordCalls | null> => {
    const numero = ++lancee.current;
    try {
      const next = parseDiscordCalls(await call<unknown>("get_discord_calls"));
      if (numero < montree.current) return next;
      montree.current = numero;
      if (next === null) {
        setLoadError("La réponse du serveur est illisible.");
        return null;
      }
      show(next);
      onRead?.(next);
      return next;
    } catch (e) {
      if (numero < montree.current) return null;
      montree.current = numero;
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
    let alive = true;
    void (premiere ?? Promise.resolve(null)).then((lu) => {
      if (!alive) return;
      // La lecture du menu a échoué, ou il n'y en a pas : la rubrique lit le serveur elle-même.
      if (lu === null) return void load().then((next) => isWaiting(next) && follow());
      // La lecture du menu : le menu l'a déjà, rien à lui redonner.
      show(lu);
      if (isWaiting(lu)) follow();
    });
    return () => {
      alive = false;
      stopFollowing();
    };
  }, []);

  const act = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    const avant = document.activeElement;
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
      // « Débrancher » disparaît avec le réglage : le focus va au message qui dit la suite.
      rendreLeFocus(avant, "discord-retour");
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

  const { armed, bouton: debrancher } = useSecondClic(() => {
    void act(() => call("clear_discord_calls"), "Salon débranché : les appels ne partent plus sur Discord.");
  });

  if (state === null) {
    return (
      <section aria-label="Les appels sur Discord" data-testid="direction-discord">
        {loadError ? <Problem message={loadError} onRetry={() => void load()} /> : <Loading />}
      </section>
    );
  }

  const etat = etatDesAppels(state);
  const ping = etatDuPing(state);
  const lastFails = state.last !== null && (state.last.outcome.state === "refused" || state.last.outcome.state === "unsent");

  return (
    // Le titre et la phrase qui dit à quoi sert la rubrique sont dans le menu, au-dessus.
    <section class="dir-discord-reglages" aria-label="Les appels sur Discord" data-testid="direction-discord">
      {loadError && <Problem message={loadError} onRetry={() => void load()} />}
      <div class="dir-discord-reglage" data-dir-ton={etat.ton}>
        <div class="dir-discord-reglage-lu" data-testid="direction-discord-state">
          <div class="dir-discord-reglage-tete">
            <Pastille ton={etat.ton} testid="direction-discord-etat">
              {etat.mot}
            </Pastille>
            {ping && (
              <Pastille ton={ping.ton} plain>
                {ping.mot}
              </Pastille>
            )}
          </div>
          <div class="dir-discord-phrases">
            {!state.set && <p class="text-sm text-muted">Les appels du QG ne partent pas sur Discord.</p>}
            {state.set && (
              <p>
                {state.role ? (
                  <>
                    Rôle des pings : <span class="tnum">{state.role}</span>
                  </>
                ) : (
                  "Aucun rôle : pas de ping possible."
                )}
              </p>
            )}
            {state.updatedAt && (
              <p class="text-sm text-muted">
                Réglé le {fmtDateTime(state.updatedAt)}
                {state.updatedBy ? ` par ${state.updatedBy}` : ""}.
              </p>
            )}
            <p role="status" class="dir-discord-phrase" data-dir-ton={lastFails ? "danger" : undefined} data-testid="direction-discord-last">
              {state.last ? lastSendSentence(state.last, fmtDateTime) : ""}
            </p>
          </div>
          {state.role && (
            <details class="dir-discord-plus">
              <summary>La règle des pings</summary>
              <p data-testid="direction-discord-ping-rule">
                Le ping est une case de chaque appel, au QG : au plus un toutes les {PING_WAIT_CLAN_MINUTES} minutes pour le clan, et toutes les {PING_WAIT_MEMBER_MINUTES} minutes par membre.
              </p>
            </details>
          )}
        </div>

        <div class="dir-discord-reglage-agir">
          <form
            class="dir-discord-saisie"
            data-testid="direction-discord-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void save();
            }}
          >
            <div class="dir-discord-champs">
              <div>
                <label for="discord-lien" class="text-sm font-semibold">
                  Lien du webhook du salon
                </label>
                <input
                  id="discord-lien"
                  class="field dir-champ mt-1"
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
                  class="field dir-champ tnum mt-1"
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
            </div>
            <div>
              <button type="submit" class="btn btn-primary" disabled={busy}>
                Enregistrer et envoyer un essai
              </button>
            </div>
          </form>

          {state.set && (
            <>
              <div class="dir-discord-actions">
                <button type="button" class="dir-bouton" disabled={busy} onClick={() => void act(() => call("test_discord_calls"), state.role ? "Essai envoyé : il montre la mention sans notifier personne." : "Essai envoyé.")} data-testid="direction-discord-test">
                  Renvoyer un essai
                </button>
              </div>
              {/* Débrancher efface le réglage, lien compris : à part, sous un filet, loin de « Renvoyer un essai », gris tant qu'on
                  n'y passe pas, et seulement au second clic. Le 11 novembre 2026, « Arrêter l'envoi », à côté de « Dernier envoi :
                  l'essai », a été lu comme la fin de l'essai. L'avertissement vient dessous : le bouton ne bouge pas entre les deux
                  clics. */}
              <div class="dir-discord-retirer">
                <button
                  type="button"
                  class="dir-bouton dir-discord-retrait"
                  data-dir-ton="danger"
                  disabled={busy}
                  aria-describedby={armed ? "discord-stop-note" : undefined}
                  {...debrancher}
                  data-testid="direction-discord-stop"
                >
                  {armed ? "Confirmer : débrancher" : "Débrancher le salon"}
                </button>
                {armed && (
                  <p id="discord-stop-note" class="text-sm text-warn">
                    Les appels ne partiront plus sur Discord, et il faudra recoller le lien du webhook pour rebrancher le salon.
                  </p>
                )}
              </div>
            </>
          )}
          <Problem message={problem} />
          <Retour id="discord-retour" message={done} />
        </div>
      </div>

      <details class="fold">
        <summary>Où trouver le lien et l'identifiant</summary>
        <ol class="mt-2 grid list-decimal gap-2 pl-5 text-muted">
          <li>Le lien : dans Discord, Modifier le salon → Intégrations → Webhooks → Nouveau webhook, puis Copier l'URL du webhook. Il permet d'écrire dans le salon : ne le montrez à personne.</li>
          <li>Le rôle : Paramètres utilisateur → Avancés → Mode développeur. Puis Paramètres du serveur → Rôles, clic droit sur le rôle → Copier l'identifiant du rôle. Si l'essai n'affiche pas le nom du rôle, l'identifiant n'est pas le bon.</li>
          <li>Si un ping ne notifie personne : dans les réglages du rôle, autorisez tout le monde à le mentionner.</li>
        </ol>
      </details>
    </section>
  );
}
