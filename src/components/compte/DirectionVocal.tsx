import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { parseQgTools, voiceLinkOf } from "../../lib/compte/outils";
import { Loading, Problem, Success, messageOf } from "./common";
import { PartieTete } from "./Onglets";

/**
 * Le salon vocal du clan, pour les admins et le fondateur : son lien devient le bouton « Rejoindre le vocal » de l'onglet
 * « Salons » du QG. Le serveur ne garde qu'un lien de salon Discord (`save_voice_channel`) et ne le donne qu'aux membres
 * validés (`get_qg_tools`). Le retirer ôte seulement le bouton : à part, sous un filet, au second clic.
 */
export default function DirectionVocal() {
  // `undefined` tant que ce n'est pas lu ; `null` : pas de lien réglé.
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const load = async () => {
    try {
      const tools = parseQgTools(await call<unknown>("get_qg_tools"));
      if (tools === null) return setLoadError("La réponse du serveur est illisible.");
      setCurrent(tools.voice);
      setLoadError(null);
    } catch (e) {
      setLoadError(messageOf(e));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await action();
      await load();
      setDone(success);
      return true;
    } catch (e) {
      setProblem(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    // Le serveur refait le contrôle : celui-ci évite seulement un aller-retour.
    const url = voiceLinkOf(link);
    if (url === null) return setProblem(errorMessage("invalid_voice"));
    if (await act(() => call("save_voice_channel", { p_url: url }), "Lien enregistré : le bouton « Rejoindre le vocal » est au QG.")) setLink("");
  };

  const remove = async () => {
    setArmed(false);
    await act(() => call("clear_voice_channel"), "Lien retiré : le QG n'affiche plus le bouton.");
  };

  return (
    <section aria-labelledby="vocal-title" data-testid="direction-vocal">
      <PartieTete id="vocal-title" title="Le salon vocal">
        <p>Le bouton « Rejoindre le vocal » de l'onglet Salons du QG.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void save();
          }}
        >
          <h3 class="text-lg">{current ? "Changer le lien" : "Régler le lien"}</h3>
          <div>
            <label for="vocal-lien" class="text-sm font-semibold">
              Lien du salon vocal
            </label>
            <input
              id="vocal-lien"
              class="field mt-1"
              inputMode="url"
              autoComplete="off"
              spellcheck={false}
              placeholder="https://discord.com/channels/…"
              value={link}
              onInput={(e) => setLink(e.currentTarget.value)}
            />
            <p class="mt-1 text-sm text-muted">Dans Discord : clic droit sur le salon vocal, puis « Copier le lien ».</p>
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || link.trim() === ""}>
              Enregistrer
            </button>
          </div>
        </form>

        <div class="card grid gap-3 p-5" data-testid="direction-vocal-state">
          {current === undefined ? (
            loadError ? <Problem message={loadError} onRetry={() => void load()} /> : <Loading />
          ) : current === null ? (
            <p class="text-muted">Aucun lien : le QG n'affiche pas le bouton.</p>
          ) : (
            <>
              <h3 class="text-lg">Lien en place</h3>
              <p class="text-sm [overflow-wrap:anywhere]">
                <a href={current} target="_blank" rel="noopener">
                  {current}
                  <span class="sr-only"> (nouvel onglet)</span>
                </a>
              </p>
              <div class="grid gap-2 border-t border-line pt-4">
                <div>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    disabled={busy}
                    aria-describedby={armed ? "vocal-retirer-note" : undefined}
                    onClick={() => (armed ? void remove() : setArmed(true))}
                    onBlur={() => setArmed(false)}
                    data-testid="direction-vocal-retirer"
                  >
                    {armed ? "Confirmer : retirer le lien" : "Retirer le lien"}
                  </button>
                </div>
                {armed && (
                  <p id="vocal-retirer-note" class="text-sm text-warn">
                    Le bouton « Rejoindre le vocal » disparaîtra du QG. Il faudra recoller le lien pour le remettre.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div class="lg:col-span-2">
          <Problem message={problem} />
          {done && <Success message={done} />}
        </div>
      </div>
    </section>
  );
}
