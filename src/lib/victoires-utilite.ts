/**
 * Le second message d'une victoire, dans le salon des victoires : le score d'utilité des Gaulois de la partie, une seconde
 * après l'image de la victoire (demande du pilote, 17 novembre 2026 : « un embed de la victoire et, 1 seconde après, un embed
 * du score utilité des membres gaulois de la game gagnée », puis « que les deux messages soient toujours bien envoyés »).
 *
 * Le score est celui de « Revoir une partie », sans rien y changer : le même calcul (`rejeu/bilan.ts`, `scoresDuBilan`), sur
 * les mêmes nombres. La fiche de la partie, déjà lue pour le message de la victoire, donne l'or, les attaques et les prises
 * que le jeu y écrit ; le rejeu fait pour la carte de fin (`scripts/rejouer-victoires.ts`) donne les dons, que le moteur du jeu
 * annonce. Les Gaulois sont ceux du bilan du site : les joueurs au tag du clan qui ont des stats, nommés par leur pseudo public
 * de la liste du clan, sinon par le pseudo porté dans la partie. Le même score se lit donc sur Discord et, une heure plus
 * tard, sur la page de la partie.
 *
 * Sans rejeu, les dons ne sont pas connus : pas de score, ce n'est pas « aucun don ». Seul Gaulois de la partie : pas de
 * score non plus, il n'y a personne à qui le comparer. Rien n'est estimé. Ni score ni nom ne sont écrits dans `data/` : l'état des
 * envois n'y note que la partie, son début, le nombre d'essais et si le score est réglé.
 * Quand le message part, et ce qui se passe s'il ne part pas : `victoires.ts` (`sendUtility`).
 */
import { z } from "zod";
import { imageMessage, postWithImage, textMessage } from "./discord-post";
import { fmtInt } from "./format";
import { escapeDiscord, type RenderedImage } from "./gazette-discord";
import { mapLabel } from "./map-names";
import { MAX_CONTENT } from "./paliers-franchis-discord";
import { AXES, bilanDeLaPartie, NOM_DE_L_AXE, rangsDesScores, scoresDuBilan, TITRE_DE_L_AXE, type Axe, type Bilan } from "./rejeu/bilan";
import { nomsPubliables } from "./rejeu/film-brut";
import { pseudoEnPartie } from "./rejeu/journal";
import { siteLink } from "./salon-discord";
import type { StoredMembers } from "./schemas";
import { revoirLaPartie, victoryTitle } from "./victoires-discord";

/** La page du classement général, où mène le second bouton. */
export const PAGE_DES_UTILES = "/utiles";
export const TITRE_DE_L_UTILITE = "Les plus utiles";
/** Ce que vaut 100, et ce que le score ne mesure pas : dit sur l'image, dans sa description et dans le texte de secours. */
export const NOTE_DE_LA_MOYENNE = "100 d'utilité : la part moyenne d'un Gaulois de la partie.";
export const NOTE_DES_LIMITES = "La place de départ, les dons reçus et une élimination précoce pèsent sur ce score.";
/** Un Gaulois dont aucun nom ne peut s'écrire : comme sur la page de la partie. */
export const SANS_NOM = "Un Gaulois";

/** La partie dont le score est annoncé : ce que l'en-tête de l'image et les boutons en disent. */
export interface PartieDeLUtilite {
  id: string;
  /** Le début de la partie. */
  start: string;
  /** La carte, comme le jeu la nomme. */
  map: string;
}

/**
 * Les joueurs de la fiche de la partie, comme les lit le film de « Revoir une partie » (`scripts/filmer-parties.ts`) : de quoi
 * reconnaître les Gaulois, les nommer, et lire leurs stats. Rien n'en est gardé au-delà du calcul.
 */
const JoueursDeLaFiche = z.object({
  info: z.object({
    players: z.array(z.object({ clientID: z.string().nullish(), publicID: z.string().nullish(), clanTag: z.string().nullish(), username: z.string().max(200).nullish(), stats: z.unknown().optional() })).max(5_000),
  }),
});

/** Les pseudos publics de la liste du clan, par identifiant public. Un anonyme de la liste n'y est pas. */
function pseudosDuClan(members: StoredMembers | null): Map<string, string> {
  return new Map((members?.members ?? []).flatMap((m) => (m.publicId && m.username ? [[m.publicId, m.username] as const] : [])));
}

