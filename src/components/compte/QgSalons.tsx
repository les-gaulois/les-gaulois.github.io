import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { callMarks, callTon, endingSoon, pingNotice, remainingLabel, saveCallArgs, savedNotice, sortCalls, waitingLabel } from "../../lib/compte/qg-salons";
import { LOBBY_FORMATS, PING_RULE, callKey, lobbyIdOf, lobbyUrl, pingRefusal, seatsNote, type LobbyCall } from "../../lib/compte/salons";
import { chime, refreshAfterWrite, setSound, start, subscribe, unlockAudio, type AppelsState } from "./appels";
import { Avatar, Problem, messageOf } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/**
 * Une ligne par appel : qui, depuis quand, le temps qui reste, ses états en couleur avec leur mot, et le lien du salon. Le
 * bord de la ligne prend la couleur de l'appel (`callTon`) : bleu le mien, jaune celui qui finit bientôt, vert les autres.
 * `children` : les boutons de mon propre appel. `note` : pourquoi mon dernier ping n'est pas parti.
 */
function Ligne({ call: item, now, children, note = null }: { call: LobbyCall; now: number; children?: ComponentChildren; note?: string | null }) {
  const seats = seatsNote(item.format);
  const since = waitingLabel(item.createdAt, now);
  const left = remainingLabel(item.expiresAt, now);
  return (
    <li class="dir-ligne salons-ligne" data-dir-ton={callTon(item, now)} data-testid={item.mine ? "qg-salons-mine" : "qg-salons-call"}>
      <Avatar name={item.name} avatar={item.avatar} />
      <strong class="salons-nom">{item.name}</strong>
      <p class="salons-etat">
        {since && <span class="tnum">{since}</span>}
        {left && (
          <Pastille ton={endingSoon(item.expiresAt, now) ? "warn" : "muted"} plain testid="qg-salons-left">
            <span class="tnum">{left}</span>
          </Pastille>
        )}
        {/* Un appel d'avant le 10 novembre 2026, ou d'une page restée ouverte, dit encore son format. */}
        {item.format && <span>{LOBBY_FORMATS[item.format]}</span>}
        {callMarks(item).map((mark) => (
          <Pastille key={mark.key} ton={mark.ton} testid={`qg-salons-mark-${mark.key}`}>
            {mark.label}
          </Pastille>
        ))}
      </p>
      <div class="salons-actions">
        {children}
        {!item.mine && (
          <a class="btn btn-primary salons-rejoindre" href={lobbyUrl(item.game)} target="_blank" rel="noopener" data-testid="qg-salons-join">
            Rejoindre<span class="sr-only"> la partie de {item.name} (nouvel onglet)</span>
          </a>
        )}
      </div>
      {seats && <p class="salons-suite">{seats}</p>}
      {note && (
        <p class="salons-suite" data-testid="qg-salons-ping-note">
          <Pastille ton="warn" plain>
            {note}
          </Pastille>
        </p>
      )}
    </li>
  );
}

/**
 * Après une action, le bouton qui avait le focus a pu disparaître avec sa ligne (le ping parti, l'appel retiré) : le focus va
 * alors à `target`, au lieu de tomber sur la page. Rien ne bouge si le focus était ailleurs ou s'il est resté. Le délai laisse
 * Preact dessiner la liste relue.
 */
function keepFocus(before: Element | null, target: () => HTMLElement | null): void {
  window.setTimeout(() => {
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (before instanceof HTMLElement && !before.isConnected && lost) target()?.focus();
  }, 0);
}

/**
 * Rejoindre un Gaulois, au QG : le formulaire pour prévenir les autres, sur une ligne, puis une ligne par appel en cours.
 * Le pop-up et le son sont communs aux pages du site (`AppelsGaulois.tsx`), et le relevé des appels aussi (`appels.ts`). Le
 * site ne lit rien chez OpenFront. Le serveur revérifie chaque appel (`save_lobby_call`). C'est l'onglet « Salons » du QG :
 * sans `id`, l'adresse #salons ouvre l'onglet (`Onglets.tsx`) au lieu de faire défiler la page. `voice` : le salon vocal du
 * clan, réglé dans la Direction (`get_qg_tools`), pour se retrouver avant de lancer la partie ; `null`, pas de bouton.
 * Les calculs de la liste (ordre, temps restant, états en couleur) et des envois sont dans `src/lib/compte/qg-salons.ts` ; le
 * dessin, dans `global.css`, section « Le QG, onglet Salons ».
 */
