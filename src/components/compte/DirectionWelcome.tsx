import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { fmtDateTime } from "../../lib/format";
import { Loading, Problem, Success, messageOf, useRun } from "./common";

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
    <section class="card p-5" aria-labelledby="welcome-title" data-testid="direction-welcome">
      <h2 id="welcome-title" class="text-xl">
        Mot d'accueil
      </h2>
      <p class="mt-2 text-sm text-muted">Chaque membre validé le lit en haut du QG : les salons à rejoindre, les règles du clan. Un texte vide l'efface.</p>
      <Problem message={loadError} onRetry={() => void load().then((body) => body !== null && setDraft(body))} />
      {draft === null ? (
        !loadError && <Loading />
      ) : (
        <form
          class="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => call("save_welcome", { p_body: draft }), draft.trim() === "" ? "Mot d'accueil effacé." : "Mot d'accueil enregistré : les membres validés le voient au QG.");
          }}
        >
          <div>
            <label for="welcome-body" class="text-sm font-semibold">
              Texte
            </label>
            <textarea id="welcome-body" class="field mt-1" rows={5} maxLength={MAX} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
            {updatedAt && <p class="tnum mt-1 text-xs text-muted">Enregistré le {fmtDateTime(updatedAt)}</p>}
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
    </section>
  );
}
