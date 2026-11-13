import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { CODE_LOGIN_OPEN, ServerError, basePath, call, getSession, signInWithCode, signInWithDiscord, supabase } from "../../lib/compte/api";
import { ERROR_MESSAGES_EN, errorMessageEn } from "../../lib/compte/errors";
import { PENDING_CHANGED } from "../../lib/compte/pending";
import { initialOf } from "../../lib/compte/qg";
import type { Me } from "../../lib/compte/types";
import { onPlayerViewChange, readPlayerView, viewedAccount } from "../../lib/compte/vue-joueur";

export type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

export const messageOf = (e: unknown): string => (e instanceof ServerError ? e.message : "Le serveur ne répond pas pour l'instant. Réessayez dans un moment.");

/**
 * Les écrans que lit aussi un joueur allié, dans la fenêtre « Alliance » de la carte, se lisent en français ou en anglais
 * (`src/lib/alliance/langue.ts`). Partout ailleurs, le site reste en français : c'est la valeur par défaut.
 */
export type LangueEcran = "fr" | "en";

/** Le refus du serveur dans la langue de l'écran. */
export const messageIn = (e: unknown, langue: LangueEcran = "fr"): string =>
  langue === "fr" ? messageOf(e) : e instanceof ServerError ? errorMessageEn(e.code) : ERROR_MESSAGES_EN["network"]!;

/** L'heure, relue chaque minute : une durée affichée reste juste dans une page laissée ouverte. */
export function useNow(every = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

/**
 * Les demandes d'adhésion qui attendent, pour la pastille de l'en-tête et l'onglet Demandes de la Direction. Le serveur ne donne ce
 * nombre qu'à l'encadrement (`count_pending_requests`) ; il se relit quand une demande est traitée sur la page.
 * `null` : pas demandé (`enabled` faux) ou pas de réponse : rien ne s'affiche.
 */
export function usePendingCount(enabled: boolean): number | null {
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPending(null);
      return;
    }
    let live = true;
    const read = () => {
      call<{ pending: number }>("count_pending_requests")
        .then((data) => {
          if (live) setPending(data.pending);
        })
        .catch(() => {
          if (live) setPending(null);
        });
    };
    read();
    window.addEventListener(PENDING_CHANGED, read);
    return () => {
      live = false;
      window.removeEventListener(PENDING_CHANGED, read);
    };
  }, [enabled]);
  return pending;
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

/**
 * `avant` : juste avant de partir vers Discord. La carte de l'alliance y note qu'il faut y revenir : Discord ne ramène qu'aux
 * adresses de retour admises par le serveur, la page de compte et la Direction.
 */
export function DiscordButton({ returnPath, label = "Se connecter avec Discord", avant, langue = "fr" }: { returnPath: string; label?: string; avant?: () => void; langue?: LangueEcran }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="sign-in"
        onClick={() => {
          setError(null);
          avant?.();
          signInWithDiscord(returnPath).catch((e: unknown) => setError(messageIn(e, langue)));
        }}
      >
        {label}
      </button>
      <Problem message={error} />
    </>
  );
}

/** L'espace insécable avant « : » : une ligne ne commence jamais par les deux-points. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Sous le bouton de connexion, pour qui hésite à lier son compte : ce que Discord donne au site. Les portées sont celles
 * que l'outil de connexion de Supabase demande toujours à Discord, `identify` et `email` (lues dans son code le
 * 12 novembre 2026). Après la connexion, le site n'a plus besoin de cet accès : la session est celle de Supabase.
 */
export function DiscordGives({ langue = "fr" }: { langue?: LangueEcran } = {}) {
  if (langue === "en")
    return (
      <details class="fold mt-4" data-testid="discord-gives">
        <summary>What Discord gives the site</summary>
        <div class="mt-1 space-y-2 text-muted">
          <p>
            Your Discord ID and name, your profile picture and your e-mail address. Never your password, your messages, your
            servers or your friends: the site cannot write anything on your behalf.
          </p>
          <p>Once signed in, you can remove this access in Discord, under Settings then Authorized Apps: you stay signed in on this device.</p>
          <p>
            <a href={`${basePath()}/confidentialite#avec-un-compte`} hreflang="fr">
              What the site keeps (in French)
            </a>
          </p>
        </div>
      </details>
    );
  return (
    <details class="fold mt-4" data-testid="discord-gives">
      <summary>Ce que Discord donne au site</summary>
      <div class="mt-1 space-y-2 text-muted">
        <p>
          Votre identifiant et votre nom Discord, votre photo de profil et votre adresse e-mail. Jamais votre mot de passe, vos
          messages, vos serveurs ni vos amis{NBSP}: le site ne peut rien écrire en votre nom.
        </p>
        <p>
          Une fois connecté, vous pouvez retirer cet accès dans Discord, sous Paramètres puis Applications autorisées{NBSP}: vous
          restez connecté sur cet appareil.
        </p>
        <p>
          <a href={`${basePath()}/confidentialite#avec-un-compte`}>Ce que le site conserve</a>
        </p>
      </div>
    </details>
  );
}

