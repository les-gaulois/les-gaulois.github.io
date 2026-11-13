/**
 * La discussion de l'alliance, entre les Gaulois validés et les joueurs alliés invités. Le serveur garde les 30 derniers
 * jours ; la page relit les 80 derniers messages toutes les 10 secondes tant que la discussion est sous les yeux.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { MESSAGE_MAX, heureDuMessage } from "../../../lib/alliance/discussion";
import type { MessageAlliance } from "../../../lib/alliance/types";
import { call } from "../../../lib/compte/api";
import { Problem, messageOf, useNow } from "../../compte/common";

/** Un message retiré ne revient pas : le retrait part au second clic. */
function Retirer({ nom, onConfirm }: { nom: string; onConfirm: () => void }) {
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
      aria-label={arme ? `Confirmer le retrait du message de ${nom}` : `Retirer le message de ${nom}`}
    >
      {arme ? "confirmer le retrait" : "retirer"}
    </button>
  );
}

export default function AllianceMessages({ messages, erreurLecture, relire }: { messages: MessageAlliance[] | null; erreurLecture: string | null; relire: () => Promise<void> }) {
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = useRef<HTMLOListElement>(null);
  const enBas = useRef(true);
  const maintenant = useNow();

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
      setErreur(messageOf(e));
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
      setErreur(messageOf(e));
    }
  };

  return (
    <div class="alliance-discussion" data-testid="alliance-messages">
      {messages === null && (
        <p class="text-muted" role="status">
          Lecture des messages…
        </p>
      )}
      <ol class="alliance-fil" ref={liste} aria-label="Messages de l'alliance" tabIndex={0}>
        {(messages ?? []).map((m) => (
          <li key={m.id} class={m.mine ? "est-mien" : undefined}>
            <p class="alliance-auteur">
              <strong>
                [{m.tag}] {m.name}
              </strong>
              {m.staff && <span class="alliance-marque">encadrement</span>}
              <time dateTime={m.at} class="text-muted">
                {heureDuMessage(m.at, maintenant)}
              </time>
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
          Votre message
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
            Envoyer
          </button>
          <span class="carte-aide tnum" aria-live="polite">
            {texte.length > MESSAGE_MAX - 50 ? `${MESSAGE_MAX - texte.length} caractères restants` : ""}
          </span>
        </div>
        <Problem message={erreur} />
      </form>
      <p class="carte-aide">Lue par les Gaulois et les alliés invités ; effacée au bout de 30 jours.</p>
    </div>
  );
}
