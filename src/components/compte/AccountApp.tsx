import { useEffect, useState } from "preact/hooks";
import { ADRESSE_ALLIANCE, RETOUR_CARTE_KEY } from "../../lib/alliance/invitation";
import { basePath, call, signOut } from "../../lib/compte/api";
import { ROLE_LABELS, type Me } from "../../lib/compte/types";
import { fmtDate } from "../../lib/format";
import { ADRESSE_VILLAGE, RETOUR_VILLAGE_KEY } from "../../lib/gaulois";
import { COMPTE_OPENFRONT_URL } from "../../lib/compte/lien-openfront";
import { CodeLogin, DiscordButton, DiscordGives, Loading, Problem, codeLoginShown, messageOf, useMe } from "./common";
import { DemandeLienOpenFront, useAllie } from "./LienOpenFront";

/** La demande envoyée, en attente d'un officier : on peut l'annuler. Sans demande en cours, le lien OpenFront est demandé. */
function MembershipRequest({ me, onChange }: { me: Me; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = me.request;

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

  if (request?.status !== "pending") return <DemandeLienOpenFront me={me} onSent={onChange} />;

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

/** Un retour noté au départ vers Discord ; un départ abandonné il y a plus d'un quart d'heure ne compte plus. */
function retourDemande(cle: string): boolean {
  try {
    const depart = Number(sessionStorage.getItem(cle));
    sessionStorage.removeItem(cle);
    return Number.isFinite(depart) && depart > 0 && Date.now() - depart < 15 * 60_000;
  } catch {
    return false;
  }
}

/**
 * Revenir de Discord vers la carte de l'alliance ou le village : Discord ne ramène qu'ici, la page l'a noté avant le départ.
 * Le libellé de l'attente, ou `null` s'il n'y a nulle part où revenir.
 */
function retourApresDiscord(me: Me | null): string | null {
  if (!me?.signed_in) return null;
  if (retourDemande(RETOUR_CARTE_KEY)) {
    location.replace(`${basePath()}${ADRESSE_ALLIANCE}`);
    return "Retour à la carte de l'alliance…";
  }
  if (retourDemande(RETOUR_VILLAGE_KEY)) {
    location.replace(`${basePath()}${ADRESSE_VILLAGE}`);
    return "Retour au village…";
  }
  return null;
}

export default function AccountApp() {
  const { me, failed, refresh } = useMe();
  const allie = useAllie(me);
  const [retour, setRetour] = useState<string | null>(null);
  useEffect(() => {
    const attente = retourApresDiscord(me);
    if (attente) setRetour(attente);
  }, [me]);

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (retour) return <Loading label={retour} />;
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
            <a class="btn btn-ghost" href={COMPTE_OPENFRONT_URL} target="_blank" rel="noopener" data-testid="account-openfront">
              Mon profil OpenFront<span class="sr-only"> (nouvel onglet)</span>
            </a>
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
      {me.status === "pending" && allie === null && <MembershipRequest me={me} onChange={refresh} />}

      <DeleteAccount founder={me.role === "founder"} />
    </div>
  );
}
