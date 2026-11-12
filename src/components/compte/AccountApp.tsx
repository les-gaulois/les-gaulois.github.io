import { useState } from "preact/hooks";
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
          Refaites votre demande : votre profil n'a pas été trouvé dans la liste des membres. Indiquez votre pseudo exact, tel qu'il apparaît sur la page <a href={`${basePath()}/membres`}>Membres</a>, ou votre identifiant public si vous y figurez comme « Membre anonyme ».
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

export default function AccountApp() {
  const { me, failed, refresh } = useMe();

  if (me === null) return <Loading label="Lecture de votre compte…" />;
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

      {me.status === "pending" && <MembershipRequest me={me} onChange={refresh} />}

      <DeleteAccount founder={me.role === "founder"} />
    </div>
  );
}
