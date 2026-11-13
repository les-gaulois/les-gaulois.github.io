import { useEffect, useState } from "preact/hooks";
import { ADRESSE_ALLIANCE, RETOUR_CARTE_KEY } from "../../lib/alliance/invitation";
import type { AccesCarte, AttenteAllie } from "../../lib/alliance/types";
import { basePath, call, signOut } from "../../lib/compte/api";
import { ROLE_LABELS, type Me } from "../../lib/compte/types";
import { fmtDate } from "../../lib/format";
import { CodeLogin, DiscordButton, DiscordGives, Loading, Problem, codeLoginShown, messageOf, useMe } from "./common";

/** Lier son profil OpenFront et demander sa validation. */
function MembershipRequest({ me, onChange }: { me: Me; onChange: () => Promise<void> }) {
  const [claim, setClaim] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = me.request;
  const open = request?.status === "pending";

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await call("request_membership", { p_claim: claim, p_note: note || null });
      setClaim("");
      setNote("");
      await onChange();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await call("cancel_membership_request");
      await onChange();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    return (
      <section class="card p-5" data-testid="request-pending">
        <h2 class="text-xl">Demande en attente</h2>
        <p class="mt-2">
          {request.in_roster ? (
            <>
              Profil{request.roster_username ? ` « ${request.roster_username} »` : ""} trouvé dans la liste des membres. Un officier doit encore confirmer que c'est vous.
            </>
          ) : (
            <>Profil pas encore trouvé dans la liste des membres, relue chaque jour : un officier va vérifier.</>
          )}
        </p>
        <p class="mt-2 text-sm text-muted">Envoyée le {fmtDate(request.created_at)}.</p>
        <button type="button" class="btn btn-ghost mt-4 !min-h-10 !py-1.5 !text-sm" disabled={busy} onClick={() => void cancel()}>
          Annuler ma demande
        </button>
        <Problem message={error} />
      </section>
    );
  }

  return (
    <section class="card p-5" data-testid="request-form">
      <h2 class="text-xl">Lier mon profil OpenFront</h2>
      <p class="mt-2 text-muted">Un officier confirmera ensuite que c'est bien vous.</p>
      {request?.status === "refused" && (
        <p class="form-problem mt-3" data-testid="request-refused">
          Votre dernière demande a été refusée{request.reason ? ` : ${request.reason}` : "."}
        </p>
      )}
      {/* Une demande acceptée, et pourtant un compte en attente : l'encadrement l'a remis en attente avec « Refaire la demande ». */}
      {request?.status === "approved" && (
        <p class="form-problem mt-3" data-testid="request-redo">
          Refaites votre demande : votre profil n'a pas été trouvé dans la liste des membres. Indiquez votre pseudo exact, tel qu'il apparaît dans la <a href={`${basePath()}/liste`}>liste des membres</a>, ou votre identifiant public si vous y figurez comme « Membre anonyme ».
        </p>
      )}
      <form
        class="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div>
          <label for="claim" class="text-sm font-semibold">
            Pseudo OpenFront ou identifiant public
          </label>
          <input id="claim" class="field mt-1" required maxLength={64} autocomplete="off" value={claim} onInput={(e) => setClaim(e.currentTarget.value)} />
        </div>
        <div>
          <label for="note" class="text-sm font-semibold">
            Un mot pour l'officier (facultatif)
          </label>
          <input id="note" class="field mt-1" maxLength={300} placeholder="Votre pseudo sur le Discord du clan, par exemple" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </div>
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy || claim.trim() === ""}>
            Demander ma validation
          </button>
        </div>
      </form>
      <Problem message={error} />
    </section>
  );
}

function DeleteAccount({ founder }: { founder: boolean }) {
  const [error, setError] = useState<string | null>(null);
  if (founder) return null;
  return (
    <section class="mt-6" data-testid="delete-account">
      <h2 class="text-lg">Effacer mon compte</h2>
      <p class="mt-1 text-sm text-muted">Votre compte OpenFront et vos dons dans le jeu ne sont pas touchés.</p>
      <button
        type="button"
        class="btn btn-ghost mt-3 !min-h-10 !py-1.5 !text-sm"
        onClick={() => {
          if (!window.confirm("Effacer définitivement votre compte sur ce site ?")) return;
          call("delete_my_account")
            .then(() => signOut())
            .then(() => {
              location.href = `${basePath()}/`;
            })
            .catch((e: unknown) => setError(messageOf(e)));
        }}
      >
        Effacer mon compte
      </button>
      <Problem message={error} />
    </section>
  );
}

