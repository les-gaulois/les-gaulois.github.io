/**
 * L'envoi de la course du soir, sur le même salon que la gazette : le titre, le score et les écarts, les points, l'image et un bouton
 * vers le classement. Le message ne peut mentionner personne, et le tag d'un autre clan ne peut rien y mettre en forme.
 * L'envoi est celui de `discord-post.ts` : l'image d'abord, le texte seul si elle ne se dessine pas ou si Discord la refuse.
 */
import { readingNote, readingWhen } from "./alerts";
import { COURSE_TITLE, markCourseSent, periodWords, placeLine, planCourse, pointsWords, POINTS_NOTE, raceParts, scoreLine, type CourseInputs, type CourseState, type EveningRace } from "./course-soir";
import { postWithImage } from "./discord-post";
import { fmtRank, fmtScore } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";

const discordTag = (tag: string | null) => (tag === null ? "un clan supprimé" : `[${escapeDiscord(tag)}]`);
const sentence = (part: string) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`;
const BUTTON = "Voir le classement";

/** Le message. `image` : le fichier joint et sa description ; sans lui, le message part en texte, avec un lien à la place du bouton. */
export function coursePayload(race: EveningRace, tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  const { reading, points, changes } = race;
  const content = [
    `**${COURSE_TITLE} : ${placeLine(reading, escapeDiscord(tag))}**`,
    [`${scoreLine(reading, changes.score)}.`, ...raceParts(race, discordTag).map(sentence)].join(" "),
    `Points gagnés ${periodWords(points)} : **+${fmtScore(points.total.points)}**. À plusieurs : ${pointsWords(points.group)}. Seul sous le tag : ${pointsWords(points.solo)}.`,
    `[${BUTTON} sur le site](<${site}/classement>)`,
    `-# ${readingWhen(reading)}. ${readingNote("rank")}. ${POINTS_NOTE}`,
  ].join("\n");
  const base = { content, avatar_url: `${site}/generated/icon-192.png`, allowed_mentions: { parse: [] } };
  if (!image) return base;
  return {
    ...base,
    attachments: [{ id: 0, filename: image.filename, description: image.alt }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: BUTTON, url: `${site}/classement` }] }],
  };
}

export interface CourseSendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl`. */
  link: string;
  race: EveningRace;
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: (race: EveningRace) => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le message, avec l'image d'abord : voir `postWithImage`. Un échec se retente au passage suivant, avant 23 h. */
export function sendCourse({ link, race, renderImage, tag, siteUrl, fetch, log }: CourseSendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Course",
    text: coursePayload(race, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage(race);
      const filename = "course-du-soir.png";
      return { payload: coursePayload(race, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}

export interface CoursePassDeps extends CourseInputs {
  /** Envoie le message. `true` : Discord l'a accepté. */
  send: (race: EveningRace) => Promise<boolean>;
  log: (line: string) => void;
}

export interface CoursePassResult {
  /** L'état à écrire. `null` : rien n'a changé, rien à écrire. */
  state: CourseState | null;
  /** Un message devait partir et Discord ne l'a pas accepté. */
  failed: boolean;
}

/** Un passage du robot : décide, envoie au besoin, et rend l'état à noter. Rien n'est noté avant un envoi accepté. */
export async function coursePass({ send, log, ...inputs }: CoursePassDeps): Promise<CoursePassResult> {
  const plan = planCourse(inputs);
  if (!plan.race) {
    log(`Course : rien à envoyer (${plan.reason}).`);
    return { state: null, failed: false };
  }
  if (!(await send(plan.race))) return { state: null, failed: true };
  const { reading, points } = plan.race;
  log(`Course : ${fmtRank(reading.rank)} du classement, +${fmtScore(points.total.points)} points ${periodWords(points)}, envoyée.`);
  return { state: markCourseSent(plan.race, inputs.now), failed: false };
}
