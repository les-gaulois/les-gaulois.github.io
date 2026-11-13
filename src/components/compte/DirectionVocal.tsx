import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { etatDuVocal } from "../../lib/compte/discord-etat";
import { errorMessage } from "../../lib/compte/errors";
import { parseQgTools, voiceLinkOf } from "../../lib/compte/outils";
import { Loading, Problem, Success, messageOf } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/**
 * Le salon vocal du clan, pour les admins et le fondateur : son lien devient le bouton « Rejoindre le vocal » de l'onglet
 * « Salons » du QG. Le serveur ne garde qu'un lien de salon Discord (`save_voice_channel`) et ne le donne qu'aux membres
 * validés (`get_qg_tools`). Le retirer ôte seulement le bouton : à part, sous un filet, au second clic.
 * `bare` : sans son titre, quand le menu de l'onglet Discord le donne déjà. `onRead` donne chaque lecture du serveur à ce menu.
 * Un bloc court, comme les salons du robot (14 novembre 2026) : l'état en pastille et le lien d'un côté, le champ de l'autre.
 */
export default function DirectionVocal({ bare = false, onRead }: { bare?: boolean; onRead?: (voice: string | null) => void }) {
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
      onRead?.(tools.voice);
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

  const etat = current === undefined ? null : etatDuVocal(current);

  return (
    <section class="dir-discord-reglages" aria-labelledby={bare ? undefined : "vocal-title"} aria-label={bare ? "Le salon vocal" : undefined} data-testid="direction-vocal">
      {!bare && (
        <PartieTete id="vocal-title" title="Le salon vocal">
          <p>Le bouton « Rejoindre le vocal » de l'onglet Salons du QG.</p>
        </PartieTete>
      )}
      <div class="dir-discord-reglage" data-dir-ton={etat?.ton}>
        <div class="dir-discord-reglage-lu" data-testid="direction-vocal-state">
          {current === undefined || etat === null ? (
            loadError ? <Problem message={loadError} onRetry={() => void load()} /> : <Loading />
          ) : (
            <>
              <div class="dir-discord-reglage-tete">
                <Pastille ton={etat.ton} testid="direction-vocal-etat">
                  {etat.mot}
                </Pastille>
              </div>
              <div class="dir-discord-phrases">
                {current === null ? (
                  <p class="text-sm text-muted">Le QG n'affiche pas le bouton.</p>
                ) : (
                  <p class="text-sm [overflow-wrap:anywhere]">
                    <a href={current} target="_blank" rel="noopener">
                      {current}
                      <span class="sr-only"> (nouvel onglet)</span>
                    </a>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div class="dir-discord-reglage-agir">
          <form
            class="dir-discord-saisie"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void save();
            }}
          >
            <label for="vocal-lien" class="text-sm font-semibold">
              {current ? "Changer le lien du salon vocal" : "Lien du salon vocal"}
            </label>
            <div class="dir-discord-saisie-ligne">
              <input
                id="vocal-lien"
                class="field dir-champ"
                inputMode="url"
                autoComplete="off"
                spellcheck={false}
                placeholder="https://discord.com/channels/…"
                aria-describedby="vocal-lien-note"
                value={link}
                onInput={(e) => setLink(e.currentTarget.value)}
              />
              <button type="submit" class="btn btn-primary" disabled={busy || link.trim() === ""}>
                Enregistrer
              </button>
            </div>
            <p id="vocal-lien-note" class="text-sm text-muted">
              Dans Discord : clic droit sur le salon vocal, puis « Copier le lien ».
            </p>
          </form>

          {current && (
            <>
              {/* Retirer ôte le bouton du QG : à part, gris tant qu'on n'y passe pas, et seulement au second clic. */}
              <div class="dir-discord-actions">
                <button
                  type="button"
                  class="dir-bouton dir-discord-retrait"
                  data-dir-ton="danger"
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
            </>
          )}
          <Problem message={problem} />
          {done && <Success message={done} />}
        </div>
      </div>
    </section>
  );
}
