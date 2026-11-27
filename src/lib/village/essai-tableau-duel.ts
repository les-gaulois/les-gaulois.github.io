/**
 * L'essai contre le hasard du tableau des duellistes (chantier 5 du duel « Coup pour coup », 22 novembre 2026 ; le pilote :
 * « Je vérifierai d'abord qu'il récompense vraiment le talent et pas la chance »).
 *
 * Des mondes simulés, chacun une saison de six semaines : une vingtaine de Gaulois de forces connues (la machine du duel à
 * plusieurs réglages, du presque hasard au druide), chacun avec sa garde-robe, sa main d'attaque, sa main de défense, son
 * lieu et son compagnon, qui jouent chaque jour les duels qui comptent comme le serveur les compte : les boss du jour (les
 * vrais, dans leur ordre), les mains de défense des autres (jouées par la machine au niveau du guerrier) et des matchs des
 * salles entre deux joueurs. Chaque duel est joué en entier par le moteur (`jouerUnDuel`), rien n'est tiré d'un tableau de
 * chances. Parmi eux, des Gaulois moyens qui trichent sans tricher : l'un joue tout ce qu'il peut, l'un n'attaque que les
 * comptes faibles, l'un a un ami qui perd exprès contre lui chaque jour (en salle, il s'en va ; en défense, sa main est
 * faite pour perdre). Le relevé des duels sert ensuite à juger chaque façon de classer (`tableau-duel.ts`).
 *
 * Le hasard suit des graines (`hasardDeLaGraine`) : l'essai rend toujours les mêmes chiffres. `npx tsx
 * scripts/essai-tableau-duel.ts` le refait en entier.
 */
import { BOSS, NIVEAUX, NIVEAU_DES_BOSS, ORDRE_DES_BOSS, bossParId, optionsDuBoss } from "../../../supabase/functions/code-discord/duel/contenu/index";
import { carte, choisir, hasardDeLaGraine, jouerUnDuel } from "../../../supabase/functions/code-discord/duel/index";
import type { Carte, IdDeCompagnon, IdDeLieu, Joueur } from "../../../supabase/functions/code-discord/duel/index";
import { GARDE_ROBES, mainAuHasard } from "./essai-duel";
import { DUELS_COMPTES_PAR_JOUR } from "./contrat-duel";
import { MATCHS_CONTRE_UN_MEME, MATCHS_PAR_JOUR } from "./contrat-salles";
import type { ResultatDuTableau } from "./tableau-duel";

/** Un réglage de la machine qui fait un joueur de force connue : plus la fantaisie est petite, plus il voit loin, plus il est fort. */
export interface Talent {
  nom: string;
  fantaisie: number;
  loin: number;
}

/** L'échelle des forces, de la plus faible à la plus forte (mesurée par `forcesDesTalents`). */
export const TALENTS: readonly Talent[] = [
  { nom: "au hasard", fantaisie: 40, loin: 1 },
  { nom: "hésitant", fantaisie: 6, loin: 1 },
  { nom: "appliqué", fantaisie: 1.5, loin: 1 },
  { nom: "bon sens", fantaisie: 0.5, loin: 1 },
  { nom: "fin", fantaisie: 0.5, loin: 2 },
  { nom: "druide", fantaisie: 0.05, loin: 2 },
];

/** Le talent du Gaulois moyen des tricheurs : « appliqué ». */
export const TALENT_MOYEN = 2;

const LIEUX: readonly IdDeLieu[] = ["front", "mers", "cartes", "saisons", "legendes", "tresors"];
const COMPAGNONS: readonly (IdDeCompagnon | null)[] = [null, "Ferme", "Forêt", "Ciel et eaux", "Légendes", "Drôles"];

/** Le rôle d'un Gaulois dans un monde. */
export type Role = "honnete" | "nouveau" | "temoin" | "volume" | "chasseur" | "ami" | "complice";

export interface GauloisSimule {
  id: number;
  role: Role;
  talent: number;
  garde: keyof typeof GARDE_ROBES;
  attaque: Carte[];
  defense: Carte[];
  lieu: IdDeLieu;
  compagnon: IdDeCompagnon | null;
  /** Ses jours de jeu par semaine, ses duels comptés par jour (le boss compris), ses matchs de salle par jour. */
  jours: number;
  parties: number;
  salles: number;
}

export interface MondeSimule {
  gaulois: GauloisSimule[];
  /** Tous les résultats comptés de la saison, dans l'ordre où ils finissent. */
  resultats: ResultatDuTableau[];
}

const points = (v: number): 0 | 0.5 | 1 => (v > 0 ? 1 : v === 0 ? 0.5 : 0);

