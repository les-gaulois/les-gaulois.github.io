/**
 * Mesure l'économie du village des Gaulois sur les données du clan (docs/DIRECTION.md, « Le village des Gaulois ») :
 *   npm run village:economie
 *   npm run village:economie -- --resultats <chemin de results.json> --chances 58,26,10,4,2 --essais 2000 --graine 2026
 * Lit `data/sessions/` et, s'il existe, le cache des parties des membres (`.cache/member-games/results.json`, ou le fichier
 * donné par `--resultats`), en lecture seule. `--chances` compare d'autres chances de pochette à celles du contrat.
 * N'écrit que dans le terminal : ni fichier, ni envoi, ni identifiant ou pseudo de joueur (des comptes et des quantiles).
 * Les calculs sont dans `src/lib/village/economie.ts`, les réglages dans `src/lib/village/contrat.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadSessions, MEMBER_RESULTS_FILE, unreadableSessionFiles } from "../src/lib/data";
import { OBJETS, ORDRE_RARETES, RARETES, type Rarete } from "../src/lib/gaulois";
import { frNumber } from "../src/lib/nombre";
import { StoredMemberResults } from "../src/lib/schemas";
import { victoiresARelire } from "../src/lib/stateres-releve";
import { parisParts } from "../src/lib/time";
import { CHANCES_POCHETTE, PRIX_PAR_RARETE, PRIX_POCHETTE } from "../src/lib/village/contrat";
import {
  controlerReglages,
  coutDuCatalogue,
  moisDeLaPeriode,
  moisPourSOffrir,
  objetsParRarete,
  objetsPayants,
  pochettesMoyennesPourObjet,
  pochettesMoyennesPourRarete,
  profilsDeJoueurs,
  revenusDuClan,
  revenusParJoueur,
  simulerCollectionMixte,
  simulerPochettes,
  TAILLES,
  valeurMoyennePochette,
  valeurNeuvePochette,
  type MoisDeJoueur,
  type ParRarete,
  type Resume,
  type VictoireDuClan,
} from "../src/lib/village/economie";

// --- Arguments ---------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const option = (nom: string): string | undefined => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const essais = Number(option("--essais") ?? 2000);
const graine = Number(option("--graine") ?? 2026);
const fichierResultats = option("--resultats") ?? MEMBER_RESULTS_FILE;
const chancesProposees = ((): ParRarete | null => {
  const brut = option("--chances");
  if (!brut) return null;
  const n = brut.split(",").map(Number);
  if (n.length !== ORDRE_RARETES.length || n.some((x) => !Number.isFinite(x))) {
    console.log(`--chances attend ${ORDRE_RARETES.length} nombres séparés par des virgules, du commun au légendaire.`);
    process.exit(1);
  }
  return Object.fromEntries(ORDRE_RARETES.map((r, i) => [r, n[i] ?? 0])) as ParRarete;
})();

// --- Mise en forme -----------------------------------------------------------------------------------------------------
const entier = frNumber({ maximumFractionDigits: 0 });
const decimal = frNumber({ maximumFractionDigits: 1 });
const deux = frNumber({ maximumFractionDigits: 2 });
const pourcent = frNumber({ style: "percent", maximumFractionDigits: 1 });
const nomRarete = (r: Rarete): string => RARETES[r].nom;

function tableau(entetes: string[], lignes: (string | number)[][]): void {
  const cellules = lignes.map((l) => l.map(String));
  const largeurs = entetes.map((e, i) => Math.max(e.length, ...cellules.map((l) => (l[i] ?? "").length)));
  const ligne = (l: string[]) => l.map((c, i) => (i === 0 ? c.padEnd(largeurs[i] ?? 0) : c.padStart(largeurs[i] ?? 0))).join("  ");
  console.log(ligne(entetes));
  console.log(largeurs.map((n) => "-".repeat(n)).join("  "));
  for (const l of cellules) console.log(ligne(l));
  console.log("");
}
const titre = (t: string): void => console.log(`\n=== ${t} ===\n`);
const duree = (mois: number | null): string => {
  if (mois === null) return "jamais";
  if (mois < 1) return `${decimal.format(mois * 30.4)} j`;
  return `${decimal.format(mois)} mois`;
};
const q = (r: Resume | null, champ: keyof Resume): string => (r ? entier.format(r[champ]) : "pas de données");

// --- 1. Les revenus du clan --------------------------------------------------------------------------------------------
const illisibles = unreadableSessionFiles();
const sessions = loadSessions();
if (sessions.length === 0) {
  console.log("Aucune session lisible dans data/sessions/ : rien à mesurer.");
  process.exit(1);
}
// Les mêmes victoires que celles que relit le serveur : avec des points, une fois chacune.
const victoires: VictoireDuClan[] = victoiresARelire(sessions, "1970-01-01T00:00:00.000Z", new Set());
const jours = sessions.map((s) => parisParts(s.gameStart).date).sort();
const debut = jours[0] ?? "";
const fin = jours[jours.length - 1] ?? "";
const clan = revenusDuClan(victoires, debut, fin);

titre("1. Ce que la règle distribue (plafond : chaque Gaulois présent aurait un compte validé et son Gaulois)");
console.log(`Données : ${entier.format(sessions.length)} sessions du clan, du ${debut} au ${fin} (jours à Paris), ${entier.format(victoires.length)} victoires avec des points.`);
if (illisibles.length > 0) console.log(`Attention : mois illisibles, non comptés : ${illisibles.join(", ")}.`);
console.log("");
tableau(
  ["Gaulois dans la partie", "victoires", "points moyens", "statères à chacun, moyenne", "statères distribués", "part"],
  TAILLES.map((t) => {
    const d = clan.parTaille[t];
    return [
      t === "1" ? "seul" : t === "4+" ? "4 et plus" : `à ${t}`,
      entier.format(d.victoires),
      d.victoires ? deux.format(d.points / d.victoires) : "-",
      d.victoires ? decimal.format(d.parGaulois / d.victoires) : "-",
      entier.format(d.distribues),
      clan.total.distribues ? pourcent.format(d.distribues / clan.total.distribues) : "-",
    ];
  }),
);
tableau(
  ["Mois", "jours lus", "victoires", "à un Gaulois toujours présent", "distribués", "distribués par jour"],
  clan.parMois.map((m) => [
    `${m.mois}${m.complet ? "" : " (partiel)"}`,
    m.jours,
    entier.format(m.distribution.victoires),
    entier.format(m.distribution.parGaulois),
    entier.format(m.distribution.distribues),
    entier.format(m.distribution.distribues / m.jours),
  ]),
);
const complets = clan.parMois.filter((m) => m.complet);
const moyenneMois = complets.length ? complets.reduce((n, m) => n + m.distribution.distribues, 0) / complets.length : null;
console.log(
  `Total : ${entier.format(clan.total.distribues)} statères distribués en ${clan.total.jours} jours, soit ${entier.format(clan.total.distribues / clan.total.jours)} par jour` +
    (moyenneMois === null ? "." : ` et ${entier.format(moyenneMois)} par mois complet en moyenne (${complets.length} mois complets).`),
);

// --- 2. Les revenus par joueur -----------------------------------------------------------------------------------------
titre("2. Revenus par joueur (membres avec pseudo seulement)");
let profilRef: { nom: string; resume: Resume | null }[] = [];
let moisRef: string | null = null;
let lignes30: MoisDeJoueur[] = [];
if (!existsSync(fichierResultats)) {
  console.log(`Pas de fichier des parties des membres (${fichierResultats}) : revenus par joueur non mesurés.`);
} else {
  const lu = StoredMemberResults.safeParse(JSON.parse(readFileSync(fichierResultats, "utf8")));
  if (!lu.success) {
    console.log(`Fichier des parties des membres illisible (${fichierResultats}) : revenus par joueur non mesurés.`);
  } else {
    const joueurs = Object.values(lu.data);
    const lectures = joueurs.map((j) => j.readAt).sort();
    const luLe = lectures[lectures.length - 1] ?? fin;
    // Le jour de la lecture est incomplet : la période s'arrête la veille, et jamais après les sessions.
    const finListes = [parisParts(new Date(Date.parse(luLe) - 86_400_000)).date, fin].sort()[0] ?? fin;
    const parPartie = new Map(victoires.map((v) => [v.gameId, v]));
    const connues = new Set(sessions.map((s) => s.gameId));
    const lignes = revenusParJoueur(
      joueurs.map((j) => j.games),
      parPartie,
      connues,
    );
    const moisComplets = moisDeLaPeriode(debut, finListes).filter((m) => m.complet).map((m) => m.mois);
    const dernier = moisComplets[moisComplets.length - 1] ?? null;
    // Les 30 jours qui précèdent la lecture des listes : la période la plus récente qu'elles couvrent en entier.
    const depuis = Date.parse(luLe) - 30 * 86_400_000;
    const trenteJours = revenusParJoueur(
      joueurs.map((j) => j.games),
      parPartie,
      connues,
      (d) => (Date.parse(d) >= depuis && Date.parse(d) < Date.parse(luLe) ? "30 jours" : null),
    );
    moisRef = `30 jours avant la lecture, du ${parisParts(new Date(depuis)).date} au ${parisParts(luLe).date}`;
    const rangs = joueurs.reduce((n, j) => n + j.games.length, 0);
    const introuvables = lignes.reduce((n, l) => n + l.introuvables, 0);
    const victoiresListes = lignes.reduce((n, l) => n + l.victoires, 0);
    const creditees = lignes.reduce((n, l) => n + l.creditees, 0);
    console.log(
      `Données : ${joueurs.length} joueurs avec pseudo, ${entier.format(rangs)} parties sous le tag, lues jusqu'au ${parisParts(luLe).date} ; ` +
        `${entier.format(victoiresListes)} victoires dans leurs listes, ${entier.format(creditees)} parties qui donnent des statères, ` +
        `${entier.format(introuvables)} victoires absentes des sessions du clan (non comptées).`,
    );
    console.log(`Mois complets mesurés : ${moisComplets.join(", ") || "aucun"}. Une ligne : un joueur pendant un mois où il a joué.\n`);
    tableau(
      ["Mois", "joueurs", "avec statères", "médiane si statères", "10 parties et plus", "médiane", "30 parties et plus", "médiane", "9 sur 10 sous", "le plus haut"],
      moisComplets.map((mois) => {
        const l = lignes.filter((x) => x.periode === mois);
        const [, recu, dix, trente] = profilsDeJoueurs(l);
        return [
          mois,
          l.length,
          recu?.resume?.nombre ?? 0,
          q(recu?.resume ?? null, "mediane"),
          dix?.resume?.nombre ?? 0,
          q(dix?.resume ?? null, "mediane"),
          trente?.resume?.nombre ?? 0,
          q(trente?.resume ?? null, "mediane"),
          q(recu?.resume ?? null, "p90"),
          q(recu?.resume ?? null, "max"),
        ];
      }),
    );
    const enTout = profilsDeJoueurs(lignes.filter((l) => moisComplets.includes(l.periode)));
    profilRef = profilsDeJoueurs(trenteJours);
    lignes30 = trenteJours;
    for (const [nom, profils] of [
      [`Tous les mois complets ensemble (${moisComplets.length}), statères du mois`, enTout],
      [`Dernier mois complet (${dernier ?? "aucun"}), statères du mois`, dernier ? profilsDeJoueurs(lignes.filter((l) => l.periode === dernier)) : []],
      [`${moisRef}, statères des 30 jours`, profilRef],
    ] as const) {
      console.log(`${nom} :`);
      tableau(
        ["Joueur", "lignes", "1 sur 4 sous", "médiane", "3 sur 4 sous", "9 sur 10 sous", "le plus haut", "moyenne"],
        profils.map((p) => [p.nom, p.resume?.nombre ?? 0, q(p.resume, "p25"), q(p.resume, "mediane"), q(p.resume, "p75"), q(p.resume, "p90"), q(p.resume, "max"), q(p.resume, "moyenne")]),
      );
    }
  }
}

// --- 3. Le catalogue ---------------------------------------------------------------------------------------------------
titre("3. Le catalogue payant, aux prix du contrat");
const cout = coutDuCatalogue(OBJETS, PRIX_PAR_RARETE);
tableau(
  ["Rareté", "prix", "objets", "coût de tous"],
  ORDRE_RARETES.map((r) => [nomRarete(r), entier.format(PRIX_PAR_RARETE[r]), cout.parRarete[r].nombre, entier.format(cout.parRarete[r].cout)]),
);
tableau(
  ["Emplacement", ...ORDRE_RARETES.map(nomRarete), "objets", "coût"],
  Object.entries(cout.parEmplacement).map(([e, c]) => [e, ...ORDRE_RARETES.map((r) => c.parRarete[r]), c.nombre, entier.format(c.cout)]),
);
console.log(`Tout le catalogue : ${cout.nombre} objets, ${entier.format(cout.cout)} statères.`);

// --- 4. Le temps pour s'offrir -----------------------------------------------------------------------------------------
titre(`4. Le temps pour s'offrir, au revenu médian de chaque profil${moisRef ? ` (${moisRef})` : ""}`);
const profilsTemps = profilRef.flatMap((p) =>
  p.resume
    ? [
        { nom: `médiane, ${p.nom}`, revenu: p.resume.mediane },
        ...(p.nom.startsWith("a reçu") ? [{ nom: "9 sur 10 sous", revenu: p.resume.p90 }, { nom: "le plus haut", revenu: p.resume.max }] : []),
      ]
    : [],
);
if (profilsTemps.length === 0) console.log("Pas de revenus par joueur : temps non calculés.");
else {
  tableau(
    ["Profil", "statères par mois", ...ORDRE_RARETES.map((r) => `1 ${nomRarete(r).toLowerCase()}`), "tout le catalogue"],
    profilsTemps.map((p) => [p.nom, entier.format(p.revenu), ...ORDRE_RARETES.map((r) => duree(moisPourSOffrir(PRIX_PAR_RARETE[r], p.revenu))), duree(moisPourSOffrir(cout.cout, p.revenu))]),
  );
}

// --- 5. La pochette ----------------------------------------------------------------------------------------------------
const rangs = objetsParRarete(OBJETS);
const tous = objetsPayants(OBJETS);
const possedesJusqua = (rang: number): Set<string> => new Set(tous.filter((o) => RARETES[o.rarete].rang <= rang).map((o) => o.cle));
const leg = rangs.legendaire[0];

function pochette(nom: string, chances: ParRarete): void {
  titre(`5. La pochette à ${PRIX_POCHETTE} statères, ${nom} : ${ORDRE_RARETES.map((r) => chances[r]).join(", ")}`);
  const valeur = valeurMoyennePochette(chances, PRIX_PAR_RARETE);
  console.log("Ce que vaut une pochette en moyenne, au prix de la boutique (un double ne vaut rien ici) :");
  tableau(
    ["Le joueur possède déjà", "valeur moyenne", "pour 1 statère payé"],
    [
      ["rien", decimal.format(valeur), deux.format(valeur / PRIX_POCHETTE)],
      ...[1, 2, 3, 4].map((rang) => {
        const v = valeurNeuvePochette(chances, PRIX_PAR_RARETE, OBJETS, possedesJusqua(rang));
        return [`tout jusqu'au ${nomRarete(ORDRE_RARETES[rang - 1] as Rarete).toLowerCase()}`, decimal.format(v), deux.format(v / PRIX_POCHETTE)];
      }),
    ],
  );
  console.log("Pochettes en moyenne pour tirer un objet, en partant de rien, et leur prix comparé à l'achat direct :");
  tableau(
    ["But", "pochettes", "statères", "achat direct", "fois plus cher"],
    ORDRE_RARETES.flatMap((r) => {
      const precis = pochettesMoyennesPourObjet(chances, OBJETS, r);
      const quelconque = pochettesMoyennesPourRarete(chances, r);
      return [
        [`un ${nomRarete(r).toLowerCase()} précis`, decimal.format(precis), entier.format(precis * PRIX_POCHETTE), entier.format(PRIX_PAR_RARETE[r]), decimal.format((precis * PRIX_POCHETTE) / PRIX_PAR_RARETE[r])],
        [`un ${nomRarete(r).toLowerCase()} quelconque`, decimal.format(quelconque), entier.format(quelconque * PRIX_POCHETTE), entier.format(PRIX_PAR_RARETE[r]), decimal.format((quelconque * PRIX_POCHETTE) / PRIX_PAR_RARETE[r])],
      ];
    }),
  );
  const toutSim = simulerPochettes({ but: "tout", chances, catalogue: OBJETS, essais, graine });
  const legSim = leg ? simulerPochettes({ but: { objet: leg.cle }, chances, catalogue: OBJETS, essais, graine }) : null;
  console.log(`Simulation, ${essais} essais, graine ${graine} :`);
  tableau(
    ["But", "pochettes, moyenne", "médiane", "9 sur 10 sous", "doubles, moyenne", "statères, moyenne", "achat direct"],
    [
      ...(legSim
        ? [["un légendaire précis", decimal.format(legSim.pochettes.moyenne), q(legSim.pochettes, "mediane"), q(legSim.pochettes, "p90"), decimal.format(legSim.doubles.moyenne), entier.format(legSim.pochettes.moyenne * PRIX_POCHETTE), entier.format(PRIX_PAR_RARETE.legendaire)]]
        : []),
      ["tout le catalogue", decimal.format(toutSim.pochettes.moyenne), q(toutSim.pochettes, "mediane"), q(toutSim.pochettes, "p90"), decimal.format(toutSim.doubles.moyenne), entier.format(toutSim.pochettes.moyenne * PRIX_POCHETTE), entier.format(cout.cout)],
    ],
  );
  const mixte = simulerCollectionMixte({ chances, prix: PRIX_PAR_RARETE, prixPochette: PRIX_POCHETTE, catalogue: OBJETS, essais, graine });
  console.log(
    `Collectionneur avisé (pochettes tant qu'elles rapportent plus qu'elles ne coûtent, puis la boutique) : ` +
      `${decimal.format(mixte.pochettes.moyenne)} pochettes, ${decimal.format(mixte.doubles.moyenne)} doubles, ` +
      `${entier.format(mixte.depense.moyenne)} statères pour tout le catalogue (de ${q(mixte.depense, "p10")} à ${q(mixte.depense, "p90")} pour 8 sur 10), ` +
      `contre ${entier.format(cout.cout)} à la boutique seule : ${pourcent.format(1 - mixte.depense.moyenne / cout.cout)} d'économie.`,
  );
  const c = chances.legendaire / 100;
  console.log(`Au moins un légendaire : ${[12, 36, 60, 120].map((k) => `${pourcent.format(1 - (1 - c) ** k)} en ${k} pochettes`).join(", ")}.`);
  const problemes = controlerReglages({ prix: PRIX_PAR_RARETE, prixPochette: PRIX_POCHETTE, chances, catalogue: OBJETS });
  console.log(problemes.length ? `Réglages absurdes :\n- ${problemes.join("\n- ")}` : "Contrôle des réglages : rien d'absurde.");
}

pochette("chances du contrat", CHANCES_POCHETTE);
if (chancesProposees) pochette("chances proposées", chancesProposees);

// --- 6. La durée de vie ------------------------------------------------------------------------------------------------
titre("6. Ce qui entre et ce qui peut sortir");
const dernierComplet = complets[complets.length - 1];
const enCours = clan.parMois[clan.parMois.length - 1];
if (dernierComplet) {
  console.log(
    `Entrée, plafond du clan (tous les Gaulois présents) : ${entier.format(dernierComplet.distribution.distribues)} statères en ${dernierComplet.mois}` +
      (enCours && !enCours.complet ? `, ${entier.format(enCours.distribution.distribues / enCours.jours)} par jour en ${enCours.mois} (${enCours.jours} jours lus).` : "."),
  );
}
if (lignes30.length > 0) {
  const recus = lignes30.filter((l) => l.stateres > 0);
  const somme = recus.reduce((n, l) => n + l.stateres, 0);
  const catalogues = recus.length * cout.cout;
  console.log(
    `Entrée des membres avec pseudo sur 30 jours : ${entier.format(somme)} statères pour ${recus.length} joueurs. ` +
      `Leurs catalogues complets valent ${entier.format(catalogues)} statères : ${decimal.format(catalogues / somme)} mois d'entrée à ce rythme.`,
  );
}
console.log(`Sortie possible par joueur : le catalogue une fois (${entier.format(cout.cout)}), puis seulement des pochettes (${PRIX_POCHETTE} chacune), dont les doubles se revendent au marché.`);
if (profilsTemps.length > 0) {
  tableau(
    ["Profil", "statères par mois", "plus rien à acheter après"],
    profilsTemps.map((p) => [p.nom, entier.format(p.revenu), duree(moisPourSOffrir(cout.cout, p.revenu))]),
  );
}
