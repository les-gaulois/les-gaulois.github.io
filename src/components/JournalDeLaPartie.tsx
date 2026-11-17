import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { horloge } from "../lib/rejeu/film";
import { accountLabel, accountShort } from "../lib/niveau";
import type { Insignes as InsignesDuJournal } from "../lib/rejeu/insignes";
import { serieEnMots } from "../lib/serie-en-cours";
import { NiveauEmblem } from "./NiveauEmblem";
import { BOMBES, CODES, FAMILLES, NOM_DE_FAMILLE, faitsJusquA, faitsParFamille, journalALEcran, montantAffiche, montantDit, nomDit, secondesDuFait, totauxDesDons, type FaitALEcran, type Famille, type JoueurDuJournal, type JournalALEcran } from "../lib/rejeu/journal-ecran";

/** Le Gaulois d'un membre, tel que la page le passe (`PortraitDeGaulois`, src/lib/gaulois-site.ts), l'adresse déjà complète. */
export interface PortraitDuJournal {
  image: string;
  largeur: number;
  hauteur: number;
  buste: number;
  /** La rareté la plus haute de ce qu'il porte, comme le cadre de sa carte de la vitrine (`rareteDuCadre`) ; `null` sans elle. */
  rarete: string | null;
}

/**
 * Le côté libre de la case de 32 pixels (`.dons-case`), cadre déduit. Le Gaulois y est peint case pour case, sans réduction :
 * plus large qu'elle, il y montre sa tête, cadrée d'après la hauteur de son buste.
 */
const COTE_DE_LA_CASE = 28;
const LARGEUR_DU_GAULOIS = COTE_DE_LA_CASE;
/** Ce que la case montre sous le visage : les épaules sont coupées un peu au-dessus du bas du buste. */
const SOUS_LE_VISAGE = 6;

export type { InsignesDuJournal };
/** La flamme de série et la flamme d'or du record, en images prêtes (construites par la page, `flamme-serie.ts`). */
export interface FlammesDuJournal {
  normale: { image: string; largeur: number; hauteur: number };
  doree: { image: string; largeur: number; hauteur: number };
}

interface Props {
  partie: string;
  /** Le résultat de la partie pour le clan, d'après sa session : la dernière ligne du fil. */
  victoire: boolean;
  /** L'adresse du journal publié de la partie (`/films/<partie>.journal.json`). */
  adresse: string;
  /** Le cadre du replay, et l'adresse de son site : le journal ne l'écoute et ne lui parle que là. */
  cadre: RefObject<HTMLIFrameElement>;
  origine: string;
  /** Les Gaulois des membres au pseudo public, par pseudo. */
  portraits: Record<string, PortraitDuJournal>;
  insignes: Record<string, InsignesDuJournal>;
  flammes: FlammesDuJournal;
}

/**
 * Le niveau du compte (emblème à la couleur du prestige, comme sur la liste des membres) et la flamme de série, après le nom.
 * Les dessins sont décoratifs : ce qu'ils disent est écrit pour les lecteurs d'écran et dans la bulle d'aide.
 */
function Insignes({ de, flammes }: { de: InsignesDuJournal; flammes: FlammesDuJournal }) {
  const flamme = de.flamme ? (de.flamme.doree ? flammes.doree : flammes.normale) : null;
  const serie = de.flamme ? `${serieEnMots(de.flamme)} aujourd'hui${de.flamme.doree ? ", son record" : ""}` : null;
  return (
    <>
      {de.compte && (
        <span class="dons-insigne tnum" title={`${accountLabel(de.compte)} (compte, tout le jeu, aujourd'hui)`}>
          <NiveauEmblem account={de.compte} size="xs" />
          <span aria-hidden="true">{accountShort(de.compte).level}</span>
          <span class="sr-only">, {accountLabel(de.compte)} aujourd'hui, tout le jeu</span>
        </span>
      )}
      {de.flamme && flamme && (
        <span class="dons-insigne tnum" title={`Sa série sous le tag : ${serie}`}>
          <img src={flamme.image} width={flamme.largeur} height={flamme.hauteur} alt="" />
          <span aria-hidden="true">
            {de.flamme.victoires}
            {de.flamme.auMoins && " ou plus"}
          </span>
          <span class="sr-only">, {serie}</span>
        </span>
      )}
    </>
  );
}

