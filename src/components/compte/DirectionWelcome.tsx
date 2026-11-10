import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, Success, messageOf, useRun } from "./common";
import { PartieTete } from "./Onglets";

const MAX = 2000;

/**
 * Le mot d'accueil : un texte de l'encadrement que chaque membre validé lit au QG.
 * `draft` est gardé par l'espace Direction : `null` tant que le texte enregistré n'est pas lu.
 */
export default function DirectionWelcome({ draft, setDraft }: { draft: string | null; setDraft: (text: string) => void }) {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await call<{ body: string | null; updated_at: string | null }>("get_welcome");
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

  return (
    <section aria-labelledby="welcome-title" data-testid="direction-welcome">
      <PartieTete id="welcome-title" title="Mot d'accueil">
        <p>Affiché en haut du QG. Un texte vide l'efface.</p>
      </PartieTete>
      <div class="card mt-6 max-w-3xl p-5">
        <Problem message={loadError} onRetry={() => void load().then((body) => body !== null && setDraft(body))} />
        {draft === null ? (
          !loadError && <Loading />
        ) : (
          <form
            class="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => call("save_welcome", { p_body: draft }), draft.trim() === "" ? "Mot d'accueil effacé." : "Mot d'accueil enregistré : les membres validés le voient au QG.");
            }}
          >
            <div>
              <label for="welcome-body" class="text-sm font-semibold">
                Texte
              </label>
              <textarea id="welcome-body" class="field mt-1" rows={7} maxLength={MAX} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
              {updatedAt && <p class="tnum mt-2 text-sm text-muted">Enregistré le {fmtDateTime(updatedAt)}</p>}
            </div>
            <div>
              <button type="submit" class="btn btn-primary" disabled={busy}>
                Enregistrer le mot d'accueil
              </button>
            </div>
          </form>
        )}
        <Problem message={error} />
        {done && <Success message={done} />}
      </div>
    </section>
  );
}
