/**
 * Les Gaulois des membres sur les pages du site (demande du pilote, 16 novembre 2026) : le Gaulois qu'un membre a créé
 * paraît à côté de son pseudo sur l'accueil, dans la gazette, les records, la page Membres, les dernières parties de
 * « Revoir une partie » et, sous les parties qui ont leur replay sur le site, dans « Dernières parties ».
 *
 * Même chemin que les images des fiches (`gaulois-joueurs.ts`) : l'étape « Lire les Gaulois des fiches » de la GitHub
 * Action, seule à avoir la clé de service, range les tenues dans `.cache/gaulois-fiches.json` ; la construction les relit
 * ici, une fois. N'y figurent que les membres au pseudo public, validés, qui ont enregistré leur Gaulois : le serveur en
 * décide. Rien n'est du temps réel : la page montre les Gaulois relevés à sa dernière construction. Sans ce fichier
 * (un poste, une panne), aucun Gaulois : les pages s'affichent comme avant.
 *
 * Une image par membre, `/gaulois/<identifiant public>.png` (`src/pages/gaulois/[id].png.ts`) : le Gaulois entier, une
 * case par pixel, rogné à son contour. La page l'agrandit d'un nombre entier, sans lissage, et montre le Gaulois en pied
 * ou son buste, en ne laissant voir que le haut de la même image (`buste`, en pixels de l'image).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { loadMemberResultsOnce, loadMembers } from "./data";
import { GAULOIS_FICHES_FILE, gauloisDuCache, type GauloisParJoueur } from "./gaulois-joueurs";
import { BUST_CUT, placeSprite, spritePixels, tenueOf, type SpritePlacement } from "./gaulois-sprite";
import { CLASSE, enteteDuFilm } from "./rejeu/film";
import { DOSSIER_FILMS, MAX_OCTETS_FILM_DECOMPRESSE, nomDuFilm } from "./rejeu/films-index";
import { nommesParPartie } from "./serie-en-cours";

let lus: GauloisParJoueur | null = null;

/** Les Gaulois des membres au pseudo public de la liste, relus une fois par construction. */
export function gauloisDuSite(): GauloisParJoueur {
  return (lus ??= gauloisDuCache(
    GAULOIS_FICHES_FILE,
    (loadMembers()?.members ?? []).map((m) => (m.username ? m.publicId : null)),
  ));
}

/** Ce qu'une page sait du Gaulois d'un membre : l'adresse de son image (sans la base du site) et ses mesures, en pixels de l'image. */
export interface PortraitDeGaulois {
  image: string;
  largeur: number;
  hauteur: number;
  /** La hauteur du buste : le haut de l'image, jusque sous les épaules. */
  buste: number;
}

/** Le Gaulois entier d'une tenue, une case par pixel, rogné à son contour. `null` : rien à dessiner. */
const enPied = (gaulois: GauloisParJoueur, id: string | null | undefined): SpritePlacement | null => {
  const tenue = tenueOf(gaulois, id);
  return tenue ? placeSprite(tenue, { axis: 0, bottom: 0, scale: 1 }) : null;
};

