import { useEffect, useState } from "preact/hooks";
import { basePath, call, mayHaveSession, supabase } from "../lib/compte/api";
import { pendingWords } from "../lib/compte/pending";
import type { Me } from "../lib/compte/types";
import { viewedAccount } from "../lib/compte/vue-joueur";
import { fmtInt } from "../lib/format";
import { usePendingCount, usePlayerView } from "./compte/common";

const LINK = "btn btn-ghost !min-h-10 !py-1.5 !text-sm whitespace-nowrap";

/**
 * L'entrée du compte dans l'en-tête, sur toutes les pages.
 * Sans session enregistrée, rien n'est chargé : un simple visiteur ne télécharge pas Supabase.
 * Masquer un lien ne protège rien : le serveur revérifie chaque action.
 */
export default function AuthMenu() {
  const [me, setMe] = useState<Me | null>(null);
  // Le nom choisi sur la carte de l'alliance, pour un joueur allié invité : son compte n'a pas d'autre nom que « Gaulois n° … ».
  const [ally, setAlly] = useState<string | null>(null);
  const playerView = usePlayerView();
  // En vue joueur, l'en-tête est celui d'un membre sans grade : la bande placée dessous permet d'en sortir.
  const canDirect = me !== null && (viewedAccount(me, playerView).rank ?? 0) >= 2;
  // La pastille des demandes en attente. Le serveur ne donne ce nombre qu'à l'encadrement ; s'il ne répond pas, elle ne s'affiche pas.
  const pending = usePendingCount(canDirect);

  useEffect(() => {
    if (!mayHaveSession()) return;
    let unsubscribe = () => {};
    let stopped = false;
    void supabase().then((sb) => {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") setMe(null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      if (stopped) unsubscribe();
    });
    call<Me>("get_me")
      .then((data) => {
        setMe(data.signed_in ? data : null);
        // Un compte en attente peut être un joueur allié invité sur la carte de l'alliance.
        if (data.signed_in && data.status === "pending") {
          call<{ access: { kind: string; name: string } | null; waiting?: { alias: string } | null }>("get_map_access")
            // Accepté, ou encore en attente de l'accord de l'encadrement : sa place est la carte de l'alliance.
            .then((r) => setAlly(r.access?.kind === "allie" ? r.access.name : (r.waiting?.alias ?? null)))
            // Un serveur d'avant la carte de l'alliance ne connaît pas cette fonction : l'en-tête reste comme avant.
            .catch(() => setAlly(null));
        }
      })
      .catch(() => setMe(null));
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);

  const base = basePath();
  if (!me) {
    return (
      <a href={`${base}/compte`} class={LINK} data-testid="auth-sign-in">
        Se connecter
      </a>
    );
  }

  const waiting = pendingWords(pending);
  // Pour l'affichage seulement : le serveur ne donne le contenu du QG qu'à un compte validé.
  const validated = me.status === "validated";
  return (
    <>
      {/* Un joueur allié invité : sa place est la carte de l'alliance, jamais le QG. Sur téléphone, seul ce lien reste. */}
      {ally && (
        <a href={`${base}/carte#alliance`} class={LINK} data-testid="auth-alliance">
          Alliance
        </a>
      )}
      {/* L'administration est à la Direction (au QG du 10 au 12 novembre 2026) : quand des demandes attendent, la pastille les
          compte et le lien ouvre leur partie. Les lecteurs d'écran entendent « Direction 2 demandes à traiter ». */}
      {canDirect && (
        <a href={waiting ? `${base}/direction#demandes` : `${base}/direction`} class={LINK} data-testid="auth-direction" data-direction-link>
          Direction
          {waiting && pending !== null && (
            <span class="count-pill tnum" data-testid="auth-pending">
              {fmtInt(pending)}
              <span class="sr-only"> {waiting}</span>
            </span>
          )}
        </a>
      )}
      {/* Le QG, à un clic de toutes les pages pour un membre validé. Sur téléphone, la place manque : l'encadrement garde
          « Direction », où se traitent les demandes, et ouvre le QG depuis la Direction. */}
      {validated && (
        <span class={canDirect ? "hidden sm:inline-flex" : "inline-flex"}>
          <a href={`${base}/qg`} class={LINK} data-testid="auth-qg" data-qg-link>
            QG
          </a>
        </span>
      )}
      {/* Le nom mène au compte. L'encadrement, qui a déjà deux liens, ouvre le sien depuis le QG ou la Direction ; sur téléphone, un membre validé aussi. */}
      {!canDirect && (
        <span class={validated || ally ? "hidden sm:inline-flex" : "inline-flex"}>
          <a href={`${base}/compte`} class={LINK} data-testid="auth-account" title={ally ?? me.name}>
            <span class="block max-w-24 truncate sm:max-w-32">{ally ?? me.name ?? "Mon compte"}</span>
          </a>
        </span>
      )}
    </>
  );
}
