import { useEffect, useRef, useState } from "preact/hooks";
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

/** Un dessin en pixels, d'après ses cases (colonne, rangée) : un carré d'une case par case. */
const chemin = (cases: readonly (readonly [number, number])[]) => cases.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");
/** Un rectangle de cases, bords compris. */
const bloc = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
  const cases: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cases.push([x, y]);
  return cases;
};

/** Les dessins des trois axes, en pixels, 12 cases de côté : dessins du site, décoratifs. `creux` : les cases évidées. */
const DESSINS: Record<Axe, { plein: string; creux: string }> = {
  // Une pièce d'or.
  economie: { plein: "M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z", creux: "M5 3h2v1h1v1H5v1h3v2H7v1H5V8H4V7h3V6H4V4h1z" },
  // Une épée à lame large, la pointe en haut à droite : la lame, la garde en travers, la poignée et son pommeau.
  combat: {
    plein: chemin([
      ...[0, 1, 2, 3, 4, 5].flatMap((k): [number, number][] => [
        [9 - k, 1 + k],
        [10 - k, 1 + k],
        [10 - k, k],
      ]),
      [11, 0],
      [2, 5],
      [3, 6],
      [4, 7],
      [5, 8],
      [6, 9],
      [2, 6],
      [3, 7],
      [4, 8],
      [5, 9],
      [3, 8],
      [2, 9],
      [1, 10],
      [0, 11],
      [0, 10],
      [1, 11],
    ]),
    creux: "",
  },
  // Un cadeau, son ruban en croix.
  soutien: { plein: "M3 1h2v1h2V1h2v2h2v3h-1v5H2V6H1V3h2z", creux: "M5 3h2v8H5zM1 5h10v1H1z" },
};

/**
 * Les dessins des trois titres (demande du pilote, 17 novembre 2026 : « un dessin par titre », à la place de la pastille de
 * texte) : une couronne pour le Trésorier, un casque pour le Fer de lance, une main tendue pour le Ravitailleur.
 */
const TITRES: Record<Axe, string> = {
  economie: chemin([...bloc(2, 6, 9, 9), [2, 4], [2, 5], [9, 4], [9, 5], ...bloc(5, 3, 6, 5), [1, 3], [10, 3], [5, 2], [6, 2]]),
  combat: chemin([...bloc(4, 2, 7, 2), ...bloc(3, 3, 8, 7), ...bloc(2, 8, 9, 8), [3, 9], [3, 10], [8, 9], [8, 10], [5, 1], [6, 1], [5, 0], [1, 4], [1, 5], [2, 5], [10, 4], [10, 5], [9, 5]]),
  soutien: chemin([...bloc(3, 6, 8, 9), ...bloc(3, 3, 3, 5), ...bloc(5, 2, 5, 5), ...bloc(7, 3, 7, 5), [9, 6], [10, 5], [9, 7], ...bloc(4, 10, 7, 11)]),
};

/** Le dessin du titre d'un axe. */
export const IconeDeTitre = ({ axe }: { axe: Axe }) => (
  <svg class="bilan-icone bilan-icone-titre" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">
    <path fill="currentColor" d={TITRES[axe]} />
  </svg>
);

/** Le dessin d'un axe. */
export const IconeDAxe = ({ axe }: { axe: Axe }) => (
  <svg class="bilan-icone" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">
    <path fill="currentColor" fill-rule="evenodd" d={DESSINS[axe].plein} />
    {DESSINS[axe].creux && <path fill="var(--bilan-creux)" d={DESSINS[axe].creux} />}
  </svg>
);

/**
 * La silhouette d'un Gaulois, en ombre (dessin du site, 20 cases sur 32) : pour un joueur sans Gaulois dessiné, à la place de
 * son initiale (demande du pilote, 17 novembre 2026). Le casque et la tête, les tresses, le torse, les bras, les jambes.
 */
