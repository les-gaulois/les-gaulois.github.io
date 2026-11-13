/**
 * La gestion de l'alliance, pour l'encadrement de GAL : créer les alliances, y glisser les clans de la carte, inviter les
 * joueurs des clans alliés et leur retirer l'accès. Le serveur revérifie chaque droit : cette partie n'est qu'affichée.
 */
import { useState } from "preact/hooks";
import { COULEURS_ALLIANCE, couleurLibre } from "../../../lib/alliance/couleurs";
import { lienInvitation } from "../../../lib/alliance/invitation";
import { call, basePath } from "../../../lib/compte/api";
import { fmtDateTime, fmtInt } from "../../../lib/format";
import { DeleteButton, Problem, Success, messageOf } from "../../compte/common";
import { Pastille, type Contexte } from "./commun";

/** Une action du serveur, puis la relecture de la carte. */
function useAction(relire: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const run = async <T,>(fn: string, args: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErreur(null);
    try {
      const r = await call<T>(fn, args);
      await relire();
      return r;
    } catch (e) {
      setErreur(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, erreur, run };
}

/** Un retrait ne part qu'au second clic, sur un bouton qui dit ce qu'il fait. */
function EnDeuxTemps({ busy, texte, confirmer, nom, onConfirm }: { busy: boolean; texte: string; confirmer: string; nom: string; onConfirm: () => void }) {
  const [arme, setArme] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
      disabled={busy}
      aria-label={arme ? `${confirmer} : ${nom}` : `${texte} : ${nom}`}
      onClick={() => {
        if (arme) onConfirm();
        else setArme(true);
      }}
      onBlur={() => setArme(false)}
    >
      {arme ? confirmer : texte}
    </button>
  );
}

function ChoixCouleur({ id, valeur, onChange }: { id: string; valeur: number; onChange: (v: number) => void }) {
  return (
    <select id={id} class="field mt-1" value={String(valeur)} onChange={(e) => onChange(Number(e.currentTarget.value))}>
      {COULEURS_ALLIANCE.map((c) => (
        <option value={String(c.valeur)}>{c.nom}</option>
      ))}
      {!COULEURS_ALLIANCE.some((c) => c.valeur === valeur) && <option value={String(valeur)}>Couleur actuelle</option>}
    </select>
  );
}

function Alliances({ ctx }: { ctx: Contexte }) {
  const alliances = ctx.donnees.alliances ?? [];
  const { busy, erreur, run } = useAction(ctx.relire);
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(() => couleurLibre(alliances.map((a) => a.color)));
  const [edite, setEdite] = useState<{ id: number; nom: string; couleur: number } | null>(null);

  return (
    <section class="carte-bloc" aria-labelledby="gestion-alliances">
      <h3 id="gestion-alliances">Les alliances</h3>
      <ul class="alliance-gestion-liste">
        {alliances.map((a) =>
          edite?.id === a.id ? (
            <li>
              <form
                class="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("save_alliance", { p_id: a.id, p_name: edite.nom, p_color: edite.couleur }).then((r) => r && setEdite(null));
                }}
              >
                <label for={`alliance-nom-${a.id}`} class="text-sm font-semibold">
                  Nom
                </label>
                <input id={`alliance-nom-${a.id}`} class="field" required minLength={2} maxLength={40} value={edite.nom} onInput={(e) => setEdite({ ...edite, nom: e.currentTarget.value })} />
                <label for={`alliance-couleur-${a.id}`} class="text-sm font-semibold">
                  Couleur sur la carte
                </label>
                <ChoixCouleur id={`alliance-couleur-${a.id}`} valeur={edite.couleur} onChange={(v) => setEdite({ ...edite, couleur: v })} />
                <div class="alliance-ligne">
                  <button type="submit" class="btn btn-primary" disabled={busy}>
                    Enregistrer
                  </button>
                  <button type="button" class="btn btn-ghost" onClick={() => setEdite(null)}>
                    Annuler
                  </button>
                </div>
                {/* Supprimer est à part, sous un filet : l'alliance et le rangement de ses clans ne se récupèrent pas. */}
                <div class="alliance-a-part">
                  <p class="carte-aide">
                    Supprimer l'alliance sort ses clans de toute alliance.{a.id === ctx.donnees.ours ? " C'est la nôtre : les joueurs alliés ne verront plus la carte de l'alliance tant que GAL n'est pas rangé dans une autre." : ""}
                  </p>
                  <DeleteButton busy={busy} label={a.name} onConfirm={() => void run("delete_alliance", { p_id: a.id }).then((r) => r && setEdite(null))} />
                </div>
              </form>
            </li>
          ) : (
            <li class="alliance-ligne">
              <span>
                <Pastille couleur={a.color} />
                <strong>{a.name}</strong> · {a.clans.length} clan{a.clans.length > 1 ? "s" : ""}
              </span>
              <button type="button" class="btn btn-ghost" onClick={() => setEdite({ id: a.id, nom: a.name, couleur: a.color })}>
                Modifier
              </button>
            </li>
          ),
        )}
      </ul>
      <form
        class="mt-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("save_alliance", { p_id: null, p_name: nom, p_color: couleur }).then((r) => {
            if (!r) return;
            setNom("");
            setCouleur(couleurLibre([...alliances.map((a) => a.color), couleur]));
          });
        }}
      >
        <label for="alliance-nouvelle" class="text-sm font-semibold">
          Nouvelle alliance
        </label>
        <input id="alliance-nouvelle" class="field" required minLength={2} maxLength={40} placeholder="Nom de l'alliance" value={nom} onInput={(e) => setNom(e.currentTarget.value)} />
        <label for="alliance-nouvelle-couleur" class="text-sm font-semibold">
          Couleur sur la carte
        </label>
        <ChoixCouleur id="alliance-nouvelle-couleur" valeur={couleur} onChange={setCouleur} />
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy || nom.trim().length < 2}>
            Créer l'alliance
          </button>
        </div>
      </form>
      <Problem message={erreur} />
    </section>
  );
}

