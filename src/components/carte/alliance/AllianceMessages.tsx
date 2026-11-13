/**
 * La discussion de l'alliance, entre les Gaulois validés et les joueurs alliés invités. Le serveur garde les 30 derniers
 * jours ; la page relit les 80 derniers messages toutes les 10 secondes tant que la discussion est sous les yeux.
 *
 * Depuis la migration 20261113001000 (idée choisie par le pilote le 13 novembre 2026) : l'encadrement épingle un message,
 * qui reste en haut de la discussion, même au-delà des 80 derniers et des 30 jours, tant qu'il est épinglé.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { MESSAGE_MAX } from "../../../lib/alliance/discussion";
import type { MessageAlliance, MessageEpingle } from "../../../lib/alliance/types";
import { call } from "../../../lib/compte/api";
import { Problem, messageIn, useNow } from "../../compte/common";
import { useTextes } from "./commun";

/** Un message retiré ne revient pas : le retrait part au second clic. */
function Retirer({ nom, onConfirm }: { nom: string; onConfirm: () => void }) {
  const t = useTextes();
  const [arme, setArme] = useState(false);
  return (
    <button
      type="button"
      class="alliance-retirer"
      onBlur={() => setArme(false)}
      onClick={() => {
        if (arme) onConfirm();
        else setArme(true);
      }}
      aria-label={arme ? t.retirerMessageConfirmerAria(nom) : t.retirerMessageAria(nom)}
    >
      {arme ? t.retirerMessageConfirmer : t.retirerMessage}
    </button>
  );
}

export default function AllianceMessages({
  messages,
  epingle,
  staff,
  erreurLecture,
  relire,
}: {
  messages: MessageAlliance[] | null;
  /** Le message épinglé par l'encadrement ; `null` : aucun. */
  epingle: MessageEpingle | null;
  /** L'encadrement de GAL, hors vue joueur : il épingle et désépingle. */
  staff: boolean;
  erreurLecture: string | null;
  relire: () => Promise<void>;
}) {
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = useRef<HTMLOListElement>(null);
  const enBas = useRef(true);
  const maintenant = useNow();
  const t = useTextes();

  // Un nouveau message fait descendre la liste, sauf si on est remonté lire plus haut.
  useLayoutEffect(() => {
    const el = liste.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = liste.current;
    if (!el) return;
    const suivre = () => {
      enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener("scroll", suivre, { passive: true });
    return () => el.removeEventListener("scroll", suivre);
  }, []);

  const envoyer = async () => {
    const corps = texte.trim();
    if (corps === "") return;
    setBusy(true);
    setErreur(null);
    try {
      await call("post_alliance_message", { p_body: corps });
      setTexte("");
      enBas.current = true;
      await relire();
    } catch (e) {
      setErreur(messageIn(e, t.langue));
    } finally {
      setBusy(false);
    }
  };

  const retirer = async (id: number) => {
    setErreur(null);
    try {
      await call("delete_alliance_message", { p_id: id });
      await relire();
    } catch (e) {
      setErreur(messageIn(e, t.langue));
    }
  };

  // Épingler remplace le message épinglé d'avant ; `null` désépingle.
  const epingler = async (id: number | null) => {
    setErreur(null);
    try {
      await call("pin_alliance_message", { p_id: id });
      await relire();
    } catch (e) {
      setErreur(messageIn(e, t.langue));
    }
  };

  return (
    <div class="alliance-discussion" data-testid="alliance-messages">
      {messages === null && (
        <p class="text-muted" role="status">
          {t.lectureMessages}
        </p>
      )}
      {epingle && (
        <section class="alliance-epingle" aria-labelledby="alliance-epingle-titre" data-testid="alliance-epingle">
          <p class="alliance-auteur">
            <strong id="alliance-epingle-titre" class="alliance-marque">
              {t.epingle}
            </strong>
            <strong>
              [{epingle.tag}] {epingle.name}
            </strong>
            {epingle.staff && <span class="alliance-marque">{t.marqueEncadrement}</span>}
            <time dateTime={epingle.at} class="text-muted">
              {t.heureMessage(epingle.at, maintenant)}
            </time>
            {staff && (
              <button type="button" class="alliance-retirer" onClick={() => void epingler(null)} data-testid="alliance-desepingler">
                {t.desepingler}
              </button>
            )}
            {epingle.can_delete && <Retirer nom={epingle.name} onConfirm={() => void retirer(epingle.id)} />}
          </p>
          <p class="alliance-corps">{epingle.body}</p>
        </section>
      )}
      <ol class="alliance-fil" ref={liste} aria-label={t.filAria} tabIndex={0}>
        {(messages ?? []).map((m) => (
          <li key={m.id} class={m.mine ? "est-mien" : undefined}>
            <p class="alliance-auteur">
              <strong>
                [{m.tag}] {m.name}
              </strong>
              {m.staff && <span class="alliance-marque">{t.marqueEncadrement}</span>}
              <time dateTime={m.at} class="text-muted">
                {t.heureMessage(m.at, maintenant)}
              </time>
              {staff && epingle?.id !== m.id && (
                <button type="button" class="alliance-retirer" aria-label={t.epinglerAria(m.name)} onClick={() => void epingler(m.id)}>
                  {t.epingler}
                </button>
              )}
              {m.can_delete && <Retirer nom={m.name} onConfirm={() => void retirer(m.id)} />}
            </p>
            <p class="alliance-corps">{m.body}</p>
          </li>
        ))}
      </ol>
      <Problem message={erreurLecture} />
      <form
        class="alliance-ecrire"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
      >
        <label for="alliance-message" class="text-sm font-semibold">
          {t.votreMessage}
        </label>
        <textarea
          id="alliance-message"
          class="field"
          rows={2}
          maxLength={MESSAGE_MAX}
          value={texte}
          onInput={(e) => setTexte(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj + Entrée passe à la ligne.
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              void envoyer();
            }
          }}
        />
        <div class="alliance-ligne">
          <button type="submit" class="btn btn-primary" disabled={busy || texte.trim() === ""}>
            {t.envoyer}
          </button>
          <span class="carte-aide tnum" aria-live="polite">
            {texte.length > MESSAGE_MAX - 50 ? t.caracteresRestants(MESSAGE_MAX - texte.length) : ""}
          </span>
        </div>
        <Problem message={erreur} />
      </form>
      <p class="carte-aide">{t.piedDiscussion}</p>
    </div>
  );
}