/** Un tirage entier de `a` à `b` compris. */
const entre = (alea: () => number, a: number, b: number): number => a + Math.floor(alea() * (b - a + 1));
const unDe = <T>(alea: () => number, l: readonly T[]): T => l[Math.floor(alea() * l.length)]!;

/** La main « faite pour perdre » d'un complice : les cinq cartes de base. */
const mainDeBase = (alea: () => number): Carte[] => mainAuHasard(GARDE_ROBES.base!, false, alea);

/**
 * Un monde : `honnetes` Gaulois honnêtes de talents tirés sur toute l'échelle, 3 nouveaux venus faibles (garde-robe de
 * base), un témoin moyen qui joue normalement, et les trois tricheurs moyens avec le complice de l'ami.
 */
export function creerMonde(graine: number, honnetes = 14): GauloisSimule[] {
  const alea = hasardDeLaGraine(graine);
  const gardes = ["modeste", "aisee", "riche"] as const;
  const l: GauloisSimule[] = [];
  const ajouter = (role: Role, talent: number, garde: keyof typeof GARDE_ROBES, jours: number, parties: number, salles: number): void => {
    const plein = garde !== "base";
    l.push({
      id: l.length, role, talent, garde,
      attaque: mainAuHasard(GARDE_ROBES[garde]!, plein, alea),
      defense: role === "complice" ? mainDeBase(alea) : mainAuHasard(GARDE_ROBES[garde]!, plein, alea),
      lieu: unDe(alea, LIEUX), compagnon: unDe(alea, COMPAGNONS), jours, parties, salles,
    });
  };
  for (let i = 0; i < honnetes; i++) ajouter("honnete", entre(alea, 1, TALENTS.length - 1), unDe(alea, gardes), entre(alea, 2, 7), entre(alea, 1, 3), entre(alea, 0, 2));
  for (let i = 0; i < 3; i++) ajouter("nouveau", entre(alea, 0, 1), unDe(alea, ["base", "communs"] as const), entre(alea, 1, 4), entre(alea, 1, 2), entre(alea, 0, 1));
  ajouter("temoin", TALENT_MOYEN, "aisee", 4, 2, 1);
  // Depuis le 27 novembre 2026, plus de limite de 3 duels comptés par jour ni de 3 matchs contre un même adversaire : celui
  // qui joue tout ce qu'il peut joue chaque jour le boss et toutes les défenses, et jusqu'aux dix matchs de salle ; le
  // chasseur bat chaque jour tous les comptes faibles.
  ajouter("volume", TALENT_MOYEN, "aisee", 7, DUELS_COMPTES_PAR_JOUR, MATCHS_PAR_JOUR);
  ajouter("chasseur", TALENT_MOYEN, "aisee", 4, 5, 1);
  ajouter("ami", TALENT_MOYEN, "aisee", 4, 2, 1);
  ajouter("complice", 0, "base", 4, 1, 0);
  return l;
}

const joueurDe = (t: Talent, alea: () => number): Joueur => (moi, lui, m) => choisir(moi, lui, m, alea, t.fantaisie, t.loin);

/**
 * Joue la saison d'un monde, jour après jour, comme le serveur compte les duels : au plus `parties` duels comptés par jour
 * et par Gaulois, un seul contre un même boss ou un même membre ce jour-là ; les matchs de salle appariés au hasard, au plus
 * `MATCHS_CONTRE_UN_MEME` par jour contre un même adversaire (autant que contre tous depuis le 27 novembre 2026 ; 3 avant).
 * `semaines` semaines de 7 jours.
 */