/** Le portrait d'un membre, ou `null` s'il n'a pas créé de Gaulois (ou n'a pas de pseudo public). */
export function portraitDuGaulois(id: string | null | undefined, gaulois: GauloisParJoueur = gauloisDuSite()): PortraitDeGaulois | null {
  const place = enPied(gaulois, id);
  if (!place || !id) return null;
  const { width, height, top } = place.crop;
  const buste = BUST_CUT - top;
  // L'adresse change avec la tenue : un Gaulois rhabillé ne reste pas dans le cache du navigateur.
  const version = createHash("sha256")
    .update(
      Object.keys(place.tenue)
        .sort()
        .map((cle) => `${cle}=${place.tenue[cle]}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 8);
  return { image: `/gaulois/${encodeURIComponent(id)}.png?v=${version}`, largeur: width, hauteur: height, buste: buste >= 1 && buste < height ? buste : height };
}

/** L'image d'un membre, en PNG. `null` : pas de Gaulois. */
export async function pngDuGaulois(id: string, gaulois: GauloisParJoueur = gauloisDuSite()): Promise<Buffer | null> {
  const place = enPied(gaulois, id);
  if (!place) return null;
  const { data, width, height } = spritePixels(place);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Un membre nommé d'une partie qui a créé son Gaulois. */
export interface GauloisDePartie {
  id: string;
  username: string;
  portrait: PortraitDeGaulois;
}

let parPartie: ReadonlyMap<string, GauloisDePartie[]> | null = null;

/**
 * Pour chaque partie, les membres au pseudo public qui l'ont jouée sous le tag d'après leur liste officielle
 * (`.cache/member-games/results.json`, celle des podiums) et qui ont créé leur Gaulois, par ordre de pseudo. Une partie
 * absente : personne à montrer, ou des listes pas encore lues.
 */
export function gauloisParPartie(
  results = loadMemberResultsOnce(),
  membres: readonly { publicId: string | null; username: string | null }[] = loadMembers()?.members ?? [],
  gaulois: GauloisParJoueur = gauloisDuSite(),
): ReadonlyMap<string, GauloisDePartie[]> {
  const nommes = new Map(membres.flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const index = new Map<string, GauloisDePartie[]>();
  if (gaulois.size === 0) return index;
  const portraits = new Map<string, PortraitDeGaulois | null>();
  for (const [partie, { gagnants, perdants }] of nommesParPartie(results, nommes)) {
    const presents: GauloisDePartie[] = [];
    for (const id of [...gagnants, ...perdants]) {
      if (!portraits.has(id)) portraits.set(id, portraitDuGaulois(id, gaulois));
      const portrait = portraits.get(id);
      const username = nommes.get(id);
      if (portrait && username) presents.push({ id, username, portrait });
    }
    if (presents.length > 0) index.set(partie, presents.sort((a, b) => a.username.localeCompare(b.username, "fr")));
  }
  return index;
}

/**
 * Les Gaulois d'une partie d'après les noms que son film pose sur les territoires du clan (`nomsPubliables` de
 * `rejeu/film-brut.ts` : le pseudo des membres de la liste, reconnus par leur identifiant public au moment du film). Un nom
 * ne désigne un membre que si un seul membre porte ce pseudo : jamais un homonyme. Par ordre de pseudo.
 */
export function gauloisDesNoms(
  noms: readonly { texte: string; classe: number }[],
  membres: readonly { publicId: string | null; username: string | null }[],
  gaulois: GauloisParJoueur,
): GauloisDePartie[] {
  if (gaulois.size === 0) return [];
  // Le pseudo tel que le film l'écrit : espaces réunis, quarante caractères au plus.
  const ecrit = (pseudo: string) => pseudo.replace(/\s+/g, " ").trim().slice(0, 40);
  const parNom = new Map<string, { id: string; username: string }[]>();
  for (const m of membres) {
    if (!m.username || !m.publicId) continue;
    const cle = ecrit(m.username);
    parNom.set(cle, [...(parNom.get(cle) ?? []), { id: m.publicId, username: m.username }]);
  }
  const presents = new Map<string, GauloisDePartie>();
  for (const nom of noms) {
    if (nom.classe !== CLASSE.gaulois) continue;
    const porteurs = parNom.get(nom.texte);
    if (!porteurs || porteurs.length !== 1) continue;
    const { id, username } = porteurs[0]!;
    const portrait = portraitDuGaulois(id, gaulois);
    if (portrait) presents.set(id, { id, username, portrait });
  }
  return [...presents.values()].sort((a, b) => a.username.localeCompare(b.username, "fr"));
}

/**
 * Les Gaulois à montrer sur la case d'une partie de « Revoir une partie » : ceux que nomme son film (`.cache/films/`, là dès
 * que la partie est à revoir), et ceux des listes officielles des membres, relues environ une fois par jour. Film absent ou
 * illisible : les listes seules.
 */
export function gauloisDeLaPartie(partie: string): GauloisDePartie[] {
  // « Revoir une partie » et « Dernières parties » demandent les mêmes parties : un film n'est ouvert qu'une fois.
  const deja = lusParPartie.get(partie);
  if (deja) return deja;
  const lus = lireGauloisDeLaPartie(partie);
  lusParPartie.set(partie, lus);
  return lus;
}

const lusParPartie = new Map<string, GauloisDePartie[]>();

function lireGauloisDeLaPartie(partie: string): GauloisDePartie[] {
  const presents = new Map((gauloisDesParties().get(partie) ?? []).map((g) => [g.id, g]));
  const gaulois = gauloisDuSite();
  const nom = gaulois.size > 0 ? nomDuFilm(partie) : null;
  if (nom) {
    try {
      // L'en-tête seul, au début du film : ses noms suffisent, inutile de relire toutes ses images.
      const entete = enteteDuFilm(gunzipSync(readFileSync(join(DOSSIER_FILMS, nom)), { maxOutputLength: MAX_OCTETS_FILM_DECOMPRESSE }));
      if (entete.partie === partie) for (const g of gauloisDesNoms(entete.noms, loadMembers()?.members ?? [], gaulois)) presents.set(g.id, g);
    } catch {
      // Pas de film : rien de plus à montrer.
    }
  }
  return [...presents.values()].sort((a, b) => a.username.localeCompare(b.username, "fr"));
}

/**
 * Ce que le journal des parties (« Dernières parties ») reçoit : le portrait de chaque membre montré, une fois, et pour
 * chaque partie les identifiants de ses Gaulois. Seulement les parties données : la page n'envoie que celles qui ont leur
 * replay sur le site, où ces pseudos se lisent déjà.
 */
export interface GauloisDuJournal {
  portraits: Record<string, { username: string; image: string; largeur: number; hauteur: number; buste: number }>;
  parties: Record<string, string[]>;
}

export function gauloisDuJournal(parties: readonly string[], de: (partie: string) => GauloisDePartie[] = gauloisDeLaPartie): GauloisDuJournal {
  const journal: GauloisDuJournal = { portraits: {}, parties: {} };
  for (const partie of parties) {
    const presents = de(partie);
    if (presents.length === 0) continue;
    journal.parties[partie] = presents.map((g) => g.id);
    for (const g of presents) journal.portraits[g.id] = { username: g.username, image: g.portrait.image, largeur: g.portrait.largeur, hauteur: g.portrait.hauteur, buste: g.portrait.buste };
  }
  return journal;
}

/** Le même index, calculé une fois par construction. */
export const gauloisDesParties = (): ReadonlyMap<string, GauloisDePartie[]> => (parPartie ??= gauloisParPartie());
