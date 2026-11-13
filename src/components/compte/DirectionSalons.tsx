import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { isWebhookLink } from "../../lib/compte/discord-appels";
import { checkFails, checkSentence, isSalonWaiting, parseDiscordSalons, ROBOT_SALON_TEXTS, testSentence, type RobotSalon, type RobotSalonText } from "../../lib/compte/discord-salons";
import { errorMessage } from "../../lib/compte/errors";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, Success, messageOf } from "./common";
import { PartieTete } from "./Onglets";

/** Les relectures qui suivent un essai, le temps que Discord réponde : pg_net envoie d'ordinaire en moins d'une seconde. */
const FOLLOW_UP_MS = [1_500, 4_000, 10_000, 30_000];

/**
 * Les salons Discord du robot, pour les admins et le fondateur : le salon des nouvelles, celui de l'encadrement et, quand le
 * serveur a leur migration, celui des victoires et celui de l'alliance (où le serveur poste lui-même, sans secret GitHub).
 * Le robot de la GitHub Action y poste avec le lien réglé ici, sinon avec le secret GitHub. Le lien n'est jamais relu :
 * le serveur le garde, et le champ se vide après l'enregistrement. Chaque enregistrement envoie un essai, sans mention ;
 * la page relit ensuite la réponse de Discord, et montre le dernier contrôle du robot, fait à chaque passage.
 */
