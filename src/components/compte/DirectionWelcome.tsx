import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { WELCOME_MAX, welcomeCount, welcomeIsTall, welcomeState, welcomeText } from "../../lib/compte/direction-accueil";
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

  const load = async () => {
    try {
      const data = await call<{ body: string | null; updated_at: string | null }>("get_welcome");
      setSaved(data.body ?? "");
      setUpdatedAt(data.updated_at);
      setLoadError(null);
      return data.body ?? "";
    } catch (e) {
      setLoadError(messageOf(e));
      return null;
    }
  };
  const { busy, error, done, run } = useRun(async () => {
    await load();
  });

  useEffect(() => {
    // Le texte enregistré est toujours relu, pour sa date ; un brouillon en cours, gardé pendant la vue joueur, passe avant lui.
    const kept = draft;
    void load().then((body) => {
      if (kept === null && body !== null) setDraft(body);
    });
  }, []);

  const state = welcomeState(saved, draft);
  const shown = welcomeText(draft);
  const count = welcomeCount(draft ?? "");
  const pending = state.kind === "changed" || state.kind === "unread";

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
      <Problem message={loadError} onRetry={() => void load().then((body) => body !== null && draft === null && setDraft(body))} />
      {draft === null ? (
        !loadError && <Loading />
      ) : (
        <div class="dir-accueil-grille">
          <form
            class="dir-accueil-champ"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => call("save_welcome", { p_body: draft }), shown === "" ? "Mot d'accueil effacé." : "Mot d'accueil enregistré : les membres validés le voient au QG.");
            }}
          >
            <div class="dir-accueil-tete">
              <label for="welcome-body">Texte</label>
              <span id="welcome-count" class="dir-accueil-compte tnum" data-dir-ton={count.near ? "warn" : "muted"} data-testid="welcome-count">
                {count.left === 0 ? `Limite atteinte : ${fmtInt(WELCOME_MAX)} caractères` : count.near ? `Il reste ${fmtInt(count.left)} caractères` : `${fmtInt(count.used)} sur ${fmtInt(WELCOME_MAX)} caractères`}
              </span>
            </div>
            <textarea id="welcome-body" class="field" rows={9} maxLength={WELCOME_MAX} aria-describedby="welcome-count" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
            <div class="dir-accueil-pied">
              <button type="submit" class="btn btn-primary" disabled={busy}>
                Enregistrer le mot d'accueil
              </button>
              {updatedAt && (
                <p class="tnum text-sm text-muted" data-testid="welcome-saved-at">
                  Enregistré le {fmtDateTime(updatedAt)}
                </p>
              )}
            </div>
            <Problem message={error} />
            <Success message={done} />
          </form>

          <div class="dir-accueil-vue">
            <div class="dir-accueil-tete">
              <h3 id="welcome-preview-title">{pending ? "Au QG, après l'enregistrement" : "Au QG, en ce moment"}</h3>
            </div>
            {shown === "" ? (
              <p class="dir-accueil-rien" data-testid="welcome-preview-empty">
                {pending && saved ? "Plus de mot : le QG n'affichera rien à cette place." : "Pas de mot : le QG n'affiche rien à cette place."}
              </p>
            ) : (
              // La fenêtre « motd » du QG (`qg-welcome`, `QgApp.tsx`) : même titre, même texte, même date.
              <div class="card dir-accueil-motd" role="group" aria-labelledby="welcome-preview-title" data-titre="motd" data-testid="welcome-preview">
                <p class="dir-accueil-motd-titre">Le mot de l'encadrement</p>
                {welcomeIsTall(shown) ? (
                  // Un mot long défile dans son cadre, atteint au clavier ; au QG, il s'affiche en entier.
                  <p class="dir-accueil-motd-texte dir-accueil-motd-long" tabIndex={0} role="group" aria-label="Le texte du mot, à faire défiler" data-testid="welcome-preview-long">
                    {shown}
                  </p>
                ) : (
                  <p class="dir-accueil-motd-texte">{shown}</p>
                )}
                {state.kind === "online" && updatedAt && <p class="tnum mt-2 text-sm text-muted">Mis à jour le {fmtDate(updatedAt)}</p>}
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