export function jouerLaSaison(gaulois: readonly GauloisSimule[], graine: number, semaines = 6): ResultatDuTableau[] {
  const alea = hasardDeLaGraine(graine), jeu = hasardDeLaGraine((graine % 2147483000) + 17);
  const machine = joueurDe({ nom: "guerrier", ...NIVEAUX[NIVEAU_DES_BOSS] }, jeu);
  const politiques = gaulois.map((g) => joueurDe(TALENTS[g.talent]!, jeu));
  const decalage = entre(alea, 0, ORDRE_DES_BOSS.length - 1);
  const res: ResultatDuTableau[] = [];
  let horloge = 0;
  const noter = (joueur: number, type: ResultatDuTableau["type"], adversaire: string, r: 0 | 0.5 | 1, jour: number): void => {
    res.push({ joueur: String(joueur), type, adversaire, r, jour, semaine: Math.floor(jour / 7), ordre: horloge++ });
  };
  const faibles = gaulois.filter((g) => g.role === "nouveau" || g.role === "complice").map((g) => g.id);
  for (let jour = 0; jour < 7 * semaines; jour++) {
    const boss = bossParId(ORDRE_DES_BOSS[(jour + decalage) % ORDRE_DES_BOSS.length])!;
    // Qui joue ce jour : chacun, avec la chance de ses jours par semaine.
    const presents = gaulois.filter((g) => alea() < g.jours / 7);
    for (const g of presents) {
      if (g.role === "complice") continue;
      const deja = new Set<number>();
      for (let k = 0; k < g.parties; k++) {
        // le boss d'abord, le plus souvent ; puis les mains de défense des autres
        if (k === 0 && alea() < 0.8) {
          const d = jouerUnDuel(g.attaque, boss.main.map(carte), politiques[g.id]!, machine, { lieu: boss.lieu.famille, compagnon: g.compagnon }, optionsDuBoss(boss));
          noter(g.id, "boss", `boss:${boss.id}`, points(d.verdict), jour);
          continue;
        }
        const autres = gaulois.filter((o) => o.id !== g.id && !deja.has(o.id));
        if (!autres.length) break;
        let cible: GauloisSimule;
        if (g.role === "ami" && !deja.has(gaulois.find((o) => o.role === "complice")!.id)) cible = gaulois.find((o) => o.role === "complice")!;
        else if (g.role === "chasseur" && autres.some((o) => faibles.includes(o.id))) cible = unDe(alea, autres.filter((o) => faibles.includes(o.id)));
        else cible = unDe(alea, autres);
        deja.add(cible.id);
        const d = jouerUnDuel(g.attaque, cible.defense, politiques[g.id]!, machine, { lieu: cible.lieu, compagnon: g.compagnon }, { lieu: cible.lieu, compagnon: cible.compagnon });
        noter(g.id, "defense", `membre:${cible.id}`, points(d.verdict), jour);
      }
    }
    // Les salles : l'ami et son complice d'abord (le complice s'en va : il perd), puis les autres, appariés au hasard.
    const ami = gaulois.find((o) => o.role === "ami")!, complice = gaulois.find((o) => o.role === "complice")!;
    if (presents.includes(ami)) {
      noter(ami.id, "salle", `membre:${complice.id}`, 1, jour);
      noter(complice.id, "salle", `membre:${ami.id}`, 0, jour);
    }
    const reste = new Map(presents.filter((g) => g.role !== "complice" && g.salles > 0).map((g) => [g.id, entre(alea, 0, g.salles)]));
    const paires = new Map<string, number>();
    for (let essai = 0; essai < 200; essai++) {
      const l = [...reste].filter(([, n]) => n > 0).map(([id]) => id);
      if (l.length < 2) break;
      const a = unDe(alea, l), b = unDe(alea, l.filter((x) => x !== a));
      const cle = a < b ? `${a}-${b}` : `${b}-${a}`;
      if ((paires.get(cle) ?? 0) >= MATCHS_CONTRE_UN_MEME) continue;
      paires.set(cle, (paires.get(cle) ?? 0) + 1);
      reste.set(a, reste.get(a)! - 1);
      reste.set(b, reste.get(b)! - 1);
      const ga = gaulois[a]!, gb = gaulois[b]!;
      const d = jouerUnDuel(ga.attaque, gb.attaque, politiques[a]!, politiques[b]!, { lieu: ga.lieu, compagnon: ga.compagnon }, { lieu: ga.lieu, compagnon: gb.compagnon });
      noter(a, "salle", `membre:${b}`, points(d.verdict), jour);
      noter(b, "salle", `membre:${a}`, points(-d.verdict), jour);
    }
  }
  return res;
}

/**
 * La force de chaque talent : la part de duels, sur 100, qu'il gagne contre la machine au niveau du guerrier, avec des
 * mains aisées, `n` paires jouées des deux côtés.
 */
export function forcesDesTalents(n: number, graine = 404): number[] {
  const tirage = hasardDeLaGraine(graine), jeu = hasardDeLaGraine(graine + 1);
  const machine = joueurDe({ nom: "guerrier", ...NIVEAUX.guerrier }, jeu);
  return TALENTS.map((t) => {
    const j = joueurDe(t, jeu);
    let g = 0;
    for (let i = 0; i < n; i++) {
      const ma = mainAuHasard(GARDE_ROBES.aisee!, true, tirage), mb = mainAuHasard(GARDE_ROBES.aisee!, true, tirage);
      g += points(jouerUnDuel(ma, mb, j, machine).verdict) + points(-jouerUnDuel(mb, ma, machine, j).verdict);
    }
    return (100 * g) / (2 * n);
  });
}

export { BOSS };