/** Ce que la carte de l'alliance ouvre à ce compte, pour un compte en attente : un joueur allié invité y a sa place. */
function useAllie(me: Me | null): { tag: string; name: string; enAttente: boolean } | null {
  const [access, setAccess] = useState<{ tag: string; name: string; enAttente: boolean } | null>(null);
  useEffect(() => {
    if (!me?.signed_in || me.status !== "pending") {
      setAccess(null);
      return;
    }
    call<{ access: AccesCarte | null; waiting?: AttenteAllie | null }>("get_map_access")
      .then((r) => {
        if (r.access?.kind === "allie") setAccess({ tag: r.access.tag, name: r.access.name, enAttente: false });
        // Il a ouvert son lien d'invitation : l'encadrement doit encore l'accepter.
        else if (r.waiting) setAccess({ tag: r.waiting.tag, name: r.waiting.alias, enAttente: true });
        else setAccess(null);
      })
      // Un serveur d'avant la carte de l'alliance ne connaît pas cette fonction : la page reste comme avant.
      .catch(() => setAccess(null));
  }, [me?.signed_in, me?.status]);
  return access;
}

/** Revenir de Discord vers la carte de l'alliance : Discord ne ramène qu'ici, la carte l'a noté avant le départ. */
function retourVersLaCarte(me: Me | null): boolean {
  if (!me?.signed_in) return false;
  let demande = false;
  try {
    // Noté au départ vers Discord ; un départ abandonné il y a plus d'un quart d'heure ne compte plus.
    const depart = Number(sessionStorage.getItem(RETOUR_CARTE_KEY));
    demande = Number.isFinite(depart) && depart > 0 && Date.now() - depart < 15 * 60_000;
    sessionStorage.removeItem(RETOUR_CARTE_KEY);
  } catch {
    return false;
  }
  if (demande) location.replace(`${basePath()}${ADRESSE_ALLIANCE}`);
  return demande;
}

export default function AccountApp() {
  const { me, failed, refresh } = useMe();
  const allie = useAllie(me);
  const [retour, setRetour] = useState(false);
  useEffect(() => {
    if (retourVersLaCarte(me)) setRetour(true);
  }, [me]);

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (retour) return <Loading label="Retour à la carte de l'alliance…" />;
  if (failed) return <Problem message="Votre compte n'a pas pu être lu pour l'instant. Réessayez dans un moment." onRetry={() => void refresh()} />;

  if (!me.signed_in) {
    return (
      <section class="card p-6" data-testid="signed-out">
        <h2 class="text-2xl">Connectez-vous</h2>
        <p class="mt-2 text-muted">Le site ne reçoit jamais votre mot de passe.</p>
        <div class="mt-4">
          <DiscordButton returnPath="/compte" />
        </div>
        <DiscordGives />
        {codeLoginShown() && <CodeLogin />}
      </section>
    );
  }

  return (
    <div class="grid gap-6" data-testid="account">
      <section class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-display text-2xl font-extrabold" data-testid="account-name">
              {me.name}
            </p>
            <p class="text-sm text-muted">
              Connecté avec Discord{me.discord_name ? ` : ${me.discord_name}` : ""}
              {me.openfront_username ? ` · OpenFront : ${me.openfront_username}` : ""}
            </p>
          </div>
          <button
            type="button"
            class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
            data-testid="sign-out"
            onClick={() => {
              void signOut().then(refresh);
            }}
          >
            Se déconnecter
          </button>
        </div>
        <p class="mt-3" data-testid="account-status">
          {me.status === "validated" && (
            <>
              <strong>Membre validé</strong> · Rôle : {ROLE_LABELS[me.role ?? "member"]}
            </>
          )}
          {me.status === "pending" && <strong>En attente de validation</strong>}
          {me.status === "suspended" && (
            <>
              <strong>Compte suspendu</strong>
              {me.status_reason ? ` : ${me.status_reason}` : ""}
            </>
          )}
        </p>
        {me.status === "validated" && (
          <div class="mt-4 flex flex-wrap gap-3">
            {/* Le mot de l'encadrement, les sondages, les idées et le mur sont au QG, réservé aux membres validés. L'administration est dans la Direction. */}
            <a class="btn btn-primary" href={`${basePath()}/qg`} data-testid="account-qg">
              Entrer dans le QG
            </a>
            {(me.rank ?? 0) >= 2 && (
              <a class="btn btn-secondary" href={`${basePath()}/direction`}>
                Direction
              </a>
            )}
          </div>
        )}
      </section>

      {/* Un joueur allié invité n'est pas un Gaulois : sa place est la carte de l'alliance, pas la demande de validation. */}
      {allie && (
        <section class="card p-5" data-testid="account-allie">
          <h2 class="text-xl">Carte de l'alliance</h2>
          <p class="mt-2">
            {allie.enAttente
              ? `Votre demande, comme joueur de ${allie.tag} sous le nom ${allie.name}, attend l'accord de l'encadrement de GAL.`
              : `L'encadrement de GAL vous a accepté comme joueur de ${allie.tag}, sous le nom ${allie.name}. Votre accès : la carte de l'alliance, ses zones et sa discussion.`}
          </p>
          <a class="btn btn-primary mt-4" href={`${basePath()}${ADRESSE_ALLIANCE}`}>
            Ouvrir la carte de l'alliance
          </a>
        </section>
      )}
      {me.status === "pending" && !allie && <MembershipRequest me={me} onChange={refresh} />}

      <DeleteAccount founder={me.role === "founder"} />
    </div>
  );
}
