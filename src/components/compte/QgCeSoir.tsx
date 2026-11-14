import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { counted } from "../../lib/compte/qg";
import { planOthersLabel, type QgTools } from "../../lib/compte/outils";
import { planBand, planFaces, planSpoken, planWhen } from "../../lib/compte/qg-ce-soir";
import { Avatar, Problem, useNow } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/**
 * « Ce soir je joue » : chacun dit à quelle heure il compte jouer, l'heure en cours ou l'une des onze suivantes. Un second
 * clic sur son heure la retire. Une seule bande de douze heures sert à choisir et à voir : chaque heure porte son nombre de
 * Gaulois et une barre à sa mesure, en vert la mienne (« moi »), en jaune celle où il y a le plus de monde (« le plus »),
 * en bleu celles où des Gaulois viennent. Dessous, une ligne par heure où des membres se montrent sur le mur ; les autres
 * sont seulement comptés. Une heure passée disparaît d'elle-même. Le serveur vérifie tout (`set_play_plan`) et l'écran ne
 * montre que sa réponse, relue après chaque choix. Les calculs sont dans `src/lib/compte/qg-ce-soir.ts`, le dessin dans
 * `global.css`, section « Le QG, onglet Ce soir ».
 */
export default function QgCeSoir({ plans, busy, problem, onChoose }: { plans: QgTools["plans"]; busy: boolean; problem: string | null; onChoose: (at: string | null) => void }) {
  const now = useNow(60_000);
  // Une heure finie s'efface même si la page reste ouverte : le serveur ne l'efface qu'à la lecture suivante.
  const slots = planBand(plans, now);
  const band = slots.filter((slot) => slot.proposed);
  const mine = slots.find((slot) => slot.mine);
  const peak = slots.find((slot) => slot.peak);
  // Une heure annoncée au-delà de la bande (deux horloges décalées) a sa ligne même sans visage : c'est là qu'elle se compte.
  const shown = slots.filter((slot) => slot.faces.length > 0 || (!slot.proposed && slot.count > 0));

  // L'heure envoyée, marquée tant que le serveur n'a pas répondu. Les boutons restent focalisables (`aria-disabled`).
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => {
    if (!busy) setSending(null);
  }, [busy]);

  // Quand l'heure en cours finit, son bouton quitte la bande : s'il avait le focus, celui-ci passe à la nouvelle heure en
  // cours au lieu de retomber en haut de la page. Le bouton qui a le focus est relevé avant que la bande ne change.
  const group = useRef<HTMLDivElement>(null);
  const active = group.current ? document.activeElement : null;
  const focusedAt = active && group.current?.contains(active) ? ((active as HTMLElement).dataset["at"] ?? null) : null;
  const first = band[0]?.at;
  useLayoutEffect(() => {
    const root = group.current;
    if (focusedAt === null || !root || root.querySelector(`[data-at="${focusedAt}"]`)) return;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    root.querySelector<HTMLButtonElement>("button")?.focus();
    // Seul le changement de la première heure retire un bouton de la bande.
  }, [first]);

  return (
    <section class="qg-ce-soir" aria-labelledby="ce-soir-titre" data-testid="qg-ce-soir">
      <PartieTete id="ce-soir-titre" title="Ce soir je joue">
        {(mine || peak) && (
          <p class="qg-ce-soir-resume tnum">
            {mine && (
              <Pastille ton="ok" testid="qg-ce-soir-mien">
                Mon heure : {mine.label.toLocaleLowerCase("fr")}
              </Pastille>
            )}
            {peak && (
              <Pastille ton="warn" testid="qg-ce-soir-pic">
                Le plus de monde : {peak.label.toLocaleLowerCase("fr")}, {counted(peak.count, "Gaulois", "Gaulois")}
              </Pastille>
            )}
          </p>
        )}
      </PartieTete>

      <div class="qg-ce-soir-cadre">
        <div
          ref={group}
          class="qg-ce-soir-bande"
          role="group"
          aria-label="Votre heure de jeu. Un clic choisit une heure, un second clic la retire."
          data-testid="qg-ce-soir-heures"
        >
          {band.map((slot) => (
            <button
              key={slot.at}
              type="button"
              class="qg-ce-soir-heure"
              data-at={slot.at}
              data-dir-ton={slot.ton}
              data-maintenant={slot.current ? "" : undefined}
              data-envoi={busy && sending === slot.at ? "" : undefined}
              aria-pressed={slot.mine}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy) return;
                setSending(slot.at);
                onChoose(slot.mine ? null : slot.at);
              }}
            >
              {/* Pour qui écoute, une phrase (`planSpoken`) : « 21 h, 6 Gaulois, votre heure, le plus de monde ». Elle commence par
                  l'heure telle qu'on la voit, qu'on peut dire pour cliquer à la voix ; ce qu'on voit, plus court, ne se lit
                  pas en double. La feuille de style pose la barre au-dessus de l'heure. */}
              <span class="sr-only">{planSpoken(slot)}</span>
              <span class="qg-ce-soir-nom tnum" aria-hidden="true">
                {slot.label}
              </span>{" "}
              <span class="qg-ce-soir-jauge" aria-hidden="true">
                {slot.count > 0 && <span class="qg-ce-soir-nombre tnum">{slot.count}</span>}
                <span class="qg-ce-soir-barre" style={{ "--part": slot.share.toFixed(3) }} />
              </span>{" "}
              <span class="qg-ce-soir-mots" aria-hidden="true">
                {slot.mine && <span data-dir-ton="ok">moi</span>}
                {slot.mine && slot.peak && " "}
                {slot.peak && <span data-dir-ton="warn">le plus</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Problem message={problem} />

      {shown.length > 0 && (
        <ul class="dir-liste qg-ce-soir-qui" data-testid="qg-ce-soir-liste">
          {shown.map((slot) => {
            const others = planOthersLabel(slot.count, slot.faces.length);
            const { first: firstFaces, rest } = planFaces(slot.faces);
            const face = (member: (typeof slot.faces)[number], i: number) => (
              <li key={i}>
                <Avatar name={member.name} avatar={member.avatar} />
                <span>{member.name}</span>
              </li>
            );
            return (
              <li key={slot.at} class="dir-ligne" data-dir-ton={slot.ton}>
                <p class="qg-ce-soir-qui-tete">
                  <span class="qg-ce-soir-qui-heure tnum">{slot.label}</span>
                  <span class="tnum text-muted">{counted(slot.count, "Gaulois", "Gaulois")}</span>
                </p>
                {(slot.mine || slot.peak) && (
                  <p class="qg-ce-soir-qui-mots">
                    {slot.mine && (
                      <Pastille ton="ok" plain>
                        Mon heure
                      </Pastille>
                    )}
                    {slot.peak && (
                      <Pastille ton="warn" plain>
                        Le plus de monde
                      </Pastille>
                    )}
                  </p>
                )}
                {firstFaces.length > 0 && (
                  <ul class="qg-ce-soir-visages" aria-label={`Ils jouent ${planWhen(slot)}`}>
                    {firstFaces.map(face)}
                    {rest.length === 0 && others && <li class="tnum text-muted">{others}</li>}
                  </ul>
                )}
                {rest.length > 0 && (
                  <details class="fold qg-ce-soir-suite" data-testid="qg-ce-soir-suite">
                    <summary class="tnum">{counted(rest.length, "autre visage", "autres visages")}</summary>
                    <ul class="qg-ce-soir-visages" aria-label={`Ils jouent aussi ${planWhen(slot)}`}>
                      {rest.map(face)}
                      {others && <li class="tnum text-muted">{others}</li>}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
