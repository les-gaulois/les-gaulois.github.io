import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { WELCOME_MAX, welcomeCount, welcomeCountLabel, welcomeIsTall, welcomePreview, welcomeSavedMessage, welcomeState, welcomeStored } from "../../lib/compte/direction-accueil";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { Loading, Problem, Success, messageOf, useRun } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/**
 * Le mot d'accueil : un texte de l'encadrement que chaque membre validé lit au QG.
 * `draft` est gardé par l'espace Direction : `null` tant que le texte enregistré n'est pas lu.
 *
 * L'écran, « comme pour Comptes » (14 novembre 2026) : l'état en pastille à côté du titre, le champ à gauche et, à droite,
 * ce que le QG montre (la même fenêtre « motd » que `QgApp.tsx`). Les règles sont dans `src/lib/compte/direction-accueil.ts`.
 */
export default function DirectionWelcome({ draft, setDraft }: { draft: string | null; setDraft: (text: string) => void }) {
  // Le mot enregistré, tel que le serveur le garde : `null` tant qu'il n'est pas lu, « » quand il n'y en a pas.
  const [saved, setSaved] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Vrai dès qu'on écrit après un enregistrement : « Mot d'accueil enregistré » ne parle plus du champ.
  const [edited, setEdited] = useState(false);
  // Vrai après un « Réessayer » réussi : le bouton disparaît, le focus va au champ.
  const [refocus, setRefocus] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // Le champ tel qu'il est à l'instant : une réponse qui arrive après une frappe ne l'écrase pas.
  const current = useRef(draft);
  current.current = draft;
  // Chaque lecture a son numéro : la réponse d'une lecture dépassée par une plus récente est écartée.
  const reads = useRef(0);
  // Le texte en cours d'envoi : un seul envoi à la fois.
  const sending = useRef<string | null>(null);

  const setField = (text: string) => {
    current.current = text;
    setDraft(text);
  };

  /**
   * Relit le mot enregistré, et remplit le champ s'il est encore vide : un brouillon gardé pendant la vue joueur passe avant.
   * Rend le texte lu, ou `null` (panne, ou lecture dépassée). `afterSave` : en panne, la date d'avant ne vaut plus.
   */
  const load = async (afterSave = false): Promise<string | null> => {
    const mine = ++reads.current;
    try {
      const data = await call<{ body: string | null; updated_at: string | null }>("get_welcome");
      if (mine !== reads.current) return null;
      const body = data.body ?? "";
      setSaved(body);
      setUpdatedAt(data.updated_at);
      setLoadError(null);
      if (current.current === null) setField(body);
      return body;
    } catch (e) {
      if (mine !== reads.current) return null;
      setLoadError(messageOf(e));
      if (afterSave) setUpdatedAt(null);
      return null;
    }
  };

  const { busy, error, done, run } = useRun(async () => {
    // Le serveur a accepté : il garde le texte sans les espaces autour. Le champ s'aligne sur lui (s'il n'a pas changé
    // pendant l'envoi), et la pastille le sait aussitôt, même si la relecture qui suit tombe en panne.
    const sent = sending.current ?? "";
    const kept = welcomeStored(sent);
    setSaved(kept);
    if (current.current === sent) setField(kept);
    await load(true);
  });

  useEffect(() => {
    void load();
  }, []);

  // Un nouveau message (réussite, ou plus rien au début d'un envoi) parle du champ tel qu'il est à cet instant.
  useEffect(() => setEdited(false), [done]);

  useEffect(() => {
    if (!refocus) return;
    setRefocus(false);
    const active = document.activeElement;
    if (active === null || active === document.body) field.current?.focus();
  }, [refocus]);

  const state = welcomeState(saved, draft);
  const preview = welcomePreview(saved, draft);
  const count = welcomeCount(draft ?? "");

  return (
    <section class="dir-accueil" aria-labelledby="welcome-title" data-testid="direction-welcome">
      <PartieTete
        id="welcome-title"
        title="Mot d'accueil"
        aside={
          (saved !== null || loadError) && (
            <Pastille ton={state.tone} testid="welcome-state">
              {state.label}
            </Pastille>
          )
        }
      />
      <Problem message={loadError} onRetry={() => void load().then((body) => body !== null && setRefocus(true))} />
      {draft === null ? (
        !loadError && <Loading />
      ) : (
        <div class="dir-accueil-grille">
          <form
            class="dir-accueil-champ"
            onSubmit={(e) => {
              e.preventDefault();
              // Un seul envoi à la fois : le bouton reste atteignable pendant l'envoi, ce garde-fou le remplace.
              if (busy || sending.current !== null) return;
              const sent = draft;
              sending.current = sent;
              void run(() => call("save_welcome", { p_body: sent }), welcomeSavedMessage(sent)).finally(() => {
                sending.current = null;
              });
            }}
          >
            <div class="dir-accueil-tete">
              <label for="welcome-body">Texte</label>
              <span id="welcome-count" class="dir-accueil-compte tnum" data-dir-ton={count.near ? "warn" : "muted"} data-testid="welcome-count">
                {welcomeCountLabel(count)}
              </span>
            </div>
            <textarea
              ref={field}
              id="welcome-body"
              class="field"
              rows={9}
              maxLength={WELCOME_MAX}
              aria-describedby="welcome-count"
              value={draft}
              onInput={(e) => {
                setField(e.currentTarget.value);
                setEdited(true);
              }}
            />
            <div class="dir-accueil-pied">
              {/* `aria-disabled` plutôt que `disabled` : un bouton désactivé perd le focus, qui tombait sur la page après « Entrée ». */}
              <button type="submit" class="btn btn-primary" aria-disabled={busy || undefined}>
                Enregistrer le mot d'accueil
              </button>
              {updatedAt && (
                <p class="tnum text-sm text-muted" data-testid="welcome-saved-at">
                  Enregistré le {fmtDateTime(updatedAt)}
                </p>
              )}
            </div>
            <Problem message={error} />
            <Success message={edited ? null : done} />
          </form>

          <div class="dir-accueil-vue">
            <div class="dir-accueil-tete">
              <h3 id="welcome-preview-title">{preview.title}</h3>
            </div>
            {preview.body === null ? (
              <p class="dir-accueil-rien" data-testid="welcome-preview-empty">
                {preview.empty}
              </p>
            ) : (
              // La fenêtre « motd » du QG (`qg-welcome`, `QgApp.tsx`) : même titre, même texte en `pre-line`, même date.
              <div class="card dir-accueil-motd" role="group" aria-labelledby="welcome-preview-title" data-titre="motd" data-testid="welcome-preview">
                <p class="dir-accueil-motd-titre">Le mot de l'encadrement</p>
                {welcomeIsTall(preview.body) ? (
                  // Un mot long défile dans son cadre, atteint au clavier ; au QG, il s'affiche en entier.
                  <p class="dir-accueil-motd-texte dir-accueil-motd-long" tabIndex={0} role="group" aria-label="Le texte du mot, à faire défiler" data-testid="welcome-preview-long">
                    {preview.body}
                  </p>
                ) : (
                  <p class="dir-accueil-motd-texte">{preview.body}</p>
                )}
                {preview.dated && updatedAt && <p class="tnum mt-2 text-sm text-muted">Mis à jour le {fmtDate(updatedAt)}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      <details class="fold dir-accueil-aide">
        <summary class="font-semibold">Comment ça marche</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Chaque membre validé lit ce mot en haut du QG, sous le titre « Le mot de l'encadrement ». Un mot long s'y affiche en entier.</p>
          <p>Enregistrer un texte vide efface le mot : le QG n'affiche alors rien à sa place.</p>
          <p>C'est un texte commun : tout l'encadrement, officiers compris, peut le réécrire. {fmtInt(WELCOME_MAX)} caractères au plus.</p>
        </div>
      </details>
    </section>
  );
}
