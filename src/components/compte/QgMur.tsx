import { basePath } from "../../lib/compte/api";
import { ggPodium, type QgTools, type WallMember } from "../../lib/compte/outils";
import type { Face, QgData } from "../../lib/compte/qg";
import { ROLE_LABELS } from "../../lib/compte/types";
import { fmtInt } from "../../lib/format";
import { Avatar, Problem } from "./common";
import { PartieTete } from "./Onglets";

const roleNote = (face: Face) => (face.role === "member" ? null : ROLE_LABELS[face.role]);

/** Le nom, le rôle et, s'il y en a, les GG de la semaine d'un membre du mur. */
function Who({ face, gg }: { face: Face; gg?: number }) {
  return (
    <div class="min-w-0 flex-1">
      <p class="font-semibold [overflow-wrap:anywhere]">{face.name}</p>
      {roleNote(face) && <p class="text-sm text-muted">{roleNote(face)}</p>}
      {gg !== undefined && gg > 0 && <p class="tnum text-sm text-muted">{fmtInt(gg)} GG</p>}
    </div>
  );
}

/**
 * Le mur des membres : ceux qui choisissent de se montrer, les plus remerciés de la semaine (GG), et les parrains. Un GG
 * remercie un membre du mur pour la semaine, un seul par membre remercié ; le site n'en montre que le nombre, jamais qui
 * remercie qui. Être parrain montre son pseudo Discord aux membres validés, pour qu'un nouveau puisse écrire : le texte le
 * dit avant le choix. La photo d'un parrain, dont l'adresse contient son identifiant Discord, ne vient que s'il se montre. Sans les outils (`tools` à `null`, serveur d'avant la migration), le mur reste celui de `get_qg`.
 */
export default function QgMur({
  data,
  tools,
  busy,
  problemAt,
  onVisible,
  onGg,
  onMentor,
}: {
  data: QgData;
  tools: QgTools | null;
  busy: boolean;
  problemAt: (at: string) => string | null;
  onVisible: (on: boolean) => void;
  onGg: (member: WallMember) => void;
  onMentor: (on: boolean) => void;
}) {
  const base = basePath();
  const podium = tools ? ggPodium(tools.wall) : [];

  return (
    <section aria-labelledby="mur-titre" data-testid="qg-wall">
      <PartieTete id="mur-titre" title="Le mur des membres">
        {data.wall.length > 0 && (
          <p class="tnum" data-testid="qg-wall-count">
            {fmtInt(data.wall.length)} sur {fmtInt(data.members)} membres reconnus {data.wall.length > 1 ? "se montrent" : "se montre"}.
          </p>
        )}
      </PartieTete>

      {podium.length > 0 && (
        <div class="card mt-6 max-w-4xl p-5" data-testid="qg-gg-podium">
          <h3 class="text-lg">Les plus remerciés de la semaine</h3>
          <ol class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {podium.map((member) => (
              <li key={member.number} class="flex items-center gap-3">
                <Avatar name={member.name} avatar={member.avatar} large />
                <Who face={member} gg={member.gg} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {tools && (
        <section class="mt-6 max-w-4xl" aria-labelledby="parrains-titre" data-testid="qg-parrains">
          <h3 id="parrains-titre" class="text-xl">
            Les parrains
          </h3>
          {tools.mentors.length > 0 && (
            <ul class="mt-4 grid gap-3 sm:grid-cols-2" data-testid="qg-parrains-liste">
              {tools.mentors.map((mentor, i) => (
                <li key={i} class="card flex items-center gap-3 p-4">
                  <Avatar name={mentor.name} avatar={mentor.avatar} large />
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold [overflow-wrap:anywhere]">{mentor.mine ? `${mentor.name} (vous)` : mentor.name}</p>
                    {mentor.discord && <p class="text-sm text-muted [overflow-wrap:anywhere]">Discord : {mentor.discord}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div class="card mt-4 p-5">
            <button type="button" class="chip" aria-pressed={tools.me.mentor} aria-disabled={busy || undefined} data-testid="qg-parrain" onClick={() => !busy && onMentor(!tools.me.mentor)}>
              Je peux aider les nouveaux
            </button>
            <p class="mt-3 text-sm text-muted">
              {tools.me.mentor ? "Les membres validés voient votre nom, votre rôle et votre pseudo Discord." : "Si vous l'activez, les membres validés verront votre nom, votre rôle et votre pseudo Discord."}
            </p>
            <Problem message={problemAt("mentor")} />
          </div>
        </section>
      )}

      <div class="card mt-6 max-w-4xl p-5" data-testid="qg-visibility">
        <button type="button" class="chip" aria-pressed={data.me.visible} aria-disabled={busy || undefined} data-testid="qg-visible" onClick={() => !busy && onVisible(!data.me.visible)}>
          Me montrer aux autres membres
        </button>
        {/* Le détail, dont l'identifiant Discord que contient l'adresse de la photo, est sur la page de confidentialité. */}
        <p class="mt-3 text-sm text-muted">
          {data.me.visible
            ? "Les membres validés voient votre nom, votre rôle et votre photo Discord."
            : "Si vous l'activez, les membres validés verront votre nom, votre rôle et votre photo Discord, dont l'adresse contient votre identifiant Discord."}{" "}
          <a href={`${base}/confidentialite#avec-un-compte`}>Détails</a>
        </p>
        <Problem message={problemAt("me")} />
      </div>

      {tools && tools.wall.length > 0 ? (
        <>
          <ul class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="qg-wall-list">
            {tools.wall.map((member) => (
              <li key={member.number} class="card flex items-center gap-3 p-4">
                <Avatar name={member.name} avatar={member.avatar} large />
                <Who face={member} gg={member.gg} />
                {member.number !== tools.me.number && (
                  <button type="button" class="chip" aria-pressed={member.given} aria-disabled={busy || undefined} aria-label={`GG à ${member.name}`} data-testid="qg-gg" onClick={() => !busy && onGg(member)}>
                    GG
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Problem message={problemAt("gg")} />
        </>
      ) : (
        data.wall.length > 0 && (
          <ul class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="qg-wall-list">
            {data.wall.map((face, i) => (
              <li key={i} class="card flex items-center gap-3 p-4">
                <Avatar name={face.name} avatar={face.avatar} large />
                <Who face={face} />
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