/**
 * Le bilan des Gaulois d'une victoire, d'après la description laissée par le rejeu (`metaTexte`) et la fiche de la partie
 * telle que l'API la donne (`fiche`). Les mêmes entrées que le film du site, pour le même bilan. `null` : pas de bilan (rejeu
 * sans les faits, aucun Gaulois avec des stats). Lève une erreur, en mots, si la fiche ou la description ne conviennent pas.
 */
export function bilanDeLaVictoire(metaTexte: string, fiche: unknown, partie: string, members: StoredMembers | null, tag: string, tagsOfficiels: readonly string[]): Bilan | null {
  const lue = JoueursDeLaFiche.safeParse(fiche);
  if (!lue.success) throw new Error("joueurs de la fiche au format inattendu");
  const joueurs = lue.data.info.players;
  const clients = new Set(joueurs.filter((p) => p.clanTag === tag && p.clientID && p.stats !== undefined && p.stats !== null).map((p) => p.clientID!));
  const pseudos = new Map<string, string>();
  for (const p of joueurs) {
    const porte = p.clientID ? pseudoEnPartie(p.username) : null;
    if (porte !== null) pseudos.set(p.clientID!, porte);
  }
  const stats = new Map(joueurs.flatMap((p) => (p.clientID ? [[p.clientID, p.stats] as const] : [])));
  return bilanDeLaPartie(metaTexte, { partie, clients, noms: nomsPubliables(joueurs, pseudosDuClan(members), tagsOfficiels), pseudos, stats });
}

/** Un Gaulois de la partie et son score, tel que le message l'écrit. */
export interface LigneDUtilite {
  /** Son rang dans la partie : le même à utilité égale. */
  rang: number;
  /** Son pseudo public, ou le pseudo porté dans la partie ; `null` : aucun nom écrivable. */
  nom: string | null;
  /** L'identifiant public du membre au pseudo public, pour son Gaulois du village. `null` : pas de Gaulois à dessiner. */
  id: string | null;
  /** 100 : la part moyenne d'un Gaulois de la partie. */
  utilite: number;
  /** Chaque axe à la même échelle ; `null` : rien à partager sur cet axe dans cette partie. */
  axes: Record<Axe, number | null>;
  /** Les axes où il est seul premier : Trésorier, Fer de lance, Ravitailleur. */
  titres: Axe[];
}

/** Le pseudo d'un membre, comme `nomsPubliables` l'écrit dans le bilan. */
const ecrit = (pseudo: string) => pseudo.replace(/\s+/g, " ").trim().slice(0, 40);

/**
 * Les lignes du message, le plus utile d'abord ; à égalité, l'ordre du bilan. `null` : la partie n'a pas de score (un seul
 * Gaulois, ou rien à partager sur aucun axe). Le Gaulois du village n'est donné qu'à un pseudo public qui désigne un seul
 * membre de la liste, écrit une seule fois dans la partie.
 */
export function lignesDUtilite(bilan: Bilan, members: StoredMembers | null): LigneDUtilite[] | null {
  const scores = scoresDuBilan(bilan.gaulois);
  const rangs = rangsDesScores(scores);
  const membres = (members?.members ?? []).flatMap((m) => (m.publicId && m.username ? [{ id: m.publicId, nom: ecrit(m.username) }] : []));
  const n = bilan.gaulois.length;
  const lignes = bilan.gaulois.flatMap((g, i): LigneDUtilite[] => {
    const s = scores[i]!;
    const rang = rangs[i];
    if (s.utilite === null || rang === null || rang === undefined) return [];
    const memes = g.nom !== null && !g.enPartie ? membres.filter((m) => m.nom === g.nom) : [];
    const seul = memes.length === 1 && bilan.gaulois.filter((x) => x.nom === g.nom && !x.enPartie).length === 1;
    const axe = (a: Axe) => (s.parts[a] === null ? null : Math.round(s.parts[a] * n * 100));
    return [{ rang, nom: g.nom, id: seul ? memes[0]!.id : null, utilite: s.utilite, axes: { economie: axe("economie"), combat: axe("combat"), soutien: axe("soutien") }, titres: [...s.titres] }];
  });
  if (lignes.length === 0) return null;
  // Le tri garde l'ordre du bilan à utilité égale.
  return lignes.sort((a, b) => b.utilite - a.utilite);
}

