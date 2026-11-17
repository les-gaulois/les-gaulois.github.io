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

/** Les dessins des trois axes, en pixels, 12 cases de côté : dessins du site, décoratifs. `creux` : les cases évidées. */
const DESSINS: Record<Axe, { plein: string; creux: string }> = {
  // Une pièce d'or.
  economie: { plein: "M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z", creux: "M5 3h2v1h1v1H5v1h3v2H7v1H5V8H4V7h3V6H4V4h1z" },
  // Une épée, la pointe en haut à droite, la garde en bas à gauche.
  combat: { plein: "M9 1h2v2h-1v1H9v1H8v1H7v1H6v1H5v1h1v1H5v1H4v-1H3v1H2v1H1v-2h1V9H1V8h1v1h1V8h1V7h1V6h1V5h1V4h1V3h1z", creux: "" },
  // Un cadeau, son ruban en croix.
  soutien: { plein: "M3 1h2v1h2V1h2v2h2v3h-1v5H2V6H1V3h2z", creux: "M5 3h2v8H5zM1 5h10v1H1z" },
};

/** Le dessin d'un axe. */
export const IconeDAxe = ({ axe }: { axe: Axe }) => (
  <svg class="bilan-icone" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">
    <path fill="currentColor" fill-rule="evenodd" d={DESSINS[axe].plein} />
    {DESSINS[axe].creux && <path fill="var(--bilan-creux)" d={DESSINS[axe].creux} />}
  </svg>
);

/** L'échelle de la jauge d'utilité : 100, la part moyenne, est au milieu ; au-delà de 200, la jauge est pleine. */
const JAUGE_MAX = 200;

/** Les nombres du jeu derrière chaque axe : le premier en grand, le second dessous quand il y en a un. */
function nombresDeLAxe(g: GauloisDuBilan, axe: Axe): { grand: string; petit: string | null } {
  if (axe === "economie") return { grand: `${montantDit(g.or)} d'or`, petit: null };
  if (axe === "combat") return { grand: `${montantDit(g.attaque)} troupes`, petit: g.prises > 0 ? `${g.prises} ${g.prises > 1 ? "prises" : "prise"}` : null };
  const troupes = g.troupesDonnees > 0 ? `${montantDit(g.troupesDonnees)} troupes` : null;
  const or = g.orDonne > 0 ? `${montantDit(g.orDonne)} d'or` : null;
  return { grand: troupes ?? or ?? "Aucun don", petit: troupes && or ? or : null };
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
  const banniere = portrait?.banniere ?? null;
  return (
    <li
      class="bilan-carte"
      data-rang={rang !== null && rang <= 3 ? rang : undefined}
      data-banniere={banniere ? "" : undefined}
      style={banniere ? { "--banniere": `url("${banniere}")` } : undefined}
      data-testid="rejeu-bilan-carte"
    >
      <div class="bilan-haut">
        <Socle g={g} portrait={portrait} />
        <div class="bilan-identite">
          <p class="bilan-tete">
            {rang !== null && <span class="bilan-rang tnum">{rang}</span>}
            {g.nom ? <b class="bilan-nom">{g.nom}</b> : <span class="bilan-nom bilan-nom-sans">Un Gaulois</span>}
          </p>
          {score.utilite !== null && (
            <>
              <p class="bilan-utilite tnum">
                <b>{score.utilite}</b> d'utilité
              </p>
              {/* La jauge : le repère du milieu est la part moyenne d'un Gaulois de la partie, 100. */}
              <div class="bilan-jauge" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.round((score.utilite / JAUGE_MAX) * 100))}%` }} />
                <span class="bilan-jauge-repere" />
              </div>
              <p class="bilan-jauge-mots" aria-hidden="true">
                <span>0</span>
                <span>moyenne</span>
                <span>le double</span>
              </p>
            </>
          )}
        </div>
      </div>
      <dl class="bilan-axes tnum">
        {AXES.map((a: Axe) => {
          const part = score.parts[a];
          const { grand, petit } = nombresDeLAxe(g, a);
          return (
            <div data-axe={a} data-titre={score.titres.includes(a) ? "" : undefined}>
              <dt>
                <IconeDAxe axe={a} />
                {NOM_DE_L_AXE[a]}
              </dt>
              <dd>
                {part === null ? (
                  <span class="bilan-sans">Rien à partager</span>
                ) : (
                  <>
                    <b class="bilan-part">{Math.round(part * 100)} %</b>
                    <span class="bilan-barre" aria-hidden="true">
                      <i style={{ width: `${Math.round(part * 100)}%` }} />
                    </span>
                  </>
                )}
                <span class="bilan-nombre">{grand}</span>
                {petit && <span class="bilan-nombre">{petit}</span>}
                {score.titres.includes(a) && <span class="bilan-titre-axe">{TITRE_DE_L_AXE[a]}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}

/**
 * Le bilan des Gaulois, sous le replay (demande du pilote, 17 novembre 2026 : le score de « celui qui a été le plus utile
 * dans la partie », « en thème avec les personnages gaulois des joueurs », puis, devant le premier jet : la bannière du
 * joueur sur toute sa carte, et une mécanique qui se comprend « sans expliquer à partir de texte »). Une carte par joueur
 * au tag du clan, la plus utile d'abord, sur le fond de sa bannière : son Gaulois en pied, son rang, son nom, son utilité
 * sur une jauge dont le milieu est la part moyenne ; puis trois cases, une par axe, avec son dessin, sa part de l'équipe en
 * grand, sa barre, et les nombres du jeu d'où elle vient (`src/lib/rejeu/bilan.ts`). Le premier d'un axe y porte son titre.
 * Rien n'est montré si le bilan ne se lit pas.
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
      {/* La clé, en dessins : ce que compte chaque axe, et ce que dit le pourcentage. */}
      <ul class="bilan-cle">
        <li data-axe="economie">
          <IconeDAxe axe="economie" />
          Or produit
        </li>
        <li data-axe="combat">
          <IconeDAxe axe="combat" />
          Attaques et prises
        </li>
        <li data-axe="soutien">
          <IconeDAxe axe="soutien" />
          Dons aux alliés
        </li>
        <li class="bilan-cle-part">Le pourcentage : sa part du total des Gaulois</li>
      </ul>
      <ol class="bilan-liste">
        {ordre.map(({ g, score, rang }, i) => (
          <Carte key={i} g={g} score={score} rang={rang} portrait={g.nom && !g.enPartie && Object.hasOwn(portraits, g.nom) ? portraits[g.nom] : undefined} />
        ))}
      </ol>
      <p class="bilan-note">
        {classes
          ? "La place de départ, les dons reçus et une élimination précoce pèsent sur ce score."
          : bilan.gaulois.length < 2
            ? "Seul Gaulois de la partie : pas de score d'utilité."
            : "Rien à partager entre les Gaulois de cette partie : pas de score d'utilité."}
      </p>
    </section>
  );
}
