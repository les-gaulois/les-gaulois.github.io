import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { isWebhookLink } from "../../lib/compte/discord-appels";
import { checkFails, checkSentence, isSalonWaiting, parseDiscordSalons, ROBOT_SALON_TEXTS, testSentence, type RobotSalon, type RobotSalonText } from "../../lib/compte/discord-salons";
import { errorMessage } from "../../lib/compte/errors";
import { etatDuSalon } from "../../lib/compte/discord-etat";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, Success, messageOf } from "./common";
import { Pastille } from "./direction-kit";

/** Les relectures qui suivent un essai, le temps que Discord réponde : pg_net envoie d'ordinaire en moins d'une seconde. */
const FOLLOW_UP_MS = [1_500, 4_000, 10_000, 30_000];

/**
 * Les salons Discord du robot, pour les admins et le fondateur : le salon des nouvelles, celui de l'encadrement et, quand le
 * serveur a leur migration, celui des victoires et celui de l'alliance (où le serveur poste lui-même, sans secret GitHub).
 * Le robot de la GitHub Action y poste avec le lien réglé ici, sinon avec le secret GitHub. Le lien n'est jamais relu :
 * le serveur le garde, et le champ se vide après l'enregistrement. Chaque enregistrement envoie un essai, sans mention ;
 * la page relit ensuite la réponse de Discord, et montre le dernier contrôle du robot, fait à chaque passage.
 *
 * Un salon tient en un bloc court (14 novembre 2026, « comme pour la section compte ») : son nom et son état en pastille,
 * ce qu'a répondu Discord, puis le champ du lien et ses boutons à côté. Ce qui part dans le salon et l'aide sont repliés.
 * `onRead` : chaque lecture du serveur est donnée au menu de l'onglet, qui montre l'état de chaque salon sur sa ligne.
 */
export default function DirectionSalons({ level = 2, onRead }: { level?: 2 | 3; onRead?: (salons: RobotSalon[]) => void }) {
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
      onRead?.(next);
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
    <div class="dir-discord-reglages">
      {loadError && <Problem message={loadError} onRetry={() => void load()} />}
      {ROBOT_SALON_TEXTS.map((text) => {
        const salon = salons.find((s) => s.id === text.id);
        return salon ? <SalonPart key={text.id} text={text} salon={salon} reload={reload} level={level} /> : null;
      })}
      <details class="fold">
        <summary>Où trouver le lien d'un webhook</summary>
        <p class="mt-2 text-muted">
          Dans Discord : Modifier le salon → Intégrations → Webhooks → Nouveau webhook, puis Copier l'URL du webhook. Il permet d'écrire dans le salon : ne le montrez à personne. Un même webhook peut servir à plusieurs réglages du site s'ils postent dans le même salon.
        </p>
      </details>
    </div>
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

  const etat = etatDuSalon(salon);
  const failing = checkFails(salon.check);
  const lastFails = salon.last !== null && (salon.last.outcome.state === "refused" || salon.last.outcome.state === "unsent");
  // Le titre du salon : h3 sous une rubrique du menu Discord, h2 sinon.
  const Titre = level === 3 ? "h3" : "h2";

  return (
    <section class="dir-discord-reglage" data-dir-ton={etat.ton} aria-labelledby={`${id}-title`} data-testid={`direction-${id}`}>
      <div class="dir-discord-reglage-lu">
        <div class="dir-discord-reglage-tete">
          <Titre id={`${id}-title`} class="dir-discord-reglage-titre">
            {text.title}
          </Titre>
          <Pastille ton={etat.ton} testid={`direction-${id}-etat`}>
            {etat.mot}
          </Pastille>
        </div>
        <div class="dir-discord-phrases" data-testid={`direction-${id}-state`}>
          {salon.set ? (
            salon.updatedAt && (
              <p class="text-sm text-muted">
                Réglé le {fmtDateTime(salon.updatedAt)}
                {salon.updatedBy ? ` par ${salon.updatedBy}` : ""}.
              </p>
            )
          ) : (
            <p class="text-sm text-muted">
              {text.secret ? `Le robot prend le secret GitHub ${text.secret}, s'il existe.${text.secretNote ? ` ${text.secretNote}` : ""}` : "Rien ne part dans ce salon tant qu'il n'est pas branché ici."}
            </p>
          )}
          {/* La zone d'état existe avant de changer : un lecteur d'écran annonce la réponse de Discord quand elle arrive. */}
          <p role="status" class="dir-discord-phrase" data-dir-ton={lastFails ? "danger" : undefined} data-testid={`direction-${id}-last`}>
            {salon.last ? testSentence(salon.last, fmtDateTime) : ""}
          </p>
          {salon.check && (
            <p class={failing ? "dir-discord-phrase" : "text-sm text-muted"} data-dir-ton={failing ? "danger" : undefined} data-testid={`direction-${id}-check`}>
              {checkSentence(salon.check, text, fmtDateTime)}
            </p>
          )}
        </div>
        <details class="dir-discord-plus">
          <summary>Ce qui part dans ce salon</summary>
          <p>{text.intro}</p>
        </details>
      </div>

      <div class="dir-discord-reglage-agir">
        <form
          class="dir-discord-saisie"
          data-testid={`direction-${id}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void save();
          }}
        >
          <label for={`${id}-lien`} class="text-sm font-semibold">
            {salon.set ? "Changer le lien du webhook du salon" : "Lien du webhook du salon"}
          </label>
          <div class="dir-discord-saisie-ligne">
            <input
              id={`${id}-lien`}
              class="field dir-champ"
              inputMode="url"
              autoComplete="off"
              spellcheck={false}
              placeholder="https://discord.com/api/webhooks/…"
              value={link}
              onInput={(e) => setLink(e.currentTarget.value)}
            />
            <button type="submit" class="btn btn-primary" disabled={busy}>
              Enregistrer et envoyer un essai
            </button>
          </div>
        </form>

        {salon.set && (
          <>
            {/* Débrancher efface le réglage, lien compris : à part, après un filet, gris tant qu'on n'y passe pas, et seulement au
                second clic, comme pour les appels. L'avertissement vient dessous : le bouton ne bouge pas entre les deux clics. */}
            <div class="dir-discord-actions">
              <button type="button" class="dir-bouton" disabled={busy} onClick={() => void act(() => call("test_discord_salon", { p_salon: text.id }), "Essai envoyé.")}>
                Renvoyer un essai
              </button>
              <span class="dir-discord-filet" aria-hidden="true"></span>
              <button
                type="button"
                class="dir-bouton dir-discord-retrait"
                data-dir-ton="danger"
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
          </>
        )}
        <Problem message={problem} />
        {done && <Success message={done} />}
      </div>
    </section>
  );
}