export default function DirectionSalons({ level = 2 }: { level?: 2 | 3 }) {
  const [salons, setSalons] = useState<RobotSalon[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const load = async (): Promise<RobotSalon[] | null> => {
    try {
      const next = parseDiscordSalons(await call<unknown>("get_discord_salons"));
      if (next === null) {
        setLoadError("La réponse du serveur est illisible.");
        return null;
      }
      setSalons(next);
      setLoadError(null);
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
  const reload = async () => {
    const next = await load();
    if (!isSalonWaiting(next)) return;
    stopFollowing();
    timers.current = FOLLOW_UP_MS.map((ms) =>
      window.setTimeout(() => {
        void load().then((later) => {
          if (later !== null && !isSalonWaiting(later)) stopFollowing();
        });
      }, ms),
    );
  };

  useEffect(() => {
    void load();
    return stopFollowing;
  }, []);

  if (salons === null) {
    return loadError ? <Problem message={loadError} onRetry={() => void load()} /> : <Loading />;
  }
  return (
    <>
      {loadError && <Problem message={loadError} onRetry={() => void load()} />}
      {ROBOT_SALON_TEXTS.map((text) => {
        const salon = salons.find((s) => s.id === text.id);
        return salon ? <SalonPart key={text.id} text={text} salon={salon} reload={reload} level={level} /> : null;
      })}
    </>
  );
}

function SalonPart({ text, salon, reload, level }: { text: RobotSalonText; salon: RobotSalon; reload: () => Promise<void>; level: 2 | 3 }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const id = `salon-${text.id}`;

  const act = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      await reload();
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
    setDone(null);
    // Le serveur refait le contrôle : celui-ci évite seulement un aller-retour.
    if (!isWebhookLink(pasted)) return setProblem(errorMessage("invalid_webhook"));
    const ok = await act(() => call("save_discord_salon", { p_salon: text.id, p_webhook: pasted }), "Salon branché : un essai part dans le salon, sans mentionner personne.");
    if (ok) setLink("");
  };

  const stop = async () => {
    setArmed(false);
    await act(() => call("clear_discord_salon", { p_salon: text.id }), text.secret ? `Salon débranché. Le robot reprend le secret GitHub ${text.secret}, s'il existe.` : "Salon débranché. Plus rien n'y part.");
  };

  const failing = checkFails(salon.check);
  // Un cran sous le titre du salon : h4 quand ce titre est un h3, sous une rubrique du menu Discord.
  const Sous = level === 3 ? "h4" : "h3";

  return (
    <section aria-labelledby={`${id}-title`} data-testid={`direction-${id}`}>
      <PartieTete id={`${id}-title`} title={text.title} level={level}>
        <p>{text.intro}</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          data-testid={`direction-${id}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void save();
          }}
        >
          <Sous class="text-lg">{salon.set ? "Changer le lien" : "Brancher un salon"}</Sous>
          <div>
            <label for={`${id}-lien`} class="text-sm font-semibold">
              Lien du webhook du salon
            </label>
            <input
              id={`${id}-lien`}
              class="field mt-1"
              inputMode="url"
              autoComplete="off"
              spellcheck={false}
              placeholder="https://discord.com/api/webhooks/…"
              value={link}
              onInput={(e) => setLink(e.currentTarget.value)}
            />
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy}>
              Enregistrer et envoyer un essai
            </button>
          </div>
          <details class="text-sm">
            <summary class="cursor-pointer font-semibold">Où trouver le lien ?</summary>
            <p class="mt-2 text-muted">
              Dans Discord : Modifier le salon → Intégrations → Webhooks → Nouveau webhook, puis Copier l'URL du webhook. Il permet d'écrire dans le salon : ne le montrez à personne. Un même webhook peut servir à plusieurs réglages du site s'ils postent dans le même salon.
            </p>
          </details>
        </form>

        {(salon.set || salon.check) && (
          <div class="card grid gap-3 p-5" data-testid={`direction-${id}-state`}>
            <Sous class="text-lg">{salon.set ? "Réglage en place" : "Pas de lien réglé ici"}</Sous>
            {salon.set ? (
              salon.updatedAt && (
                <p class="tnum text-sm text-muted">
                  Réglé le {fmtDateTime(salon.updatedAt)}
                  {salon.updatedBy ? ` par ${salon.updatedBy}` : ""}.
                </p>
              )
            ) : (
              <p class="text-sm text-muted">
                {text.secret ? `Le robot prend le secret GitHub ${text.secret}, s'il existe.${text.secretNote ? ` ${text.secretNote}` : ""}` : "Rien ne part dans ce salon tant qu'il n'est pas branché ici."}
              </p>
            )}
            {salon.last && (
              <p role="status" data-testid={`direction-${id}-last`}>
                {testSentence(salon.last, fmtDateTime)}
              </p>
            )}
            {salon.check && (
              <p class={failing ? "font-semibold text-warn" : "text-sm text-muted"} data-testid={`direction-${id}-check`}>
                {checkSentence(salon.check, text, fmtDateTime)}
              </p>
            )}
            {salon.set && (
              <>
                <div>
                  <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void act(() => call("test_discord_salon", { p_salon: text.id }), "Essai envoyé.")}>
                    Renvoyer un essai
                  </button>
                </div>
                {/* Débrancher efface le réglage, lien compris : à part, sous un filet, et seulement au second clic, comme pour les
                    appels. L'avertissement vient sous le bouton : le bouton ne bouge pas entre les deux clics. */}
                <div class="grid gap-2 border-t border-line pt-4">
                  <div>
                    <button
                      type="button"
                      class="btn btn-ghost"
                      disabled={busy}
                      aria-describedby={armed ? `${id}-stop-note` : undefined}
                      onClick={() => (armed ? void stop() : setArmed(true))}
                      onBlur={() => setArmed(false)}
                      data-testid={`direction-${id}-stop`}
                    >
                      {armed ? "Confirmer : débrancher" : "Débrancher le salon"}
                    </button>
                  </div>
                  {armed && (
                    <p id={`${id}-stop-note`} class="text-sm text-warn">
                      {text.secret ? `Le robot reprendra le secret GitHub ${text.secret} s'il existe ; sinon, plus rien ne partira dans ce salon.` : "Plus rien ne partira dans ce salon."} Il faudra recoller le lien du webhook pour le régler de nouveau ici.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div class="lg:col-span-2">
          <Problem message={problem} />
          {done && <Success message={done} />}
        </div>
      </div>
    </section>
  );
}