export default function QgSalons({ voice = null }: { voice?: string | null }) {
  const [appels, setAppels] = useState<AppelsState | null>(null);
  const [said, setSaid] = useState("");
  const [link, setLink] = useState("");
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Le ping est un choix de chaque appel, décoché au départ (migration 20261111000200_appels_discord_ping_au_choix.sql).
  const [ping, setPing] = useState(false);
  // Pourquoi le dernier ping demandé n'est pas parti : l'anti-spam du serveur, un rôle absent, une panne.
  const [pingNote, setPingNote] = useState<string | null>(null);
  // Le lien collé ne se lit pas : le champ est marqué invalide jusqu'au prochain envoi.
  const [badLink, setBadLink] = useState(false);
  const [, setTick] = useState(0);
  const submitButton = useRef<HTMLButtonElement>(null);
  const withdrawButton = useRef<HTMLButtonElement>(null);

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
   * l'anti-spam le permet. Arguments et annonce : `saveCallArgs` et `savedNotice` (`qg-salons.ts`).
   */
  const submit = async () => {
    const game = lobbyIdOf(link);
    if (game === null) {
      setBadLink(true);
      return setFormProblem(errorMessage("invalid_game"));
    }
    const withPing = ping && data?.pingPossible === true;
    setBusy(true);
    setBadLink(false);
    setFormProblem(null);
    setPingNote(null);
    setSaid("");
    try {
      const answer = await call<{ discord?: boolean; ping?: unknown }>("save_lobby_call", saveCallArgs(game, withPing));
      setLink("");
      setPing(false);
      await refreshAfterWrite();
      setPingNote(pingRefusal(answer?.ping));
      setSaid(savedNotice(answer));
    } catch (e) {
      setFormProblem(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Le bouton « Ping sur Discord » : un ping pour l'appel en cours, et lui seul (`ping_lobby_call`). Un appel fini ne repart
   * pas. Parti, le bouton disparaît : le focus passe à « Retirer mon appel ».
   */
  const pingNow = async () => {
    const before = document.activeElement;
    setBusy(true);
    setFormProblem(null);
    setPingNote(null);
    setSaid("");
    try {
      const answer = await call<{ ping?: unknown }>("ping_lobby_call");
      await refreshAfterWrite();
      setPingNote(pingRefusal(answer?.ping));
      setSaid(pingNotice(answer));
    } catch (e) {
      const problem = messageOf(e);
      setPingNote(problem);
      setSaid(problem);
    } finally {
      setBusy(false);
      keepFocus(before, () => withdrawButton.current);
    }
  };

  /** Retire mon appel (`end_lobby_call`). Sa ligne disparaît avec le bouton : le focus passe au bouton d'envoi, sans ouvrir le clavier d'un téléphone. */
  const withdraw = async () => {
    const before = document.activeElement;
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
      keepFocus(before, () => submitButton.current);
    }
  };

  const data = appels?.data ?? null;
  const now = Date.now() + (appels?.offset ?? 0);
  const soundOn = appels?.soundOn ?? true;
  const calls = sortCalls(data?.calls ?? []);
  const soundWaits = soundOn && appels !== null && !appels.audioReady;
  // Le bouton attend le premier relevé, qui seul dit si les appels partent sur Discord.
  const waiting = busy || data === null;

  return (
    <section class="qg-salons" aria-labelledby="salons-title" data-testid="qg-salons">
      <PartieTete
        id="salons-title"
        title="Rejoindre un Gaulois"
        aside={
          <div class="flex flex-wrap items-center gap-3">
            {/* Texte seul, sans logo ni couleur de Discord (CLAUDE.md, Licences). */}
            {voice && (
              <a class="btn btn-ghost" href={voice} target="_blank" rel="noopener" data-testid="qg-salons-vocal">
                Rejoindre le vocal<span class="sr-only"> (Discord, nouvel onglet)</span>
              </a>
            )}
            <button type="button" class="chip" aria-pressed={soundOn} onClick={toggleSound} data-testid="qg-salons-sound">
              Son des appels
            </button>
            {soundWaits && (
              <button type="button" class="underline" onClick={tryAudio} data-testid="qg-salons-try">
                Essayer le son
              </button>
            )}
          </div>
        }
      />
      <Problem message={appels?.problem ?? null} />

      {/* L'appel sur une ligne : le lien, le ping au choix, le bouton. */}
      <form
        class="salons-appel"
        data-testid="qg-salons-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!waiting) void submit();
        }}
      >
        <label for="salon-lien" class="salons-libelle">
          Vous attendez dans un salon ? Collez son lien ou son code
        </label>
        <div class="salons-saisie">
          <input id="salon-lien" class="field salons-champ" inputMode="url" autoComplete="off" spellcheck={false} placeholder="https://openfront.io/game/…" value={link} aria-invalid={badLink || undefined} aria-describedby={badLink && formProblem ? "salon-erreur" : undefined} onInput={(e) => setLink(e.currentTarget.value)} />
          {/* Le ping n'est proposé que si un rôle est réglé : sans lui, il ne pourrait pas partir. Sa règle se lit dans le repli ;
              les lecteurs d'écran l'entendent avec la case, par une copie cachée : le contenu d'un repli fermé n'est pas lu. */}
          {data?.pingPossible && (
            <>
              <label class="salons-ping">
                <input type="checkbox" class="size-5" checked={ping} aria-describedby="salon-ping-regle" onChange={(e) => setPing(e.currentTarget.checked)} data-testid="qg-salons-ping" />
                Ping du rôle sur Discord
              </label>
              <span id="salon-ping-regle" hidden>
                {PING_RULE}
              </span>
            </>
          )}
          {/* Pendant l'envoi, le bouton garde le focus : `aria-disabled`, jamais `disabled`. */}
          <button ref={submitButton} type="submit" class="btn btn-primary salons-envoi" aria-disabled={waiting || undefined} data-testid="qg-salons-submit">
            Prévenir les Gaulois
          </button>
        </div>
        {/* Le site ne peut pas vérifier le mode du salon : cette phrase est le seul garde-fou contre le chacun pour soi public.
            Le message Discord reste dans le salon après l'appel, sauf si l'appel est retiré : la phrase le dit avant l'appel. */}
        <p class="salons-garde" data-testid="qg-salons-privacy">
          Salons en équipes ou privés seulement. Les membres verront votre pseudo
          {data?.discord ? " ; l'appel part aussi sur le Discord du clan, où le message reste sauf si vous retirez l'appel." : "."}
        </p>
        {formProblem && (
          <div id="salon-erreur">
            <Problem message={formProblem} />
          </div>
        )}
      </form>

      {/* Personne n'attend : rien, ni titre ni phrase. */}
      {calls.length > 0 && (
        <div class="salons-en-cours">
          <h3 class="salons-titre">
            Appels en cours{" "}
            <span class="dir-nombre tnum" data-testid="qg-salons-count">
              {calls.length}
            </span>
          </h3>
          <ul class="dir-liste salons-liste" data-testid="qg-salons-list">
            {calls.map((item) =>
              item.mine ? (
                <Ligne key={callKey(item)} call={item} now={now} note={pingNote}>
                  {/* Le ping après coup, pour cet appel : le serveur refait son message Discord avec la mention, si l'anti-spam le permet. */}
                  {data?.pingPossible && !item.ping && (
                    <button type="button" class="dir-bouton" data-dir-ton="ally" aria-disabled={busy || undefined} onClick={() => !busy && void pingNow()} data-testid="qg-salons-ping-now">
                      Ping sur Discord
                    </button>
                  )}
                  <button ref={withdrawButton} type="button" class="dir-bouton salons-retirer" data-dir-ton="danger" aria-disabled={busy || undefined} onClick={() => !busy && void withdraw()} data-testid="qg-salons-withdraw">
                    Retirer mon appel
                  </button>
                </Ligne>
              ) : (
                <Ligne key={callKey(item)} call={item} now={now} />
              ),
            )}
          </ul>
        </div>
      )}

      {/* Ce qui ne se lit qu'une fois : les règles des appels et du ping. */}
      <details class="fold salons-regles" data-testid="qg-salons-rules">
        <summary>Règles des appels</summary>
        <div class="grid gap-3 text-muted">
          <p>En chacun pour soi, OpenFront interdit de s'entendre hors de la partie : seuls les salons en équipes ou privés s'annoncent ici.</p>
          <p>Un appel dure 15 minutes au plus. Les membres connectés sont prévenus sur les pages du site ; sur téléphone, gardez le site à l'écran.</p>
          {data?.pingPossible && <p>{PING_RULE}</p>}
          <p>Bord vert : un salon ouvert. Jaune : l'appel finit bientôt. Bleu : le vôtre.</p>
          {soundWaits && <p>Le son jouera après un premier clic sur la page.</p>}
        </div>
      </details>

      <p class="sr-only" role="status">
        {said}
      </p>
    </section>
  );
}
