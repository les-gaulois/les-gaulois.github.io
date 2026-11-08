import { useEffect, useState } from "preact/hooks";
import { basePath, call, mayHaveSession, supabase } from "../lib/compte/api";
import type { Me } from "../lib/compte/types";
import { viewedAccount } from "../lib/compte/vue-joueur";
import { usePlayerView } from "./compte/common";

const LINK = "btn btn-ghost !min-h-10 !py-1.5 !text-sm whitespace-nowrap";

/**
 * L'entrée du compte dans l'en-tête, sur toutes les pages.
 * Sans session enregistrée, rien n'est chargé : un simple visiteur ne télécharge pas Supabase.
 * Masquer un lien ne protège rien : le serveur revérifie chaque action.
 */
export default function AuthMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const playerView = usePlayerView();

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
      .then((data) => setMe(data.signed_in ? data : null))
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

  // En vue joueur, l'en-tête est celui d'un membre sans grade : la bande placée dessous permet d'en sortir.
  const canDirect = (viewedAccount(me, playerView).rank ?? 0) >= 2;
  return (
    <>
      {canDirect && (
        <a href={`${base}/direction`} class={LINK} data-testid="auth-direction" data-direction-link>
          Direction
        </a>
      )}
      {/* Sur téléphone, la place manque : un officier garde « Direction », et son compte s'ouvre depuis cet espace. */}
      <span class={canDirect ? "hidden sm:inline-flex" : "inline-flex"}>
        <a href={`${base}/compte`} class={LINK} data-testid="auth-account" title={me.name}>
          <span class="block max-w-24 truncate sm:max-w-32">{me.name ?? "Mon compte"}</span>
        </a>
      </span>
    </>
  );
}
