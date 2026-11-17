import { useEffect, useState } from "preact/hooks";
import { AXES, bilanALEcran, NOM_DE_L_AXE, rangsDesScores, scoresDuBilan, TITRE_DE_L_AXE, type Axe, type BilanALEcran, type GauloisDuBilan, type ScoreDuGaulois } from "../lib/rejeu/bilan-ecran";
import { montantDit } from "../lib/rejeu/journal-ecran";
import type { PortraitDuJournal } from "./JournalDeLaPartie";

interface Props {
  partie: string;
  /** L'adresse du bilan publié de la partie (`/films/<partie>.bilan.json`). */
  adresse: string;
  /** Les Gaulois des membres au pseudo public, par pseudo. */
  portraits: Record<string, PortraitDuJournal>;
}

/** La part d'un axe, en pour cent entiers. */
const pourCent = (part: number) => `${Math.round(part * 100)} %`;

/** Ce que le Gaulois a fait, en mots et en nombres du jeu : la matière des trois barres. */
function faitsEnMots(g: GauloisDuBilan): string[] {
  const dons = [g.troupesDonnees > 0 ? `${montantDit(g.troupesDonnees)} troupes` : null, g.orDonne > 0 ? `${montantDit(g.orDonne)} d'or` : null].filter((x): x is string => x !== null);
  return [
    `${montantDit(g.or)} d'or produit`,
    `${montantDit(g.attaque)} troupes à l'attaque`,
    `${g.prises} ${g.prises > 1 ? "unités ennemies détruites ou prises" : "unité ennemie détruite ou prise"}`,
    `${g.eliminations} ${g.eliminations > 1 ? "éliminations" : "élimination"}, robots compris`,
    dons.length > 0 ? `${dons.join(" et ")} donnés` : "aucun don",
  ];
}

/** Le Gaulois du joueur, en pied, sur le socle à la couleur de sa rareté ; sans dessin, son initiale. */
function Socle({ g, portrait }: { g: GauloisDuBilan; portrait: PortraitDuJournal | undefined }) {
  if (portrait) {
    return (
      <span class="bilan-socle" data-rarete={portrait.rarete ?? undefined} aria-hidden="true">
        <img src={portrait.image} width={portrait.largeur * 2} height={portrait.hauteur * 2} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span class="bilan-socle bilan-socle-sans" aria-hidden="true">
      {g.nom ? [...g.nom][0]!.toLocaleUpperCase("fr") : ""}
    </span>
  );
}

function Carte({ g, score, rang, portrait }: { g: GauloisDuBilan; score: ScoreDuGaulois; rang: number | null; portrait: PortraitDuJournal | undefined }) {
  return (
    <li class="bilan-carte" data-rang={rang !== null && rang <= 3 ? rang : undefined} data-testid="rejeu-bilan-carte">
      <Socle g={g} portrait={portrait} />
      <div class="bilan-corps">
        <p class="bilan-tete">
          {rang !== null && <span class="bilan-rang tnum">{rang}</span>}
          {g.nom ? <b class="bilan-nom">{g.nom}</b> : <span class="bilan-nom bilan-nom-sans">Un Gaulois</span>}
          {score.utilite !== null && (
            <span class="bilan-utilite tnum">
              <b>{score.utilite}</b> d'utilité
            </span>
          )}
        </p>
        {score.titres.length > 0 && (
          <p class="bilan-titres">
            {score.titres.map((a) => (
              <span data-axe={a}>{TITRE_DE_L_AXE[a]}</span>
            ))}
          </p>
        )}
        <dl class="bilan-axes tnum">
          {AXES.map((a: Axe) => {
            const part = score.parts[a];
            return (
              <div data-axe={a}>
                <dt>{NOM_DE_L_AXE[a]}</dt>
                <dd>
                  {part === null ? (
                    <span class="bilan-sans">Rien à partager</span>
                  ) : (
                    <>
                      <span class="bilan-barre" aria-hidden="true">
                        <i style={{ width: `${Math.round(part * 100)}%` }} />
                      </span>
                      {pourCent(part)}
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <p class="bilan-faits tnum">{faitsEnMots(g).join(" · ")}</p>
      </div>
    </li>
  );
}

/**
 * Le bilan des Gaulois, sous le replay (demande du pilote, 17 novembre 2026 : le score de « celui qui a été le plus utile
 * dans la partie », « en thème avec les personnages gaulois des joueurs »). Une carte par joueur au tag du clan, la plus
 * utile d'abord : son Gaulois en pied, son utilité (100 : la part moyenne d'un Gaulois de la partie), ses titres, sa part
 * de l'équipe sur chaque axe, puis les nombres du jeu d'où tout vient (`src/lib/rejeu/bilan.ts`). Rien n'est montré si le
 * bilan ne se lit pas.
 */
export default function BilanDesGaulois({ partie, adresse, portraits }: Props) {
  const [bilan, setBilan] = useState<BilanALEcran | null>(null);
  useEffect(() => {
    let annule = false;
    setBilan(null);
    fetch(adresse, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((brut: unknown) => {
        if (!annule) setBilan(bilanALEcran(brut, partie));
      })
      .catch(() => {
        /* Pas de bilan : le replay et le fil restent. */
      });
    return () => {
      annule = true;
    };
  }, [adresse, partie]);

  if (bilan === null) return null;
  const scores = scoresDuBilan(bilan.gaulois);
  const rangs = rangsDesScores(scores);
  const ordre = bilan.gaulois.map((g, i) => ({ g, score: scores[i]!, rang: rangs[i]! })).sort((a, b) => (b.score.utilite ?? -1) - (a.score.utilite ?? -1));
  const classes = ordre.some((x) => x.score.utilite !== null);
  return (
    <section class="bilan" aria-labelledby="rejeu-bilan-titre" data-testid="rejeu-bilan">
      <h3 id="rejeu-bilan-titre" class="bilan-titre">
        Bilan des Gaulois
      </h3>
      <ol class="bilan-liste">
        {ordre.map(({ g, score, rang }, i) => (
          <Carte key={i} g={g} score={score} rang={rang} portrait={g.nom && !g.enPartie && Object.hasOwn(portraits, g.nom) ? portraits[g.nom] : undefined} />
        ))}
      </ol>
      <p class="bilan-note">
        {classes
          ? "Chaque barre est la part du joueur dans le total des Gaulois de la partie. 100 d'utilité : la part moyenne. La place de départ, les dons reçus et une élimination précoce pèsent sur ce score."
          : bilan.gaulois.length < 2
            ? "Chaque barre est la part du joueur dans le total des Gaulois de la partie. Seul Gaulois de la partie : pas de score d'utilité."
            : "Rien à partager entre les Gaulois de cette partie : pas de score d'utilité."}
      </p>
    </section>
  );
}