/** Les dessins des lignes, en pixels, 12 cases de côté : dessins du site, décoratifs. `creux` : les cases évidées. */
const DESSINS = {
  troupes: { plein: "M5 0h2v1h1v3H7v1h2v1h1v5H2V6h1V5h2V4H4V1h1z", creux: "M5 2h2v1H5zM5 7h2v3H5z" },
  or: { plein: "M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z", creux: "M5 3h2v1h1v1H5v1h3v2H7v1H5V8H4V7h3V6H4V4h1z" },
  elimination: { plein: "M3 1h6v1h1v5H9v1H8v2H7V9H5v1H4V8H3V7H2V2h1z", creux: "M3 4h2v2H3zM7 4h2v2H7z" },
  bombe: { plein: "M8 0h2v1H9v1H8zM6 2h2v2h1v1h1v1h1v4h-1v1H9v1H4v-1H3v-1H2V6h1V5h1V4h2z", creux: "M4 6h1v2H4z" },
  cible: { plein: "M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2zM5 5h2v2H5z", creux: "M4 3h4v1h1v4H8v1H4V8H3V4h1zM5 5h2v2H5z" },
  chat: { plein: "M2 2h8v1h1v5h-1v1H6v1H5v1H4V9H2V8H1V3h1z", creux: "M3 5h1v1H3zM5 5h2v1H5zM8 5h1v1H8z" },
  diplomatie: { plein: "M2 1h1v1h6v1h1v3H9v1H3v4H2z", creux: "" },
} as const;
type Dessin = keyof typeof DESSINS;

const Icone = ({ dessin }: { dessin: Dessin }) => (
  <svg class="dons-icone" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">
    <path fill="currentColor" fill-rule="evenodd" d={DESSINS[dessin].plein} />
    {dessin !== "cible" && DESSINS[dessin].creux && <path fill="var(--dons-creux)" d={DESSINS[dessin].creux} />}
  </svg>
);

/** Le dessin et la teinte d'un fait. */
function dessinDuFait(f: FaitALEcran): Dessin {
  if (f.code === CODES.donTroupes) return "troupes";
  if (f.code === CODES.donOr) return "or";
  if (f.code === CODES.elimination) return "elimination";
  if (f.code === CODES.bombe) return "bombe";
  if (f.code === CODES.cible) return "cible";
  return f.famille === "chat" ? "chat" : "diplomatie";
}
const tonDuFait = (f: FaitALEcran) => (f.code === CODES.donOr ? "or" : f.famille);

/**
 * La case de l'auteur, carrée, comme une carte de la vitrine en petit (demande du pilote, 17 novembre 2026 : « un carré du
 * gaulois à côté de la ligne ») : la tête de son Gaulois (case de 32 px des lignes serrées), peint case pour case, agrandi d'un nombre entier de fois, sur le fond et dans le
 * cadre de sa rareté. Un Gaulois sans dessin : la même case, à son initiale, ou à son numéro sans pseudo public. Un autre
 * joueur : la case neutre, au dessin du fait.
 */
