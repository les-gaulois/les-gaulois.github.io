/**
 * L'onglet Annonces de la Direction : publier, modifier, supprimer les annonces de l'accueil.
 * Le formulaire et la liste côte à côte, une ligne courte par annonce, son état en couleur avec son mot (règles dans
 * `src/lib/compte/direction-annonces.ts`), l'aide repliée. Dessin : `global.css`, « Direction, onglet Annonces ».
 */
import { useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, ANNOUNCEMENT_URL_MAX, HOME_ANNOUNCEMENTS, LISTED_ANNOUNCEMENTS, announcementCount, announcementExcerpt, announcementLink, announcementState, announcementsCapped, fieldCount } from "../../lib/compte/direction-annonces";
import { fmtDate } from "../../lib/format";
import { Problem, Success, focusField, useRun } from "./common";
import { Pastille } from "./direction-kit";
import type { AnnouncementRow } from "./direction-overview";
import { PartieTete } from "./Onglets";

export const EMPTY_ANNOUNCEMENT = { id: null as number | null, title: "", body: "", url: "" };
export type AnnouncementDraft = typeof EMPTY_ANNOUNCEMENT;

/** Le libellé d'un champ limité et son compteur, discret, qui passe au jaune près de la limite. */
function Libelle({ id, label, value, max }: { id: string; label: string; value: string; max: number }) {
  const count = fieldCount(value, max);
  return (
    <div class="dir-annonces-libelle">
      <label for={id}>{label}</label>
      <span id={`${id}-n`} class="dir-annonces-compte tnum" data-near={count.near || undefined}>
        {count.text}
      </span>
    </div>
  );
}

/** Une suppression ne part qu'au second clic : le texte, lui, ne se récupère pas. Gris, rouge au survol et une fois armé. */
function Supprimer({ busy, label, onConfirm }: { busy: boolean; label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="dir-bouton"
      data-dir-ton="danger"
      data-arme={armed || undefined}
      disabled={busy}
      aria-label={armed ? `Confirmer la suppression de « ${label} »` : `Supprimer « ${label} »`}
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirmer" : "Supprimer"}
    </button>
  );
}

export default function DirectionAnnonces({ rows, reload, form, setForm }: { rows: AnnouncementRow[]; reload: () => Promise<void>; form: AnnouncementDraft; setForm: (draft: AnnouncementDraft) => void }) {
  const empty = EMPTY_ANNOUNCEMENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const ok = await run(() => call("save_announcement", { p_id: form.id, p_title: form.title, p_body: form.body, p_url: form.url || null }), form.id ? "Annonce modifiée." : "Annonce publiée : elle est visible sur l'accueil.");
    if (ok) setForm(empty);
  };

  const remove = async (row: AnnouncementRow) => {
    const ok = await run(() => call("delete_announcement", { p_id: row.id }), "Annonce supprimée.");
    // L'annonce ouverte dans le formulaire n'existe plus : le brouillon repart de zéro.
    if (ok && form.id === row.id) setForm(empty);
  };

  return (
    <section class="dir-annonces" aria-labelledby="ann-title" data-testid="direction-announcements">
      <PartieTete id="ann-title" title="Annonces" />
      <div class="dir-annonces-grille">
        <form
          class="card dir-annonces-form"
          data-dir-ton={form.id ? "warn" : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div class="dir-annonces-tete">
            <h3 class="text-lg">{form.id ? "Modifier l'annonce" : "Nouvelle annonce"}</h3>
            {form.id && <Pastille ton="warn">En modification</Pastille>}
          </div>
          <div>
            <Libelle id="ann-t" label="Titre" value={form.title} max={ANNOUNCEMENT_TITLE_MAX} />
            <input id="ann-t" class="field" required maxLength={ANNOUNCEMENT_TITLE_MAX} aria-describedby="ann-t-n" value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <Libelle id="ann-b" label="Texte" value={form.body} max={ANNOUNCEMENT_BODY_MAX} />
            <textarea id="ann-b" class="field" required rows={5} maxLength={ANNOUNCEMENT_BODY_MAX} aria-describedby="ann-b-n" value={form.body} onInput={(e) => setForm({ ...form, body: e.currentTarget.value })} />
          </div>
          <div>
            <div class="dir-annonces-libelle">
              <label for="ann-u">Lien en https</label>
              <span class="dir-annonces-compte">facultatif</span>
            </div>
            <input id="ann-u" class="field" type="url" maxLength={ANNOUNCEMENT_URL_MAX} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          <div class="dir-annonces-envoi">
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
          <Success message={done} />
        </form>
        {rows.length > 0 && (
          <div class="dir-annonces-publiees">
            <div class="dir-annonces-tete">
              <h3 class="text-lg">Publiées depuis le site</h3>
              <span class="dir-annonces-total tnum" data-testid="direction-announcements-count">
                {announcementCount(rows.length)}
              </span>
            </div>
            <ul class="dir-liste">
              {rows.map((a, index) => {
                const state = announcementState(index, a.id, form.id);
                const link = announcementLink(a.url);
                return (
                  <li key={a.id} class="dir-ligne dir-annonces-ligne" data-dir-ton={state.ton} data-fige={a.editable ? undefined : ""} aria-current={state.editing ? "true" : undefined} data-testid="direction-announcement">
                    <div class="dir-annonces-texte">
                      <p class="dir-annonces-titre">{a.title}</p>
                      <p class="dir-annonces-meta">
                        <span class="tnum">{fmtDate(a.created_at)}</span>
                        {a.author && <span class="dir-annonces-auteur">{a.author}</span>}
                        {link && (
                          <a class="dir-annonces-lien" href={link.href} rel="noopener" aria-label={`Lien de « ${a.title} » : ${link.host}`}>
                            {link.host}
                          </a>
                        )}
                        <span class="dir-annonces-extrait">{announcementExcerpt(a.body)}</span>
                      </p>
                    </div>
                    <span class="dir-annonces-etat">
                      <Pastille ton={state.ton} plain testid="direction-announcement-state">
                        {state.label}
                      </Pastille>
                    </span>
                    <div class="dir-annonces-actions">
                      {a.editable ? (
                        <>
                          <button
                            type="button"
                            class="dir-bouton"
                            disabled={busy}
                            aria-label={`Modifier « ${a.title} »`}
                            onClick={() => {
                              setForm({ id: a.id, title: a.title, body: a.body, url: a.url ?? "" });
                              focusField("ann-t");
                            }}
                          >
                            Modifier
                          </button>
                          <Supprimer busy={busy} label={a.title} onConfirm={() => void remove(a)} />
                        </>
                      ) : (
                        <span class="dir-annonces-fige">Lecture seule</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {announcementsCapped(rows.length) && <p class="dir-note">Seules les {LISTED_ANNOUNCEMENTS} dernières annonces sont listées.</p>}
          </div>
        )}
      </div>
      <details class="fold dir-annonces-aide">
        <summary class="font-semibold">Comment lire cet onglet</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Une annonce est visible aussitôt sur l'accueil. Le nom de l'auteur n'est pas public.</p>
          <p>
            Vert : parmi les {HOME_ANNOUNCEMENTS} dernières, celles que l'accueil affiche. Gris : plus ancienne, l'accueil ne la montre plus. Jaune : ouverte dans le formulaire.
          </p>
          <p>Lecture seule : un officier ne modifie et ne supprime que ses propres annonces ; un admin ou le fondateur, toutes. Le serveur revérifie chaque changement.</p>
          <p>Une suppression part au second clic : le texte ne se récupère pas.</p>
        </div>
      </details>
    </section>
  );
}
