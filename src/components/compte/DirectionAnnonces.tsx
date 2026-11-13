/** L'onglet Annonces de la Direction : publier, modifier, supprimer les annonces de l'accueil. */
import { call } from "../../lib/compte/api";
import { fmtDate } from "../../lib/format";
import { DeleteButton, Problem, Success, focusField, useRun } from "./common";
import type { AnnouncementRow } from "./direction-overview";
import { PartieTete } from "./Onglets";

export const EMPTY_ANNOUNCEMENT = { id: null as number | null, title: "", body: "", url: "" };
export type AnnouncementDraft = typeof EMPTY_ANNOUNCEMENT;

export default function DirectionAnnonces({ rows, reload, form, setForm }: { rows: AnnouncementRow[]; reload: () => Promise<void>; form: AnnouncementDraft; setForm: (draft: AnnouncementDraft) => void }) {
  const empty = EMPTY_ANNOUNCEMENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const ok = await run(() => call("save_announcement", { p_id: form.id, p_title: form.title, p_body: form.body, p_url: form.url || null }), form.id ? "Annonce modifiée." : "Annonce publiée : elle est visible sur l'accueil.");
    if (ok) setForm(empty);
  };

  return (
    <section aria-labelledby="ann-title" data-testid="direction-announcements">
      <PartieTete id="ann-title" title="Annonces">
        <p>Visibles aussitôt sur l'accueil. Le nom de l'auteur n'est pas public.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 class="text-lg">{form.id ? "Modifier l'annonce" : "Nouvelle annonce"}</h3>
          <div>
            <label for="ann-t" class="text-sm font-semibold">
              Titre
            </label>
            <input id="ann-t" class="field mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="ann-b" class="text-sm font-semibold">
              Texte
            </label>
            <textarea id="ann-b" class="field mt-1" required rows={5} maxLength={2000} value={form.body} onInput={(e) => setForm({ ...form, body: e.currentTarget.value })} />
          </div>
          <div>
            <label for="ann-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="ann-u" class="field mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {form.id ? "Enregistrer" : "Publier l'annonce"}
            </button>
            {form.id && (
              <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
                Annuler
              </button>
            )}
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
        {rows.length > 0 && (
          <div>
            <h3 class="text-lg">Publiées depuis le site</h3>
            <ul class="mt-3 grid gap-3">
              {rows.map((a) => (
                <li key={a.id} class="card p-5" data-testid="direction-announcement">
                  <p class="font-semibold [overflow-wrap:anywhere]">{a.title}</p>
                  <p class="tnum mt-1 text-sm text-muted">
                    {fmtDate(a.created_at)}
                    {a.author ? ` · ${a.author}` : ""}
                  </p>
                  {a.editable && (
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
                        disabled={busy}
                        aria-label={`Modifier « ${a.title} »`}
                        onClick={() => {
                          setForm({ id: a.id, title: a.title, body: a.body, url: a.url ?? "" });
                          focusField("ann-t");
                        }}
                      >
                        Modifier
                      </button>
                      <DeleteButton busy={busy} label={a.title} onConfirm={() => void run(() => call("delete_announcement", { p_id: a.id }), "Annonce supprimée.")} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
