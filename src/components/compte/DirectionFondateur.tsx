/**
 * L'onglet Fondateur de la Direction, que seul le fondateur voit. Refait le 14 novembre 2026 « comme pour la section
 * compte » : le choix du membre est une liste serrée avec recherche à chaque lettre et filtres par rôle, à côté de ce qui va
 * se passer et de la confirmation. Les règles sont dans `src/lib/compte/direction-fondateur.ts`, le dessin dans `global.css`,
 * section « Direction, onglet Fondateur ».
 *
 * Une fois le rôle transmis, l'écran le dit et attend : relire le compte (`onDone`) retire aussitôt l'onglet, que seul le
 * fondateur voit, et la réussite ne se lirait jamais. « Revenir à la Direction » relit le compte quand on l'a lue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { listMayBeCut, matchesSearch, MEMBERS_LIMIT } from "../../lib/compte/admin-members";
import { call } from "../../lib/compte/api";
import {
  currentFounder,
  HEIR_FILTERS,
  heirCountLabel,
  heirCounts,
  heirs,
  homonymTags,
  inHeirFilter,
  ROLE_AFTER_TRANSFER,
  transferDoneMessage,
  typedState,
  type HeirFilter,
  type TypedState,
} from "../../lib/compte/direction-fondateur";
import { ROLE_LABELS, type MemberRow, type Role } from "../../lib/compte/types";
import { focusField, Loading, messageOf, Problem, type Loadable } from "./common";
import { Pastille, type DirTon } from "./direction-kit";
import { PartieTete } from "./Onglets";

/** Le rôle en étiquette, comme dans l'onglet Comptes : le fondateur en plein, l'admin et l'officier encadrés, le membre discret. */
function Etiquette({ role }: { role: Role }) {
  return (
    <span class="dir-fondateur-role" data-role={role}>
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Ce que dit la pastille à côté du nom retapé. Rien tant que le champ est vide. */
const TYPED_HINTS: Record<Exclude<TypedState, "empty">, { ton: DirTon; mot: string }> = {
  start: { ton: "muted", mot: "Continuez" },
  other: { ton: "warn", mot: "Ce n'est pas ce nom" },
  exact: { ton: "ok", mot: "Nom exact" },
};

/** Le fondateur transmet son rôle. Il faut retaper le nom : on ne revient pas seul en arrière. */
export default function DirectionFondateur({ onDone }: { onDone: () => Promise<void> }) {
  const [members, setMembers] = useState<Loadable<MemberRow[]>>({
    status: "loading",
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HeirFilter>("all");
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La phrase de réussite : le rôle est transmis, plus rien à l'écran ne relance la transmission.
  const [done, setDone] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Posé dès le premier clic, avant que l'écran ne se redessine : un double clic n'envoie qu'une demande.
  const sending = useRef(false);
  const backing = useRef(false);
  // Chaque lecture a son numéro : une réponse dépassée par une lecture plus récente est écartée.
  const reads = useRef(0);
  const alive = useRef(true);
  const root = useRef<HTMLElement>(null);
  const annonce = useRef<HTMLDivElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const load = useCallback(() => {
    const mine = ++reads.current;
    setMembers({ status: "loading" });
    call<{ rows: MemberRow[] }>("list_members", { p_limit: MEMBERS_LIMIT })
      .then((data) => {
        if (mine === reads.current) setMembers({ status: "ready", data: data.rows });
      })
      .catch((e: unknown) => {
        if (mine === reads.current) setMembers({ status: "error", message: messageOf(e) });
      });
  }, []);
  useEffect(load, [load]);

  // « Réessayer » disparaît pendant la lecture : la liste relue, le focus va à la recherche, ou de nouveau à « Réessayer ».
  const retried = useRef(false);
  const retry = () => {
    retried.current = true;
    load();
  };
  useEffect(() => {
    if (!retried.current || members.status === "loading") return;
    retried.current = false;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    const next = members.status === "ready" ? document.getElementById("heir") : root.current?.querySelector<HTMLElement>('[role="alert"] button');
    next?.focus();
  }, [members.status]);

  const rows = members.status === "ready" ? members.data : null;
  const candidates = useMemo(() => (rows ? heirs(rows) : []), [rows]);
  const counts = useMemo(() => heirCounts(candidates), [candidates]);
  const tags = useMemo(() => homonymTags(candidates), [candidates]);
  const visible = candidates.filter((m) => inHeirFilter(m, filter) && matchesSearch(m, query));
  const chosen = candidates.find((m) => m.user_id === target);
  const chosenTag = chosen ? (tags.get(chosen.user_id) ?? null) : null;
  const founder = rows ? currentFounder(rows) : null;
  const state = chosen ? typedState(typed, chosen.name) : "empty";
  const armed = chosen !== undefined && state === "exact";
  const hint = state === "empty" ? null : TYPED_HINTS[state];

  // La réussite remplace le formulaire : le focus, resté sur le bouton retiré, va sur la phrase qui l'annonce.
  useEffect(() => {
    if (done) annonce.current?.focus();
  }, [done]);

  // Un refus : le bouton, désactivé pendant l'envoi, a perdu le focus ; il le reprend, pour qu'on ne reparte pas du haut de la page.
  useEffect(() => {
    if (error && (document.activeElement === null || document.activeElement === document.body)) submit.current?.focus();
  }, [error]);

  const send = async () => {
    if (sending.current || !chosen || !armed) return;
    sending.current = true;
    const heir = chosen;
    const tag = chosenTag;
    setBusy(true);
    setError(null);
    try {
      await call("transfer_founder", { p_user: heir.user_id });
      setDone(transferDoneMessage(heir.name, tag));
      // `sending` reste posé : le rôle est transmis, rien ne repart.
    } catch (e) {
      sending.current = false;
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    if (backing.current) return;
    backing.current = true;
    const section = root.current;
    const panels = section?.closest('[role="tabpanel"]')?.parentElement ?? null;
    setLeaving(true);
    try {
      await onDone();
    } finally {
      backing.current = false;
      if (alive.current) setLeaving(false);
    }
    // Le compte relu, l'onglet du fondateur disparaît avec ce bouton : le focus va à la partie qui s'affiche à sa place.
    if (section && !section.isConnected) {
      requestAnimationFrame(() => {
        if (document.activeElement !== null && document.activeElement !== document.body) return;
        panels?.querySelector<HTMLElement>(':scope > [role="tabpanel"]:not([hidden])')?.focus();
      });
    }
  };

  return (
    <section ref={root} class="dir-fondateur" aria-labelledby="founder-title" data-testid="direction-founder">
      <PartieTete id="founder-title" title="Transmettre le rôle de fondateur" />
      {/* La zone de la réussite existe avant, vide : un lecteur d'écran lit ce qui y paraît. */}
      <div ref={annonce} class={done ? "card dir-fondateur-fait" : "dir-fondateur-fait"} role="status" tabIndex={-1} data-testid="founder-done">
        {done && (
          <>
            <Pastille ton="ok">Fait</Pastille> <span>{done}</span>
          </>
        )}
      </div>
      {done ? (
        <div class="dir-fondateur-retour">
          <button type="button" class="btn btn-ghost" disabled={leaving} onClick={() => void back()} data-testid="founder-back">
            Revenir à la Direction
          </button>
        </div>
      ) : members.status === "loading" ? (
        <div class="mt-4">
          <Loading />
        </div>
      ) : members.status === "error" ? (
        <Problem message={members.message} onRetry={retry} />
      ) : candidates.length === 0 ? (
        <p class="dir-note" data-testid="founder-empty">
          Le rôle ne se transmet qu'à un membre validé, et il n'y en a pas d'autre que vous.
        </p>
      ) : (
        <form
          class="dir-fondateur-plan"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <fieldset class="dir-fondateur-choix">
            <legend class="dir-fondateur-etape">1. Choisir le nouveau fondateur</legend>
            <div class="dir-fondateur-outils">
              <div class="dir-recherche">
                <label for="heir" class="sr-only">
                  Chercher un membre
                </label>
                <input
                  id="heir"
                  type="search"
                  class="field dir-champ"
                  placeholder="Chercher un nom"
                  autocomplete="off"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  // Entrée dans la recherche n'envoie pas le formulaire.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  data-testid="founder-search"
                />
              </div>
              <div class="dir-filtres" role="group" aria-label="Filtrer par rôle">
                {HEIR_FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
                  <button key={f.id} type="button" class="dir-filtre" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} data-testid="founder-filter">
                    {f.label} <span class="dir-nombre tnum">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Un groupe de boutons radio : Tab y entre une fois, les flèches changent le choix, Espace le coche. */}
            <div
              class="dir-fondateur-liste"
              role={visible.length > 0 ? "radiogroup" : undefined}
              aria-label={visible.length > 0 ? "Nouveau fondateur" : undefined}
              data-testid="founder-list"
            >
              {visible.map((m) => {
                const tag = tags.get(m.user_id);
                return (
                  <label key={m.user_id} class="dir-fondateur-ligne" data-choisi={m.user_id === target ? "" : undefined} data-testid="founder-row">
                    <input
                      type="radio"
                      name="heir"
                      class="dir-fondateur-radio"
                      value={m.user_id}
                      checked={m.user_id === target}
                      onChange={() => {
                        setTarget(m.user_id);
                        setTyped("");
                      }}
                      // Entrée sur un nom de la liste n'envoie pas le formulaire : la transmission ne part que de l'étape 2.
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    <span class="dir-fondateur-nom">{m.name}</span>
                    {m.discord_name && (
                      <span class="dir-fondateur-discord">
                        <span class="sr-only">Discord : </span>
                        {m.discord_name}
                      </span>
                    )}
                    {/* Deux membres du même nom sans nom Discord qui les sépare : leur numéro de Gaulois. */}
                    {tag !== undefined && tag !== m.discord_name && <span class="dir-fondateur-discord">{tag}</span>}
                    <span class="dir-fondateur-fin">
                      {m.user_id === target && (
                        <Pastille ton="ally" plain>
                          Choisi
                        </Pastille>
                      )}
                      <Etiquette role={m.role} />
                    </span>
                  </label>
                );
              })}
              {visible.length === 0 && (
                <p class="dir-fondateur-rien">
                  Aucun membre validé ne correspond.{" "}
                  <button
                    type="button"
                    class="dir-bouton"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                      // Le bouton disparaît avec le message : le focus revient à la recherche.
                      focusField("heir");
                    }}
                  >
                    Tout afficher
                  </button>
                </p>
              )}
            </div>
            <p class="dir-note" role="status" data-testid="founder-count">
              {heirCountLabel(visible.length, candidates.length)}
              {listMayBeCut(rows?.length ?? 0, "") && ` · seuls les ${MEMBERS_LIMIT} premiers comptes sont lus`}
            </p>
          </fieldset>

          <div class="card dir-fondateur-acte" role="group" aria-labelledby="founder-step2" data-testid="founder-confirm">
            <p id="founder-step2" class="dir-fondateur-etape">
              2. Confirmer
            </p>
            <p class="dir-fondateur-alerte">
              <Pastille ton="danger">Sans retour</Pastille>
              <span>Seul le nouveau fondateur pourra vous rendre ce rôle.</span>
            </p>
            <dl class="dir-fondateur-suite" data-testid="founder-outcome">
              <div>
                <dt class={chosen ? "dir-fondateur-nom" : "text-muted"}>
                  {chosen ? chosen.name : "Le membre choisi"}
                  {chosenTag && <span class="dir-fondateur-discord"> ({chosenTag})</span>}
                </dt>
                <dd>
                  {chosen && <Etiquette role={chosen.role} />}
                  <span class="text-muted">devient</span>
                  <Etiquette role="founder" />
                </dd>
              </div>
              <div>
                <dt class="dir-fondateur-nom">
                  {founder ? founder.name : "Vous"}
                  {founder && <span class="dir-fondateur-vous"> (vous)</span>}
                </dt>
                <dd>
                  <Etiquette role="founder" />
                  <span class="text-muted">devient</span>
                  <Etiquette role={ROLE_AFTER_TRANSFER} />
                </dd>
              </div>
            </dl>
            <div class="dir-fondateur-saisie">
              <label for="heir-confirm" class="font-semibold">
                {chosen ? `Retapez « ${chosen.name} » pour confirmer` : "Retapez son nom pour confirmer"}
              </label>
              <input
                id="heir-confirm"
                class="field"
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                disabled={!chosen}
                value={typed}
                onInput={(e) => setTyped(e.currentTarget.value)}
                aria-describedby="heir-confirm-etat"
              />
              <p id="heir-confirm-etat" class="dir-fondateur-etat" role="status" data-testid="founder-typed">
                {hint && <Pastille ton={hint.ton}>{hint.mot}</Pastille>}
              </p>
            </div>
            <button ref={submit} type="submit" class="btn dir-fondateur-envoi" data-arme={armed ? "" : undefined} disabled={busy || !armed} data-testid="founder-submit">
              Transmettre le rôle
            </button>
            <Problem message={error} />
          </div>
        </form>
      )}
      <details class="fold mt-4">
        <summary class="font-semibold">Comment se passe la transmission</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Seuls les membres validés sont proposés. Le serveur revérifie le choix, puis écrit le changement dans le journal.</p>
          <p>Le nom se retape tel qu'il est écrit : les majuscules et les accents comptent.</p>
        </div>
      </details>
    </section>
  );
}