/** « économie 107, combat 154, soutien 175 » : seulement les axes comptés. */
export function axesEnMots(ligne: LigneDUtilite): string {
  return AXES.flatMap((a) => (ligne.axes[a] === null ? [] : [`${NOM_DE_L_AXE[a].toLocaleLowerCase("fr")} ${fmtInt(ligne.axes[a])}`])).join(", ");
}

/** « Trésorier, Fer de lance » ; vide sans titre. */
export const titresEnMots = (ligne: LigneDUtilite) => ligne.titres.map((a) => TITRE_DE_L_AXE[a]).join(", ");

/** « Victoire de [GAL] sur la carte Détroits Danois ». */
export const partieEnMots = (partie: PartieDeLUtilite, tag: string) => `${victoryTitle(tag)} sur la carte ${mapLabel(partie.map)}`;

/**
 * Le texte de secours, si l'image ne se dessine pas : chaque Gaulois, son utilité et ses trois axes. Il ne peut mentionner
 * personne, et un nom ne peut ni le mettre en forme ni y glisser un lien. Au-delà de ce que Discord accepte, les derniers
 * sont comptés.
 */
export function utilityContent(partie: PartieDeLUtilite, lignes: readonly LigneDUtilite[], tag: string, siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, "");
  const build = (written: number) => {
    const rest = lignes.length - written;
    return [
      `**${TITRE_DE_L_UTILITE}** · ${escapeDiscord(partieEnMots(partie, tag))}`,
      ...lignes.slice(0, written).map((l) => {
        const axes = axesEnMots(l);
        const titres = titresEnMots(l);
        return `${l.rang}. **${escapeDiscord(l.nom ?? SANS_NOM)}** · ${fmtInt(l.utilite)} d'utilité${axes ? ` (${axes})` : ""}${titres ? ` · ${titres}` : ""}`;
      }),
      ...(rest > 0 ? [`… et ${fmtInt(rest)} ${rest > 1 ? "autres Gaulois" : "autre Gaulois"}`] : []),
      `[Revoir la partie](<${revoirLaPartie(site, partie.id)}>) · [${TITRE_DE_L_UTILITE}](<${siteLink(site, PAGE_DES_UTILES)}>)`,
      `-# ${NOTE_DE_LA_MOYENNE} ${NOTE_DES_LIMITES}`,
    ].join("\n");
  };
  let written = lignes.length;
  while (written > 0 && build(written).length > MAX_CONTENT) written--;
  return build(written);
}

/** Le message : l'image et deux boutons, sans texte ; sans image, le secours en texte. */
export function utilityPayload(partie: PartieDeLUtilite, lignes: readonly LigneDUtilite[], tag: string, siteUrl: string, image: { alt: string; filename: string } | null): Record<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  if (!image) return textMessage(site, utilityContent(partie, lignes, tag, site));
  return imageMessage(site, image, [
    { label: "Revoir la partie", url: revoirLaPartie(site, partie.id) },
    { label: TITRE_DE_L_UTILITE, url: siteLink(site, PAGE_DES_UTILES) },
  ]);
}

export interface UtilitySendDeps {
  /** Un lien déjà vérifié par `isWebhookUrl` : celui du salon des victoires. */
  link: string;
  partie: PartieDeLUtilite;
  lignes: readonly LigneDUtilite[];
  /** Dessine l'image. Si elle échoue, le message part en texte. */
  renderImage: () => Promise<RenderedImage>;
  tag: string;
  siteUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le score en image, ou en texte si elle ne se dessine pas. `false` : Discord ne l'a pas accepté. */
export function sendUtility({ link, partie, lignes, renderImage, tag, siteUrl, fetch, log }: UtilitySendDeps): Promise<boolean> {
  return postWithImage({
    link,
    label: "Utilité",
    text: utilityPayload(partie, lignes, tag, siteUrl, null),
    image: async () => {
      const { png, alt } = await renderImage();
      const filename = `utilite-${partie.id.replace(/[^A-Za-z0-9]/g, "")}.png`;
      return { payload: utilityPayload(partie, lignes, tag, siteUrl, { alt, filename }), png, filename };
    },
    fetch,
    log,
  });
}
