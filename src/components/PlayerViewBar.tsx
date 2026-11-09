import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, call, mayHaveSession } from "../lib/compte/api";
import type { Me } from "../lib/compte/types";
import { keepsPlayerView, setPlayerView, takeOpenedHere } from "../lib/compte/vue-joueur";
import { usePlayerView } from "./compte/common";

/** Quand la bande disparaît, le focus revient au bouton qui l'avait ouverte, sinon au lien Direction de l'en-tête. */
function focusAfterLeaving() {
  (document.querySelector<HTMLElement>("[data-player-view-start]") ?? document.querySelector<HTMLElement>("[data-direction-link]"))?.focus();
}

/**
 * La bande de la vue joueur, en haut de chaque page : elle rappelle que le site s'affiche comme pour un membre
 * sans grade, et permet d'en sortir. Elle ne se montre qu'à l'encadrement, d'après le serveur ; s'il ne répond pas, elle reste,
 * pour qu'on puisse toujours sortir de cette vue. Hors de la vue joueur, rien n'est chargé.
 * Elle n'a qu'un rôle d'affichage : le serveur garde le vrai rôle et revérifie chaque action.
 */
export default function PlayerViewBar() {
  const on = usePlayerView();
  const [shown, setShown] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    if (!mayHaveSession()) {
      // Personne n'est connecté ici : il n'y a plus de vue à quitter.
      setPlayerView(false);
      return;
    }
    let live = true;
    const decide = (answer: Me | { error: string }) => {
      if (!live) return;
      const keep = keepsPlayerView(answer);
      setShown(keep);
      if (!keep) setPlayerView(false);
    };
    call<Me>("get_me")
      .then(decide)
      .catch((e: unknown) => decide({ error: e instanceof ServerError ? e.code : "network" }));
    return () => {
      live = false;
    };
  }, [on]);

  useEffect(() => {
    if (!on || !shown || !takeOpenedHere()) return;
    // Ouverte d'ici : le bouton cliqué vient de disparaître et le focus s'est perdu. Jamais repris à un champ.
    const active = document.activeElement;
    if (active === null || active === document.body) text.current?.focus();
  }, [on, shown]);

  if (!on || !shown) return null;

  return (
    <div class="border-b-2 border-red bg-surface-2" data-testid="player-view-bar">
      <div class="wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <p ref={text} tabIndex={-1} class="text-sm">
          <strong>Vue joueur</strong> : le site s'affiche comme pour un membre sans grade. Votre rôle ne change pas.
        </p>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-testid="player-view-leave"
          onClick={() => {
            setPlayerView(false);
            // Après le nouveau rendu des autres éléments de la page, qui retrouvent leur vue normale.
            setTimeout(focusAfterLeaving, 0);
          }}
        >
          Quitter la vue joueur
        </button>
      </div>
    </div>
  );
}
