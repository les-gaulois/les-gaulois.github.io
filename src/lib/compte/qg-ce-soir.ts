/**
 * L'onglet « Ce soir » du QG : la bande des douze heures, qui sert à la fois à choisir son heure et à voir qui vient.
 * Rien n'est deviné : chaque nombre est celui que donne le serveur (`get_qg_tools`, `plans`), une heure sans annonce
 * compte zéro Gaulois, et la part d'une barre n'est que ce nombre rapporté à l'heure la plus remplie.
 *
 * Le serveur ne donne qu'une ligne par heure, et jamais moins de membres que de visages : ce qui suit ne sert que si sa
 * réponse se contredit. Deux lignes pour la même heure (« +00:00 » et « Z ») n'en font qu'une, leurs nombres additionnés
 * comme dans le nombre de l'onglet (`othersPlanned`). Le nombre d'une heure n'est jamais plus petit que ce que la réponse
 * en montre : ses visages, et le membre lui-même si c'est son heure.
 */
import { counted } from "./qg";
import { liveHours, liveMine, peakHour, planChoices, planLabel, sameHour, type PlanHour, type QgTools } from "./outils";

/** La couleur d'une heure, celle des pastilles de `direction-kit.tsx` : jamais seule, chaque heure marquée porte son mot. */
export type PlanTon = "ok" | "warn" | "ally" | "muted";

/** Le moins de Gaulois pour « le plus de monde » (la règle de `peakHour`), et la plus petite mesure des barres. */
export const PLAN_PEAK_MIN = 2;

export interface PlanSlot {
  /** L'heure pile, en temps universel : ce qui part au serveur. */
  at: string;
  /** « Maintenant » ou « 21 h ». */
  label: string;
  /** L'heure en cours, la première de la bande. */
  current: boolean;
  /** Le même nom que l'heure d'avant : la nuit du passage à l'heure d'hiver, « 2 h » revient, à l'heure d'hiver. */
  again: boolean;
  /** Proposée dans la bande. Faux : une heure annoncée au-delà des douze (deux horloges décalées), qui ne se choisit pas ici. */
  proposed: boolean;
  /** Les Gaulois annoncés à cette heure ; 0 : personne ne l'a annoncée. */
  count: number;
  /** Ceux qui se montrent sur le mur. */
  faces: PlanHour["faces"];
  /** L'heure du membre. */
  mine: boolean;
  /** L'heure où il y a le plus de monde : au moins deux Gaulois, la plus proche en cas d'égalité (`peakHour`). */
  peak: boolean;
  /**
   * La hauteur de la barre, de 0 à 1 : le nombre de l'heure rapporté à celui de l'heure la plus remplie, et jamais à moins
   * de deux. Un Gaulois seul ne remplit pas sa barre : une barre pleine dit « le plus de monde », ou autant.
   */
  share: number;
  /** Vert : mon heure. Jaune : le plus de monde. Bleu : des Gaulois viennent. Gris : personne. */
  ton: PlanTon;
}

/**
 * Les douze heures proposées, chacune avec ce que le serveur en dit, puis, s'il y en a, les heures annoncées au-delà
 * (`proposed` faux) : leurs Gaulois ne disparaissent pas. Une heure finie n'y est plus, même page ouverte.
 */
export function planBand(plans: QgTools["plans"], now: Date): PlanSlot[] {
  const mine = liveMine(plans.mine, now);
  // Une entrée par heure : les douze proposées, puis celles du serveur (ou la mienne) qui n'y sont pas, dans l'ordre.
  const band: PlanHour[] = planChoices(now).map((at) => ({ at, count: 0, faces: [] }));
  const beyond: PlanHour[] = [];
  const entryOf = (at: string) => {
    let entry = band.find((other) => sameHour(other.at, at)) ?? beyond.find((other) => sameHour(other.at, at));
    if (!entry) beyond.push((entry = { at, count: 0, faces: [] }));
    return entry;
  };
  for (const hour of liveHours(plans.hours, now)) {
    const entry = entryOf(hour.at);
    entry.count += Math.max(0, hour.count);
    entry.faces = [...entry.faces, ...hour.faces];
  }
  if (mine !== null) entryOf(mine);
  beyond.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const entries = [...band, ...beyond];
  for (const entry of entries) entry.count = Math.max(entry.count, entry.faces.length, sameHour(entry.at, mine) ? 1 : 0);

  const peak = peakHour(entries);
  const scale = Math.max(PLAN_PEAK_MIN, ...entries.map((entry) => entry.count));
  const labels = entries.map((entry) => planLabel(entry.at, now));
  return entries.map((entry, i) => {
    const isMine = sameHour(entry.at, mine);
    const isPeak = peak !== null && sameHour(entry.at, peak.at);
    return {
      at: entry.at,
      label: labels[i]!,
      current: i === 0,
      again: i > 0 && labels[i - 1] === labels[i],
      proposed: i < band.length,
      count: entry.count,
      faces: entry.faces,
      mine: isMine,
      peak: isPeak,
      share: entry.count / scale,
      ton: isMine ? "ok" : isPeak ? "warn" : entry.count > 0 ? "ally" : "muted",
    };
  });
}

/** Quand, dans une phrase : « maintenant », « à 21 h », « à 2 h, heure d'hiver ». */
export function planWhen(slot: Pick<PlanSlot, "label" | "current" | "again">): string {
  return slot.current ? "maintenant" : `à ${slot.label}${slot.again ? ", heure d'hiver" : ""}`;
}

/**
 * Le nom du bouton d'une heure, en une phrase pour qui écoute : « 21 h, 6 Gaulois, votre heure, le plus de monde ».
 * L'écran montre les mêmes choses en plus court (« moi », « le plus ») ; l'heure vient d'abord, telle qu'on la voit, pour
 * la dire à voix haute. Une heure sans annonce ne dit que son nom, comme à l'écran. L'heure choisie se dit aussi par
 * `aria-pressed`.
 */
export function planSpoken(slot: Pick<PlanSlot, "label" | "again" | "count" | "mine" | "peak">): string {
  const parts = [slot.label];
  if (slot.again) parts.push("heure d'hiver");
  if (slot.count > 0) parts.push(counted(slot.count, "Gaulois", "Gaulois"));
  if (slot.mine) parts.push("votre heure");
  if (slot.peak) parts.push("le plus de monde");
  return parts.join(", ");
}

/** Les visages montrés d'emblée sur la ligne d'une heure ; les suivants se déplient. */
export const PLAN_FACES_SHOWN = 8;

/**
 * Les visages d'une heure, en deux parts : ceux de la ligne, puis ceux qui se déplient. On ne replie pas pour un ou deux
 * visages : le repli prendrait autant de place qu'eux.
 */
export function planFaces<T>(faces: readonly T[], shown = PLAN_FACES_SHOWN): { first: T[]; rest: T[] } {
  if (faces.length <= shown + 2) return { first: [...faces], rest: [] };
  return { first: faces.slice(0, shown), rest: faces.slice(shown) };
}
