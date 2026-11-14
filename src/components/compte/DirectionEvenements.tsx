/**
 * L'onglet Événements de la Direction : publier un événement ou une série, voir qui vient.
 * Le formulaire et la liste côte à côte ; une ligne serrée par événement, la date d'abord, un trait et un mot en couleur
 * pour ce qui est proche, le nombre de « Je viens » en pastille et les noms à la demande. Les règles (mots, couleurs,
 * écriture de la date, réponses lues ou non) sont dans `src/lib/compte/direction-evenements.ts` ; le dessin dans
 * `global.css`, section « Direction, onglet Événements ».
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { basculer, garderPresents, jourEtHeure, presence, proximite, viennentLabel } from "../../lib/compte/direction-evenements";
import { safeUrl, toLocalInput } from "../../lib/compte/news";
import { fmtInt } from "../../lib/format";
import { Problem, focusField, useNow, useRun } from "./common";
import { Pastille } from "./direction-kit";
import type { EventRow } from "./direction-overview";
import { PartieTete } from "./Onglets";

// `repeat` et `weeks` : seulement pour un nouvel événement. Une série crée un événement par semaine, chacun modifiable seul.
export const EMPTY_EVENT = { id: null as number | null, title: "", description: "", url: "", start: "", repeat: false, weeks: "4" };
export type EventDraft = typeof EMPTY_EVENT;
const SERIES_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Après une action, le bouton cliqué a pu disparaître (ligne supprimée) ou être désactivé le temps de l'envoi : le focus
 * est alors retombé sur la page, ou sur la partie qui l'entoure (un second clic sur le bouton désactivé). Il revient à
 * `id`, une fois la liste redessinée. Un champ où l'on écrit garde le sien.
 */
const rendreFocus = (id: string) =>
  window.setTimeout(() => {
    const actif = document.activeElement;
    const onglet = document.querySelector('[data-testid="direction-events"]');
    if (actif?.isConnected && onglet && !actif.contains(onglet)) return;
    document.getElementById(id)?.focus();
  }, 0);

/**
 * « Supprimer » demande une confirmation, sur le même bouton. Il est sur presque chaque ligne : il reste gris et ne passe
 * au rouge que sous la souris, au clavier, ou une fois armé (`global.css`). Armé, il se désarme par Échap, par Tab vers un
 * autre élément ou par un clic ailleurs : Safari ne donne pas le focus au bouton cliqué, et une perte de focus sans
 * destination (`relatedTarget` nul) ne compte pas, comme partout sur cette page. Le second clic d'un double clic ne
 * confirme pas : il faut un clic à part, ou Entrée.
 */