/** Glisser un clan d'une case à l'autre, ou le ranger au clavier avec la liste de sa case. */
function Rangement({ ctx }: { ctx: Contexte }) {
  const alliances = ctx.donnees.alliances ?? [];
  const { busy, erreur, run } = useAction(ctx.relire);
  const [survolee, setSurvolee] = useState<number | "aucune" | null>(null);
  const range = new Map<string, number>();
  for (const a of alliances) for (const tag of a.clans) range.set(tag, a.id);
  // Les clans de la carte, du plus grand au plus petit : un tag porté par deux clans n'est proposé qu'une fois.
  const pixels = new Map<string, number>();
  for (const s of ctx.film.standings) if (s.tag !== null) pixels.set(s.tag, (pixels.get(s.tag) ?? 0) + s.pixels);
  const libres = [...pixels.keys()].filter((tag) => !range.has(tag));

  const ranger = (tag: string, alliance: number | null) => {
    if ((range.get(tag) ?? null) === alliance) return;
    void run("set_alliance_clan", { p_tag: tag, p_alliance: alliance });
  };
  const deposer = (cible: number | null) => (e: DragEvent) => {
    e.preventDefault();
    setSurvolee(null);
    const tag = e.dataTransfer?.getData("text/plain") ?? "";
    if (/^[A-Z0-9]{2,5}$/.test(tag)) ranger(tag, cible);
  };
  const survol = (cible: number | "aucune") => (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setSurvolee(cible);
  };
  const jeton = (tag: string, depuis: { id: number; name: string } | null) => (
    <li
      key={tag}
      class="alliance-jeton"
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData("text/plain", tag);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      }}
    >
      <strong>{tag}</strong>
      <span class="text-muted tnum"> {pixels.has(tag) ? fmtInt(pixels.get(tag)) : "absent de la carte"}</span>
      {depuis && (
        <button type="button" class="alliance-retirer" disabled={busy} onClick={() => ranger(tag, null)} aria-label={`Sortir ${tag} de ${depuis.name}`}>
          sortir
        </button>
      )}
    </li>
  );

  return (
    <section class="carte-bloc" aria-labelledby="gestion-clans">
      <h3 id="gestion-clans">Ranger les clans</h3>
      <p class="carte-aide">GAL dans une alliance en fait la nôtre.</p>
      {alliances.length === 0 && <p class="mt-2 text-muted">Créez d'abord une alliance.</p>}
      {alliances.map((a) => (
        <div class="alliance-case" data-survolee={survolee === a.id ? "" : undefined} onDragOver={survol(a.id)} onDragLeave={() => setSurvolee(null)} onDrop={deposer(a.id)}>
          <p class="font-semibold">
            <Pastille couleur={a.color} />
            {a.name}
          </p>
          <ul class="alliance-jetons">{a.clans.map((tag) => jeton(tag, a))}</ul>
          <label for={`ajouter-${a.id}`} class="sr-only">
            Ajouter un clan à {a.name}
          </label>
          <select
            id={`ajouter-${a.id}`}
            class="field mt-2"
            disabled={busy}
            value=""
            onChange={(e) => {
              const tag = e.currentTarget.value;
              e.currentTarget.value = "";
              if (tag) ranger(tag, a.id);
            }}
          >
            <option value="">Ajouter un clan…</option>
            {[...pixels.keys()]
              .filter((tag) => range.get(tag) !== a.id)
              .map((tag) => {
                const ailleurs = alliances.find((x) => x.id === range.get(tag));
                return <option value={tag}>{ailleurs ? `${tag} (aujourd'hui dans ${ailleurs.name})` : tag}</option>;
              })}
          </select>
        </div>
      ))}
      {alliances.length > 0 && (
        // Les clans sans alliance, repliés : une quarantaine de clans allongeaient la fenêtre. Déposer un clan sur la case le sort de son alliance.
        <div class="alliance-case" data-survolee={survolee === "aucune" ? "" : undefined} onDragOver={survol("aucune")} onDragLeave={() => setSurvolee(null)} onDrop={deposer(null)}>
          <details class="fold">
            <summary>Clans sans alliance ({libres.length})</summary>
            <ul class="alliance-jetons">{libres.map((tag) => jeton(tag, null))}</ul>
          </details>
        </div>
      )}
      <Problem message={erreur} />
    </section>
  );
}