const SILHOUETTE = chemin([...bloc(7, 3, 12, 4), ...bloc(6, 5, 13, 12), ...bloc(5, 9, 5, 15), ...bloc(14, 9, 14, 15), ...bloc(8, 13, 11, 13), ...bloc(5, 14, 14, 22), ...bloc(3, 15, 4, 21), ...bloc(15, 15, 16, 21), ...bloc(6, 23, 9, 28), ...bloc(10, 23, 13, 28), ...bloc(5, 29, 9, 30), ...bloc(10, 29, 14, 30)]);
/** La silhouette, en pied. */
export const Silhouette = () => (
  <svg class="bilan-silhouette" viewBox="0 0 20 32" aria-hidden="true" shape-rendering="crispEdges">
    <path fill="currentColor" d={SILHOUETTE} />
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

/** Le Gaulois du joueur, en pied, sur le socle à la couleur de sa rareté ; sans dessin, une silhouette. */
function Socle({ portrait }: { portrait: PortraitDuJournal | undefined }) {
  if (portrait) {
    return (
      <span class="bilan-socle" data-rarete={portrait.rarete ?? undefined} aria-hidden="true">
        <img src={portrait.image} width={portrait.largeur * 2} height={portrait.hauteur * 2} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span class="bilan-socle bilan-socle-sans" aria-hidden="true">
      <Silhouette />
    </span>
  );
}

/** `origine` : sa place dans le bilan publié, stable d'un tri à l'autre (la clé de sa carte). */
type Ligne = { g: GauloisDuBilan; score: ScoreDuGaulois; rang: number | null; portrait: PortraitDuJournal | undefined; origine: number };

function Carte({ g, score, rang, portrait }: Ligne) {
  // La bannière que le membre a choisie pour son Gaulois ; sans elle, le haut de la carte est une case pâle semée de points
  // d'interrogation (`.bilan-haut` d'une carte sans `data-banniere`).
  const banniere = portrait?.banniere ?? null;
  return (
    <li
      class="bilan-carte"
      data-rang={rang !== null && rang <= 3 ? rang : undefined}
      data-rarete={portrait?.rarete ?? undefined}
      data-banniere={banniere ? "membre" : undefined}
      style={banniere ? { "--banniere": `url("${banniere}")` } : undefined}
      data-testid="rejeu-bilan-carte"
    >
      <div class="bilan-haut">
        <Socle portrait={portrait} />
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
                {score.titres.includes(a) && (
                  <span class="bilan-titre-axe">
                    <IconeDeTitre axe={a} />
                    {TITRE_DE_L_AXE[a]}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}

/**
 * Le bilan des Gaulois, sous le replay (demandes du pilote, 17 novembre 2026 : le score de « celui qui a été le plus utile
 * dans la partie », « en thème avec les personnages gaulois des joueurs » ; puis la bannière du joueur sur toute sa carte et
 * une mécanique qui se comprend « sans expliquer à partir de texte » ; puis la silhouette, le cadre de rareté sur toute la
 * carte et une animation douce ; les barres d'équipe, essayées le même jour, ont été retirées : « ça fait doublon avec le
 * reste » ; puis des boutons pour retrier les cartes, un dessin par titre et la première carte en plus grand ; la bannière du
 * clan par défaut, essayée, a été refusée : sans bannière choisie, une case pâle à points d'interrogation). Une carte par joueur au
 * tag du clan, la plus utile d'abord, sur le fond de sa bannière : son Gaulois en pied, son rang, son nom, son utilité sur
 * une jauge dont le milieu est la part moyenne ; trois cases, une par axe, avec son dessin, sa part de l'équipe en grand, sa
 * barre et les nombres du jeu d'où elle vient (`src/lib/rejeu/bilan.ts`). Le premier d'un axe y porte son titre. Les barres
 * se remplissent une fois, doucement, quand le bilan arrive à l'écran (classe `bilan-vu`) : les nombres, eux, sont écrits
 * d'emblée. Rien n'est montré si le bilan ne se lit pas.
 */
export default function BilanDesGaulois({ partie, adresse, portraits }: Props) {
  const [bilan, setBilan] = useState<BilanALEcran | null>(null);
  // L'ordre des cartes : par utilité, ou par la part d'un axe (demande du pilote : « retrier les cartes »).
  const [tri, setTri] = useState<Axe | null>(null);
  const [vu, setVu] = useState(false);
  const section = useRef<HTMLElement>(null);
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
  // Le bilan arrive à l'écran : ses barres se remplissent, une fois. Sans observateur, elles sont pleines d'emblée.
  useEffect(() => {
    const cible = section.current;
    if (!cible || vu) return;
    if (typeof IntersectionObserver === "undefined") {
      setVu(true);
      return;
    }
    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) setVu(true);
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [bilan, vu]);

  if (bilan === null) return null;
  const scores = scoresDuBilan(bilan.gaulois);
  const rangs = rangsDesScores(scores);
  const lignes: Ligne[] = bilan.gaulois
    .map((g, i) => ({ g, score: scores[i]!, rang: rangs[i]!, origine: i, portrait: g.nom && !g.enPartie && Object.hasOwn(portraits, g.nom) ? portraits[g.nom] : undefined }))
    .sort((a, b) => (tri === null ? (b.score.utilite ?? -1) - (a.score.utilite ?? -1) : (b.score.parts[tri] ?? -1) - (a.score.parts[tri] ?? -1) || (b.score.utilite ?? -1) - (a.score.utilite ?? -1)));
  const classes = lignes.some((x) => x.score.utilite !== null);
  return (
    <section ref={section} class={`bilan${vu ? " bilan-vu" : ""}`} aria-labelledby="rejeu-bilan-titre" data-testid="rejeu-bilan">
      <h3 id="rejeu-bilan-titre" class="bilan-titre">
        Bilan des Gaulois
      </h3>
      {classes && (
        <div class="bilan-tris" role="group" aria-label="Classer les cartes">
          <button type="button" class="bilan-tri" aria-pressed={tri === null} onClick={() => setTri(null)} data-testid="rejeu-bilan-tri-utilite">
            Utilité
          </button>
          {AXES.map((a) => (
            <button type="button" class="bilan-tri" data-axe={a} aria-pressed={tri === a} onClick={() => setTri(a)} data-testid={`rejeu-bilan-tri-${a}`}>
              <IconeDAxe axe={a} />
              {NOM_DE_L_AXE[a]}
            </button>
          ))}
        </div>
      )}
      <ol class="bilan-liste" data-tri={tri ?? "utilite"}>
        {lignes.map((l) => (
          <Carte key={l.origine} {...l} />
        ))}
      </ol>
      <p class="bilan-note">
        {classes
          ? "Le pourcentage est la part du joueur dans le total des Gaulois. La place de départ, les dons reçus et une élimination précoce pèsent sur ce score."
          : bilan.gaulois.length < 2
            ? "Seul Gaulois de la partie : pas de score d'utilité."
            : "Rien à partager entre les Gaulois de cette partie : pas de score d'utilité."}
      </p>
    </section>
  );
}