function Visage({ qui, portrait, dessin }: { qui: JoueurDuJournal; portrait: PortraitDuJournal | undefined; dessin: Dessin }) {
  if (portrait) {
    const fois = Math.max(1, Math.floor(LARGEUR_DU_GAULOIS / portrait.largeur));
    return (
      <span class="dons-case" data-rarete={portrait.rarete ?? undefined} aria-hidden="true">
        <img
          src={portrait.image}
          width={portrait.largeur * fois}
          height={portrait.hauteur * fois}
          style={{ top: `${-Math.max(0, (portrait.buste - SOUS_LE_VISAGE) * fois - COTE_DE_LA_CASE)}px` }}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }
  return (
    <span class="dons-case dons-case-sans" aria-hidden="true">
      {qui.camp !== "gaulois" ? <Icone dessin={dessin} /> : qui.nom ? [...qui.nom][0]!.toLocaleUpperCase("fr") : qui.numero || ""}
    </span>
  );
}

const Nom = ({ qui, debut = false }: { qui: JoueurDuJournal; debut?: boolean }) => (qui.nom ? <b class="dons-nom">{qui.nom}</b> : <span class="dons-nom dons-nom-sans">{nomDit(qui, debut)}</span>);

/** « 125 k troupes », « 1,2 M de troupes », « 850 k d'or » : le montant de l'écran du jeu, en mots. */
function montantEnMots(code: number, montant: number): string {
  const n = montantAffiche(code, montant);
  if (code !== CODES.donTroupes) return `${montantDit(n)} d'or`;
  return n >= 1_000_000 ? `${montantDit(n)} de troupes` : `${montantDit(n)} ${n > 1 ? "troupes" : "troupe"}`;
}

/**
 * Qui tient la ligne, et ce qu'elle dit. L'auteur est celui qui agit : pour une alliance acceptée ou refusée, celui qui
 * répond ; pour une alliance finie, le Gaulois des deux.
 */
function ligneDuFait(f: FaitALEcran): { auteur: JoueurDuJournal; texte: ComponentChildren } {
  const autre = f.a;
  switch (f.code) {
    case CODES.donTroupes:
    case CODES.donOr:
      return {
        auteur: f.de,
        texte: (
          <>
            <span class="dons-montant tnum">
              <Icone dessin={f.code === CODES.donOr ? "or" : "troupes"} />
              {montantEnMots(f.code, f.valeur)}
            </span>{" "}
            pour <Nom qui={autre!} />
          </>
        ),
      };
    case CODES.elimination:
      return {
        auteur: f.de,
        texte: (
          <>
            <span class="dons-montant">
              <Icone dessin="elimination" />a éliminé
            </span>{" "}
            <Nom qui={autre!} />
            {f.valeur > 0 && <span class="tnum"> et pris {montantDit(f.valeur)} d'or</span>}
          </>
        ),
      };
    case CODES.bombe:
      return {
        auteur: f.de,
        texte: (
          <>
            <span class="dons-montant">
              <Icone dessin="bombe" />a lancé {BOMBES[f.valeur]}
            </span>
            {autre && (
              <>
                {" "}
                sur <Nom qui={autre} />
              </>
            )}
          </>
        ),
      };
    case CODES.emoji:
      return {
        auteur: f.de,
        texte: (
          <>
            <span class="dons-emoji">{f.texte}</span> {autre ? <>pour <Nom qui={autre} /></> : "pour tous"}
          </>
        ),
      };
    case CODES.cible:
      return {
        auteur: f.de,
        texte: (
          <>
            <span class="dons-montant">
              <Icone dessin="cible" />
              désigne
            </span>{" "}
            <Nom qui={autre!} /> comme cible
          </>
        ),
      };
    case CODES.message: {
      const [avant, ...apres] = f.texte.split("[P1]");
      return {
        auteur: f.de,
        texte: (
          <>
            <q class="dons-phrase">
              {avant}
              {apres.map((morceau) => (
                <>
                  {f.cible ? nomDit(f.cible) : ""}
                  {morceau}
                </>
              ))}
            </q>{" "}
            à <Nom qui={autre!} />
          </>
        ),
      };
    }
    case CODES.allianceDemandee:
      return { auteur: f.de, texte: <>propose une alliance à <Nom qui={autre!} /></> };
    case CODES.allianceAcceptee:
      return { auteur: autre!, texte: <>accepte l'alliance de <Nom qui={f.de} /></> };
    case CODES.allianceRefusee:
      return { auteur: autre!, texte: <>refuse l'alliance de <Nom qui={f.de} /></> };
    case CODES.allianceRompue:
      return { auteur: f.de, texte: <>rompt son alliance avec <Nom qui={autre!} /></> };
    case CODES.allianceFinie: {
      const [gaulois, lAutre] = f.de.camp === "gaulois" || autre!.camp !== "gaulois" ? [f.de, autre!] : [autre!, f.de];
      return { auteur: gaulois, texte: <>n'est plus allié avec <Nom qui={lAutre} /> : l'alliance a pris fin</> };
    }
    case CODES.embargoPose:
      return { auteur: f.de, texte: <>coupe le commerce avec <Nom qui={autre!} /></> };
    default:
      return { auteur: f.de, texte: <>rouvre le commerce avec <Nom qui={autre!} /></> };
  }
}

/**
 * Le journal « Entre Gaulois », à côté du replay (demandes du pilote du 17 novembre 2026 : « un chat des événements entre
 * gal », puis « vas-y ajoute tout ça »). Chaque fait de la partie où un Gaulois est en jeu, noté par le moteur du jeu quand le
 * robot du site l'a rejouée (src/lib/rejeu/journal.ts) : dons, éliminations, bombes, cibles, émojis, messages rapides,
 * alliances, embargos. Le replay vient d'un autre site : il dit où il en est par un message (`pageDuLecteur`), et le journal ne
 * montre alors que ce qui est déjà arrivé, comme un fil de discussion qui se remplit ; un clic sur l'heure d'une ligne y mène
 * le replay. Tant que le replay n'a rien dit, tout le journal est là. Des filtres par famille, quand il y en a plusieurs.
 * Rien n'est montré si le journal ne se lit pas.
 */
export default function JournalDeLaPartie({ partie, victoire, adresse, cadre, origine, portraits, insignes, flammes }: Props) {
  const [journal, setJournal] = useState<JournalALEcran | null>(null);
  // L'étape où en est le replay ; `null` tant qu'il ne l'a pas dite.
  const [etape, setEtape] = useState<number | null>(null);
  const [cachees, setCachees] = useState<readonly Famille[]>([]);
  const fil = useRef<HTMLDivElement>(null);
  const enBas = useRef(true);

  useEffect(() => {
    let annule = false;
    setJournal(null);
    setEtape(null);
    fetch(adresse, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((brut: unknown) => {
        if (!annule) setJournal(journalALEcran(brut, partie));
      })
      .catch(() => {
        /* Journal injoignable : le replay reste, sans lui. */
      });
    return () => {
      annule = true;
    };
  }, [partie, adresse]);

  // Le replay dit son étape quatre fois par seconde : l'écran ne change que si une ligne paraît ou repart.
  const journalRef = useRef<JournalALEcran | null>(null);
  journalRef.current = journal;
  useEffect(() => {
    let vus = -1;
    let fini: boolean | null = null;
    const ecoute = (e: MessageEvent) => {
      if (e.origin !== origine || e.source !== cadre.current?.contentWindow) return;
      const d = e.data as { gal?: unknown; etape?: unknown } | null;
      if (!d || d.gal !== "temps" || typeof d.etape !== "number" || !Number.isSafeInteger(d.etape) || d.etape < 0) return;
      const j = journalRef.current;
      const n = faitsJusquA(j?.faits ?? [], d.etape).length;
      const fin = j !== null && d.etape >= j.fin - MARGE_DE_FIN;
      if (j !== null && n === vus && fin === fini) return;
      vus = j === null ? -1 : n;
      fini = j === null ? null : fin;
      setEtape(d.etape);
    };
    window.addEventListener("message", ecoute);
    return () => window.removeEventListener("message", ecoute);
  }, [partie, origine, cadre]);

  const arrives = journal ? faitsJusquA(journal.faits, etape) : [];
  const montres = arrives.filter((f) => !cachees.includes(f.famille));
  const fini = journal !== null && (etape === null || etape >= journal.fin - MARGE_DE_FIN);
  // Le fil suit la dernière ligne, sauf si le lecteur est remonté le lire.
  useEffect(() => {
    const f = fil.current;
    if (f && enBas.current && etape !== null) f.scrollTop = f.scrollHeight;
  }, [montres.length, fini, etape === null]);

  if (!journal || journal.faits.length === 0) return null;

  const totaux = totauxDesDons(journal.faits);
  const parFamille = faitsParFamille(journal.faits);
  const familles = FAMILLES.filter((f) => parFamille[f] > 0);
  const aVenir = journal.faits.find((f) => !cachees.includes(f.famille) && !arrives.includes(f));
  const aller = (f: FaitALEcran) => {
    try {
      cadre.current?.contentWindow?.postMessage({ gal: "aller", etape: Math.max(0, f.etape - 20) }, origine);
    } catch {
      /* Un cadre parti : rien à déplacer. */
    }
  };

  return (
    <section class="dons" aria-labelledby="dons-titre" data-testid="rejeu-dons" data-compagnon-obstacle>
      <header class="dons-tete">
        <h3 id="dons-titre" class="dons-titre">
          Entre Gaulois
        </h3>
        {(totaux.troupes.dons > 0 || totaux.or.dons > 0) && (
          <ul class="dons-totaux tnum">
            {totaux.troupes.dons > 0 && (
              <li data-ton="dons">
                <Icone dessin="troupes" />
                <span>
                  <b>{montantDit(totaux.troupes.somme)}</b> de troupes en {totaux.troupes.dons > 1 ? `${totaux.troupes.dons} dons` : "1 don"}
                </span>
              </li>
            )}
            {totaux.or.dons > 0 && (
              <li data-ton="or">
                <Icone dessin="or" />
                <span>
                  <b>{montantDit(totaux.or.somme)}</b> d'or en {totaux.or.dons > 1 ? `${totaux.or.dons} dons` : "1 don"}
                </span>
              </li>
            )}
          </ul>
        )}
        {familles.length > 1 && (
          <div class="dons-filtres" role="group" aria-label="Lignes montrées">
            {familles.map((f) => (
              <button
                type="button"
                class="dons-filtre tnum"
                data-ton={f}
                aria-pressed={!cachees.includes(f)}
                onClick={() => setCachees(cachees.includes(f) ? cachees.filter((c) => c !== f) : [...cachees, f])}
                data-testid={`rejeu-filtre-${f}`}
              >
                {NOM_DE_FAMILLE[f]} <span>{parFamille[f]}</span>
              </button>
            ))}
          </div>
        )}
      </header>
      <div
        class="dons-fil"
        ref={fil}
        tabIndex={0}
        role="group"
        aria-label="Événements entre Gaulois, dans l'ordre de la partie"
        onScroll={(e) => {
          const f = e.currentTarget;
          enBas.current = f.scrollHeight - f.scrollTop - f.clientHeight < 24;
        }}
      >
        {montres.length === 0 && !fini && aVenir && <p class="dons-attente tnum">Première ligne à {horloge(secondesDuFait(aVenir.etape))}</p>}
        {(montres.length > 0 || fini) && (
          <ol class="dons-liste">
            {montres.map((f, i) => {
              const moment = horloge(secondesDuFait(f.etape));
              const { auteur, texte } = ligneDuFait(f);
              return (
                <li key={`${f.etape}-${f.code}-${i}`} class="dons-message" data-ton={tonDuFait(f)} data-famille={f.famille}>
                  <Visage qui={auteur} portrait={auteur.camp === "gaulois" && auteur.nom && !auteur.enPartie && Object.hasOwn(portraits, auteur.nom) ? portraits[auteur.nom] : undefined} dessin={dessinDuFait(f)} />
                  {/* Un fait par ligne (choix du pilote sur maquettes, 17 novembre 2026) : qui, ce qu'il fait, puis l'heure. */}
                  <p class="dons-quoi">
                    <Nom qui={auteur} debut />
                    {auteur.nom && !auteur.enPartie && !auteur.nom.startsWith("[") && (auteur.camp === "gaulois" || auteur.camp === "equipe") && Object.hasOwn(insignes, auteur.nom) && <Insignes de={insignes[auteur.nom]!} flammes={flammes} />} {texte}
                  </p>
                  {etape !== null ? (
                    <button type="button" class="dons-heure tnum" onClick={() => aller(f)} aria-label={`Aller à ${moment} dans le replay`}>
                      {moment}
                    </button>
                  ) : (
                    <span class="dons-heure tnum">{moment}</span>
                  )}
                </li>
              );
            })}
            {fini && (
              <li class="dons-fin" data-resultat={victoire ? "victoire" : "defaite"} data-testid="rejeu-dons-fin">
                <span class="tnum">{horloge(secondesDuFait(journal.fin))}</span> Fin de la partie : {victoire ? "victoire" : "défaite"}
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}

/** Le replay s'arrête une ou deux étapes avant la dernière du rejeu : la fin est dite dès la dernière seconde. */
const MARGE_DE_FIN = 10;