function Supprimer({ id, busy, label, onConfirm }: { id: string; busy: boolean; label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const self = useRef<HTMLButtonElement>(null);
  // Sans focus sur le bouton (Safari), Échap et le clic ailleurs s'écoutent sur toute la page, dès que le bouton est armé.
  useLayoutEffect(() => {
    if (!armed) return;
    const ailleurs = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !self.current?.contains(e.target)) setArmed(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    document.addEventListener("pointerdown", ailleurs, true);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", ailleurs, true);
      document.removeEventListener("keydown", echap);
    };
  }, [armed]);
  return (
    <button
      ref={self}
      id={id}
      type="button"
      class="dir-bouton evt-supprimer"
      data-armed={armed ? "" : undefined}
      disabled={busy}
      aria-label={armed ? `Confirmer la suppression de « ${label} »` : `Supprimer « ${label} »`}
      onClick={(e) => {
        if (!armed) setArmed(true);
        else if (e.detail < 2) {
          setArmed(false);
          onConfirm();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setArmed(false);
      }}
      onBlur={(e) => {
        if (e.relatedTarget) setArmed(false);
      }}
    >
      {armed ? "Confirmer la suppression" : "Supprimer"}
    </button>
  );
}

export default function DirectionEvenements({ rows, attendance, reload, form, setForm }: { rows: EventRow[]; attendance: Map<number, string[]> | null | undefined; reload: () => Promise<void>; form: EventDraft; setForm: (draft: EventDraft) => void }) {
  const empty = EMPTY_EVENT;
  const { busy, error, done, run } = useRun(reload);
  // L'heure, relue chaque minute : « Aujourd'hui », « Demain », « Dans N jours » et « Commencé » changent seuls à minuit
  // et à l'heure de début, sur une page laissée ouverte.
  const now = useNow();
  // Les événements dont la liste des noms est dépliée. Un événement supprimé, ou qui n'est plus donné, en sort.
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    setOpen((ouverts) => garderPresents(ouverts, rows.map((ev) => ev.id)));
  }, [rows]);
  // Une seule demande à la fois : un double clic, ou Entrée tapée deux fois avant que le bouton se désactive, n'envoie rien
  // de plus. `null` : refusé sans rien envoyer.
  const enCours = useRef(false);
  const une = async (action: () => Promise<boolean>): Promise<boolean | null> => {
    if (enCours.current) return null;
    enCours.current = true;
    try {
      return await action();
    } finally {
      enCours.current = false;
    }
  };

  const save = async () => {
    const start = form.start ? new Date(form.start).toISOString() : null;
    const series = form.id === null && form.repeat;
    const ok = await une(() =>
      series
        ? run(
            () => call("save_event_series", { p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start, p_weeks: Number(form.weeks) }),
            `${form.weeks} événements publiés, un par semaine. L'accueil ne montre que le prochain.`,
          )
        : run(
            () => call("save_event", { p_id: form.id, p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start }),
            form.id ? "Événement modifié." : "Événement publié : il est visible sur l'accueil.",
          ),
    );
    if (ok === null) return;
    if (ok) setForm(empty);
    rendreFocus(ok ? "evt-fait" : "evt-envoyer");
  };

  const supprimer = async (ev: EventRow) => {
    const ok = await une(() => run(() => call("delete_event", { p_id: ev.id }), "Événement supprimé."));
    if (ok === null) return;
    // L'événement en cours de modification n'existe plus : le formulaire redevient vide.
    if (ok && form.id === ev.id) setForm(empty);
    rendreFocus(ok ? "evt-fait" : `evt-supprimer-${ev.id}`);
  };

  return (
    <section class="dir-evenements" aria-labelledby="evt-title" data-testid="direction-events">
      <PartieTete id="evt-title" title="Événements">
        <p>Visibles aussitôt sur l'accueil.</p>
      </PartieTete>
      <div class="evt-plan">
        <form
          class="card evt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 class="text-lg">{form.id ? "Modifier l'événement" : "Nouvel événement"}</h3>
          <div>
            <label for="evt-t" class="text-sm font-semibold">
              Nom de l'événement
            </label>
            <input id="evt-t" class="field dir-champ mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-s" class="text-sm font-semibold">
              Date et heure
            </label>
            <input id="evt-s" class="field dir-champ mt-1" type="datetime-local" required value={form.start} onInput={(e) => setForm({ ...form, start: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-d" class="text-sm font-semibold">
              Description (facultative)
            </label>
            <textarea id="evt-d" class="field dir-champ mt-1" rows={2} maxLength={2000} value={form.description} onInput={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="evt-u" class="field dir-champ mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          {form.id === null && (
            <div class="evt-serie">
              <label class="flex min-h-11 items-center gap-3 font-semibold">
                <input type="checkbox" class="size-5" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.currentTarget.checked })} />
                Répéter chaque semaine
              </label>
              {form.repeat && (
                <div class="evt-semaines">
                  <label for="evt-w" class="text-sm font-semibold">
                    Pendant
                  </label>
                  <select id="evt-w" class="field dir-champ !w-auto" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.currentTarget.value })}>
                    {SERIES_WEEKS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n} semaines
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div class="flex flex-wrap gap-3">
            <button id="evt-envoyer" type="submit" class="btn btn-primary" disabled={busy}>
              {form.id ? "Enregistrer" : form.repeat ? `Publier ${form.weeks} événements` : "Publier l'événement"}
            </button>
            {form.id && (
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  const id = form.id;
                  setForm(empty);
                  // Le bouton disparaît : le focus revient au « Modifier » de la ligne quittée.
                  window.setTimeout(() => (document.getElementById(`evt-modifier-${id}`) ?? document.getElementById("evt-t"))?.focus(), 0);
                }}
              >
                Annuler
              </button>
            )}
          </div>
          <Problem message={error} />
          {/* La zone existe avant de changer : un lecteur d'écran annonce ce qui s'y écrit. Après une suppression, le focus
              y vient (la ligne a disparu). */}
          <p id="evt-fait" class="form-success evt-fait" role="status" tabIndex={-1} data-testid="direction-event-done">
            {done}
          </p>
        </form>
        {rows.length > 0 && (
          <div class="evt-liste">
            <div class="evt-tete">
              <h3 class="text-lg">À venir</h3>
              <span class="dir-nombre" data-testid="direction-event-count">
                {fmtInt(rows.length)}
              </span>
              {attendance === null && (
                <p class="evt-panne" data-testid="direction-event-unread">
                  <Pastille ton="warn">Réponses « Je viens » non lues</Pastille>
                  <span>Rechargez la page.</span>
                </p>
              )}
            </div>
            <ul class="dir-liste">
              {rows.map((ev) => {
                const lu = presence(attendance, ev.id);
                // `null` : pas lu, ou lecture en panne. La ligne ne dit alors rien, et surtout pas « Personne ».
                const names = lu.etat === "lu" ? lu.noms : null;
                const near = proximite(ev.starts_at, now);
                const { jour, heure } = jourEtHeure(ev.starts_at, now);
                const url = safeUrl(ev.url);
                const shown = open.has(ev.id) && names !== null && names.length > 0;
                const editing = form.id === ev.id;
                return (
                  <li key={ev.id} class="dir-ligne evt-ligne" data-dir-ton={near?.ton} data-editing={editing ? "" : undefined} data-testid="direction-event">
                    <p class="evt-quand">
                      <span class="evt-jour">{jour}</span>
                      <span class="evt-heure tnum">{heure}</span>
                      {near && (
                        <Pastille ton={near.ton} plain testid="direction-event-near">
                          {near.mot}
                        </Pastille>
                      )}
                    </p>
                    <div class="evt-quoi">
                      <p class="evt-nom">{ev.title}</p>
                      <p class="evt-suite">
                        {names !== null &&
                          (names.length > 0 ? (
                            <button
                              type="button"
                              class="dir-pastille evt-viennent"
                              data-dir-ton="ok"
                              aria-expanded={shown}
                              aria-controls={`evt-noms-${ev.id}`}
                              aria-label={`${viennentLabel(names.length)} à « ${ev.title} » : ${shown ? "masquer" : "voir"} les noms`}
                              data-testid="direction-event-going"
                              onClick={() => setOpen((ouverts) => basculer(ouverts, ev.id))}
                            >
                              {viennentLabel(names.length)}
                            </button>
                          ) : (
                            <Pastille ton="muted" plain testid="direction-event-nobody">
                              {viennentLabel(0)}
                            </Pastille>
                          ))}
                        {ev.author && <span class="evt-auteur">par {ev.author}</span>}
                        {url && (
                          <a class="evt-lien" href={url} rel="noopener noreferrer" aria-label={`Lien de « ${ev.title} »`}>
                            Lien
                          </a>
                        )}
                      </p>
                    </div>
                    {ev.editable && (
                      <div class="evt-actions">
                        <button
                          id={`evt-modifier-${ev.id}`}
                          type="button"
                          class="dir-bouton evt-modifier"
                          disabled={busy}
                          aria-label={editing ? `Modifier « ${ev.title} », en cours dans le formulaire` : `Modifier « ${ev.title} »`}
                          onClick={() => {
                            // Déjà dans le formulaire : on y retourne, sans effacer ce qui a été changé.
                            if (!editing) setForm({ ...EMPTY_EVENT, id: ev.id, title: ev.title, description: ev.description ?? "", url: ev.url ?? "", start: toLocalInput(ev.starts_at) });
                            focusField("evt-t");
                          }}
                        >
                          Modifier
                        </button>
                        <Supprimer id={`evt-supprimer-${ev.id}`} busy={busy} label={ev.title} onConfirm={() => void supprimer(ev)} />
                      </div>
                    )}
                    {/* Le cadre existe toujours : le bouton le désigne (`aria-controls`) même replié. */}
                    <p class="evt-noms" id={`evt-noms-${ev.id}`} hidden={!shown} data-testid="direction-event-names">
                      {shown && names.join(", ")}
                    </p>
                  </li>
                );
              })}
            </ul>
            <details class="fold evt-aide">
              <summary class="font-semibold">Comment lire cette liste</summary>
              <div class="grid gap-3 pb-1 text-muted">
                <p>Jaune : aujourd'hui. Bleu : demain. Gris : dans la semaine, ou déjà commencé. Vert : des membres ont répondu « Je viens » ; un clic montre leurs noms.</p>
                <p>Les dates et les heures sont celles de Paris. Une série crée un événement par semaine : chacun se modifie ou se supprime seul.</p>
                <p>« Modifier » et « Supprimer » n'apparaissent que sur vos événements, ou sur tous pour les admins et le fondateur. Le serveur revérifie chaque changement.</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