/** La connexion par code s'affiche une fois ouverte à tous, ou à l'adresse `/compte#code`, pour l'essai d'avant. */
export const codeLoginShown = (): boolean => CODE_LOGIN_OPEN || location.hash === "#code";

/**
 * Se connecter sans lier son compte Discord : le joueur tape /code dans le Discord du clan, et recopie ici le code que le
 * robot lui montre, à lui seul. Le serveur vérifie le code ; la session ouverte, la page de compte se recharge.
 * `connecte` : la session ouverte, la page reste où elle est (la carte de l'alliance), au lieu d'aller au compte.
 */
export function CodeLogin({ connecte, langue = "fr" }: { connecte?: () => void; langue?: LangueEcran } = {}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const en = langue === "en";

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithCode(code);
      if (connecte) {
        setBusy(false);
        connecte();
        return;
      }
      location.assign(`${basePath()}/compte`);
    } catch (e) {
      setError(messageIn(e, langue));
      setBusy(false);
    }
  };

  return (
    <section class="border-t border-line pt-5" aria-labelledby="code-titre" data-testid="code-login">
      <h3 id="code-titre" class="text-lg">
        {en ? "Without linking your Discord account" : "Sans lier votre compte Discord"}
      </h3>
      <ol class="mt-2 list-decimal space-y-1 pl-6 text-muted">
        <li>{en ? "In the clan's Discord, type /code." : "Dans le Discord du clan, tapez /code."}</li>
        <li>{en ? "Copy here the code the bot shows you, and only you." : "Recopiez ici le code que le robot vous montre, à vous seul."}</li>
      </ol>
      <form
        class="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div class="w-full max-w-56">
          <label for="code-discord" class="text-sm font-semibold">
            Code
          </label>
          <input
            id="code-discord"
            class="field mt-1 font-mono tracking-widest"
            required
            maxLength={12}
            autocomplete="one-time-code"
            autocapitalize="characters"
            spellcheck={false}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
          />
        </div>
        <button type="submit" class="btn btn-ghost" disabled={busy || code.trim() === ""}>
          {busy ? (en ? "Signing in…" : "Connexion…") : en ? "Sign in" : "Se connecter"}
        </button>
      </form>
      <Problem message={error} />
      <p class="mt-3 text-sm text-muted">
        {en ? (
          "This way the site only keeps your Discord ID and username, so that an officer can recognise you: no e-mail, no access to your account."
        ) : (
          <>
            Par ce chemin, le site ne garde que votre identifiant et votre nom d'utilisateur Discord, pour qu'un officier vous
            reconnaisse{NBSP}: ni e-mail, ni accès à votre compte.
          </>
        )}
      </p>
    </section>
  );
}

export function Problem({ message, onRetry, retryLabel = "Réessayer" }: { message: string | null; onRetry?: () => void; retryLabel?: string }) {
  if (!message) return null;
  return (
    <p class="form-problem" role="alert">
      {message}{" "}
      {onRetry && (
        <button type="button" class="underline" onClick={onRetry}>
          {retryLabel}
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

/** La photo Discord d'un membre, ou son initiale si elle manque ou ne se charge pas. Décorative : le nom est écrit à côté. */
export function Avatar({ name, avatar, large = false }: { name: string; avatar: string | null; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatar]);
  return (
    <span class={`avatar overflow-hidden ${large ? "!size-14 text-xl" : ""}`} aria-hidden="true">
      {avatar && !broken ? (
        <img src={avatar} alt="" width={large ? 56 : 36} height={large ? 56 : 36} loading="lazy" decoding="async" referrerpolicy="no-referrer" class="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initialOf(name)
      )}
    </span>
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
      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
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
