import { useEffect, useState } from "preact/hooks";
import type { AccesCarte, AttenteAllie } from "../../lib/alliance/types";
import { basePath, call } from "../../lib/compte/api";
import { COMPTE_OPENFRONT_URL, DEBUT_DU_LIEN, identifiantDuLien, lienAttendu, profilOpenFront } from "../../lib/compte/lien-openfront";
import { errorMessage } from "../../lib/compte/errors";
import type { Me } from "../../lib/compte/types";
import { Problem, focusField, messageOf } from "./common";

/** L'espace insécable autour des guillemets et avant « : » : ni guillemet ni deux-points seuls en début de ligne. */
const NBSP = String.fromCharCode(0xa0);

export interface Allie {
  tag: string;
  name: string;
  enAttente: boolean;
}

/**
 * Ce que la carte de l'alliance ouvre à ce compte, pour un compte en attente : un joueur allié invité y a sa place.
 * `undefined` le temps de la lecture, `null` pour qui n'est pas un allié invité, ou un compte qui n'est pas en attente.
 */
export function useAllie(me: Me | null): Allie | null | undefined {
  // La réponse ne vaut que pour le compte qui l'a demandée : un autre compte, ou un autre état, attend la sienne.
  const cle = me === null ? null : me.signed_in && me.status === "pending" ? `attente-${me.number ?? ""}` : "autre";
  const [lu, setLu] = useState<{ cle: string; allie: Allie | null } | null>(null);
  useEffect(() => {
    if (cle === null || cle === "autre") return;
    let parti = false;
    const noter = (allie: Allie | null) => {
      if (!parti) setLu({ cle, allie });
    };
    call<{ access: AccesCarte | null; waiting?: AttenteAllie | null }>("get_map_access")
      .then((r) => {
        if (r.access?.kind === "allie") noter({ tag: r.access.tag, name: r.access.name, enAttente: false });
        // Il a ouvert son lien d'invitation : l'encadrement doit encore l'accepter.
        else if (r.waiting) noter({ tag: r.waiting.tag, name: r.waiting.alias, enAttente: true });
        else noter(null);
      })
      // Un serveur d'avant la carte de l'alliance ne connaît pas cette fonction : la page reste comme avant.
      .catch(() => noter(null));
    return () => {
      parti = true;
    };
  }, [cle]);
  if (cle === null) return undefined;
  if (cle === "autre") return null;
  return lu?.cle === cle ? lu.allie : undefined;
}

/**
 * Le compte doit-il donner son lien avant d'aller plus loin (village, porte du QG) ? Seulement s'il n'a jamais rien envoyé
 * (`lienAttendu`) et qu'il n'est pas un joueur allié invité, qui n'est pas un Gaulois : la carte de l'alliance lui suffit.
 * `null` le temps de le savoir.
 */
export function useLienAttendu(me: Me | null): boolean | null {
  const allie = useAllie(me);
  if (me === null || !lienAttendu(me)) return false;
  return allie === undefined ? null : allie === null;
}

/**
 * Le lien du profil OpenFront, obligatoire pour demander sa validation : un bouton ouvre la fenêtre « Compte » du jeu, où le
 * joueur copie son lien, puis il le colle ici. Le site n'envoie que l'identifiant lu dans le lien ; le serveur revérifie sa
 * forme et n'en garde que l'empreinte. `onSent` : la demande partie, relire le compte.
 */
export function DemandeLienOpenFront({ me, onSent }: { me: Me; onSent: () => Promise<void> }) {
  const [lien, setLien] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [faux, setFaux] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = me.request;
  const identifiant = identifiantDuLien(lien);

  const send = async () => {
    if (identifiant === null) {
      setFaux(true);
      focusField("lien-openfront");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call("request_membership_link", { p_public_id: identifiant, p_note: note || null });
      setLien("");
      setNote("");
      await onSent();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card p-5" data-testid="request-form" aria-labelledby="lien-openfront-titre">
      <h2 id="lien-openfront-titre" class="text-xl">
        Votre lien OpenFront
      </h2>
      <p class="mt-2 text-muted">Obligatoire pour finir votre connexion. Un officier confirme ensuite que c'est bien vous.</p>
      {request?.status === "refused" && (
        <p class="form-problem mt-3" data-testid="request-refused">
          Votre dernière demande a été refusée{request.reason ? ` : ${request.reason}` : "."}
        </p>
      )}
      {/* Une demande acceptée, et pourtant un compte en attente : l'encadrement l'a remis en attente avec « Refaire la demande ». */}
      {request?.status === "approved" && (
        <p class="form-problem mt-3" data-testid="request-redo">
          Refaites votre demande{NBSP}: votre profil n'a pas été trouvé dans la <a href={`${basePath()}/liste`}>liste des membres</a>. Donnez le lien du compte OpenFront qui est dans le clan.
        </p>
      )}
      <ol class="mt-4 list-decimal space-y-1 pl-6">
        <li>Ouvrez votre profil OpenFront, connecté avec le compte qui est dans le clan.</li>
        <li>{`En haut de la fenêtre «${NBSP}Compte${NBSP}», cliquez sur «${NBSP}Partager le profil${NBSP}»${NBSP}: le lien est copié.`}</li>
        <li>Collez-le ci-dessous.</li>
      </ol>
      <div class="mt-4">
        <a class="btn btn-secondary" href={COMPTE_OPENFRONT_URL} target="_blank" rel="noopener" data-testid="openfront-profile">
          Ouvrir mon profil OpenFront<span class="sr-only"> (nouvel onglet)</span>
        </a>
      </div>
      <form
        class="mt-5 grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div>
          <label for="lien-openfront" class="text-sm font-semibold">
            Lien de votre profil OpenFront
          </label>
          <input
            id="lien-openfront"
            class="field mt-1"
            required
            maxLength={200}
            inputMode="url"
            autocomplete="off"
            spellcheck={false}
            placeholder={`${DEBUT_DU_LIEN}…`}
            value={lien}
            aria-invalid={faux && identifiant === null}
            aria-describedby={faux && identifiant === null ? "lien-openfront-faux" : undefined}
            onInput={(e) => {
              setLien(e.currentTarget.value);
              setError(null);
            }}
          />
          {faux && identifiant === null && (
            <p id="lien-openfront-faux" class="form-problem mt-2" role="alert" data-testid="lien-faux">
              {errorMessage("invalid_profile_link")}
            </p>
          )}
          {identifiant !== null && (
            <p class="mt-2 text-sm text-muted" data-testid="lien-reconnu">
              Lien reconnu.{" "}
              <a href={profilOpenFront(identifiant)} target="_blank" rel="noopener">
                Vérifier que c'est bien votre profil<span class="sr-only"> (nouvel onglet)</span>
              </a>
            </p>
          )}
        </div>
        <div>
          <label for="note" class="text-sm font-semibold">
            Un mot pour l'officier (facultatif)
          </label>
          <input id="note" class="field mt-1" maxLength={300} placeholder="Votre pseudo sur le Discord du clan, par exemple" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        </div>
        <div>
          <button type="submit" class="btn btn-primary" disabled={busy || lien.trim() === ""}>
            {busy ? "Envoi…" : "Envoyer mon lien"}
          </button>
        </div>
      </form>
      <Problem message={error} />
    </section>
  );
}