function Allies({ ctx }: { ctx: Contexte }) {
  const { busy, erreur, run } = useAction(ctx.relire);
  const allies = ctx.donnees.allies ?? [];
  const invitations = ctx.donnees.invites ?? [];
  const clans = [...ctx.notres].filter((tag) => tag !== "GAL").sort();
  const [tag, setTag] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [lien, setLien] = useState<{ url: string; pour: string } | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  const inviter = async () => {
    const r = await run<{ token: string }>("create_alliance_invite", { p_tag: tag || clans[0], p_note: pseudo });
    if (!r) return;
    setLien({ url: lienInvitation(location.origin, basePath(), r.token), pour: pseudo.trim() });
    setPseudo("");
    setCopie(null);
  };

  // Ce qui manque pour inviter, dit d'après l'état : le pilote cherchait le lien sans savoir qu'il fallait d'abord ranger GAL
  // et un clan allié dans la même alliance (13 novembre 2026).
  const alliances = ctx.donnees.alliances ?? [];
  const notre = alliances.find((a) => a.id === ctx.donnees.ours) ?? null;
  const manque =
    clans.length > 0
      ? null
      : notre
        ? `Pour inviter un joueur, ajoutez d'abord son clan à « ${notre.name} », l'alliance de GAL.`
        : alliances.length > 0
          ? "Pour inviter un joueur, rangez d'abord GAL et le clan de ce joueur dans la même alliance."
          : "Pour inviter un joueur, créez d'abord votre alliance, puis rangez-y GAL et le clan de ce joueur.";
  const allerAuRangement = () => {
    const cible = document.getElementById(alliances.length > 0 ? "gestion-clans" : "alliance-nouvelle");
    cible?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (cible instanceof HTMLInputElement) cible.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="gestion-allies" data-testid="gestion-invitation">
      <h3 id="gestion-allies">Inviter un joueur allié</h3>
      {manque ? (
        <div class="alliance-manque" data-testid="invite-manque">
          <p>{manque}</p>
          <button type="button" class="btn btn-ghost mt-2" onClick={allerAuRangement}>
            {alliances.length > 0 ? "Aller au rangement des clans" : "Aller à la création de l'alliance"}
          </button>
        </div>
      ) : (
        <form
          class="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void inviter();
          }}
        >
          <p class="carte-aide">Un lien par joueur, valable une fois et 7 jours ; jamais le QG.</p>
          <label for="invite-clan" class="text-sm font-semibold">
            Son clan
          </label>
          <select id="invite-clan" class="field" value={tag || clans[0]} onChange={(e) => setTag(e.currentTarget.value)}>
            {clans.map((t) => (
              <option value={t}>{t}</option>
            ))}
          </select>
          <label for="invite-pseudo" class="text-sm font-semibold">
            Son pseudo, pour vous en souvenir
          </label>
          <input id="invite-pseudo" class="field" required minLength={2} maxLength={24} value={pseudo} onInput={(e) => setPseudo(e.currentTarget.value)} />
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || pseudo.trim().length < 2}>
              Créer le lien d'invitation
            </button>
          </div>
        </form>
      )}
      {lien && (
        <div class="alliance-lien" data-testid="invite-lien">
          <p class="font-semibold">Lien pour {lien.pour}, à n'envoyer qu'à lui :</p>
          <input class="field tnum" readOnly value={lien.url} aria-label={`Lien d'invitation pour ${lien.pour}`} onFocus={(e) => e.currentTarget.select()} />
          <div class="alliance-ligne">
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(lien.url)
                  .then(() => setCopie("Lien copié."))
                  .catch(() => setCopie("La copie est refusée par le navigateur : sélectionnez le lien et copiez-le."));
              }}
            >
              Copier le lien
            </button>
          </div>
          <Success message={copie} />
          <p class="carte-aide">Le site ne le montrera plus.</p>
        </div>
      )}
      <Problem message={erreur} />

      {invitations.length > 0 && (
        <>
          <p class="mt-4 font-semibold">Invitations en attente</p>
          <ul class="alliance-gestion-liste">
            {invitations.map((i) => (
              <li class="alliance-ligne">
                <span>
                  [{i.tag}] {i.note} · jusqu'au {fmtDateTime(i.expires_at)}
                </span>
                <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void run("cancel_alliance_invite", { p_id: i.id })}>
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {allies.length > 0 && <p class="mt-4 font-semibold">Joueurs qui ont accès</p>}
      {allies.length > 0 && (
        <ul class="alliance-gestion-liste">
          {allies.map((a) => (
            <li class="alliance-ligne">
              <span>
                <strong>
                  [{a.tag}] {a.alias}
                </strong>
                {a.discord_name ? ` · Discord : ${a.discord_name}` : ""} · depuis le {fmtDateTime(a.joined_at)}
                {!a.active && <span class="text-muted"> · sans accès : son clan n'est plus dans notre alliance</span>}
              </span>
              <span class="alliance-a-part">
                <EnDeuxTemps busy={busy} texte="Retirer l'accès" confirmer="Confirmer le retrait" nom={a.alias} onConfirm={() => void run("remove_alliance_ally", { p_number: a.number })} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AllianceGestion({ ctx }: { ctx: Contexte }) {
  return (
    <div data-testid="alliance-gestion">
      {/* L'invitation d'abord : c'est ce que l'encadrement vient chercher le plus souvent. */}
      <Allies ctx={ctx} />
      <Alliances ctx={ctx} />
      <Rangement ctx={ctx} />
    </div>
  );
}
