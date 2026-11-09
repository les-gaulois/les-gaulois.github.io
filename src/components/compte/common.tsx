import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { ServerError, call, getSession, signInWithDiscord, supabase } from "../../lib/compte/api";
import type { Me } from "../../lib/compte/types";
import { onPlayerViewChange, readPlayerView, viewedAccount } from "../../lib/compte/vue-joueur";

export type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

export const messageOf = (e: unknown): string => (e instanceof ServerError ? e.message : "Le serveur ne répond pas pour l'instant. Réessayez dans un moment.");

/** L'heure, relue chaque minute : une durée affichée reste juste dans une page laissée ouverte. */
export function useNow(every = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

/** La vue joueur de ce navigateur, tenue à jour quand on l'ouvre ou la quitte sur cette page. */
export function usePlayerView(): boolean {
  const [on, setOn] = useState(readPlayerView);
  useEffect(() => {
    // Le choix a pu changer entre le rendu et l'écoute.
    setOn(readPlayerView());
    return onPlayerViewChange(() => setOn(readPlayerView()));
  }, []);
  return on;
}

/**
 * Le compte connecté, tel que le site l'affiche : en vue joueur, l'encadrement s'y voit membre sans grade.
 * `null` tant que la session n'est pas lue.
 */
export function useMe(): { me: Me | null; failed: boolean; userId: string | null; refresh: () => Promise<void> } {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const playerView = usePlayerView();

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      setUserId(session?.user.id ?? null);
      setMe(session ? await call<Me>("get_me") : { signed_in: false });
      setFailed(false);
    } catch {
      setFailed(true);
      setMe({ signed_in: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unsubscribe = () => {};
    void supabase().then((sb) => {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refresh();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => unsubscribe();
  }, [refresh]);

  return { me: me && viewedAccount(me, playerView), failed, userId, refresh };
}

export function DiscordButton({ returnPath, label = "Se connecter avec Discord" }: { returnPath: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="sign-in"
        onClick={() => {
          setError(null);
          signInWithDiscord(returnPath).catch((e: unknown) => setError(messageOf(e)));
        }}
      >
        {label}
      </button>
      <Problem message={error} />
    </>
  );
}

export function Problem({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <p class="form-problem" role="alert">
      {message}{" "}
      {onRetry && (
        <button type="button" class="underline" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </p>
  );
}

export function Success({ message }: { message: string | null }) {
  return (
    <p class="form-success" role="status">
      {message}
    </p>
  );
}

export function Loading({ label = "Lecture en cours…" }: { label?: string }) {
  return (
    <p class="text-muted" role="status">
      {label}
    </p>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="text-muted">{children}</p>;
}

/** Une suppression ne part qu'au second clic : le texte, lui, ne se récupère pas. */
export function DeleteButton({ busy, onConfirm, label }: { busy: boolean; onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-secondary btn-sm"
      disabled={busy}
      aria-label={armed ? `Confirmer la suppression de « ${label} »` : `Supprimer « ${label} »`}
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirmer la suppression" : "Supprimer"}
    </button>
  );
}

/** Exécute une action : `true` si le serveur l'accepte, sinon son refus s'affiche. */
export function useRun(after: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      await after();
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}
