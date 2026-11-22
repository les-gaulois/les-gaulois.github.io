import { useEffect, useMemo, useState } from "preact/hooks";
import { ServerError, tableauDuel } from "../../../lib/compte/api";
import { tabKeyTarget } from "../../../lib/onglets";
import { sansCadre, type DecorDeBanniere } from "../../../lib/village/decor-banniere";
import { lireLeTableau, type EtatDuTableau, type GauloisDuTableau, type LigneDuTableau, type MaPlace, type PartDeLaSaison, type PartagePrecedent, type SaisonDuTableau } from "../../../lib/village/contrat-tableau";
import { nombre } from "../../../lib/village/ecran-boutique";
import { PART_DE_LA_CAGNOTTE } from "../../../lib/village/contrat-salles";
import { compte, debutDeLaSemaine, jourDeLInstant, jourEnLettres, jourEtHeure, placeEnMots, rangCourt, rangEnMots, TEXTE_DE_L_ESSAI } from "../../../lib/village/ecran-tableau";
import { Etiquette, Px } from "../../jeu/Pixels";
import { PrixDuJeu } from "../BoutiqueDuJeu";
import { ApercuGaulois } from "../Cases";
import { SON } from "../duel/sons-du-duel";
import { iconeCagnotte } from "../duel-salles/dessins-salles";
import type { LibDesBannieres } from "../duel-salles/Match";
import { iconeDeLaSaison, iconeDeLaSemaine, partDeLaCagnotte, placeLibre, podiumVide, type PlaceDuPodium } from "./dessins-tableau";
import { Buste, DessinDeLInsigne, ImageDuTableau, Insignes, Jauge, Medaille, Note, TeteDuTableau } from "./pieces";

/** Ce que l'accueil du duel (`../duel/LeDuel.tsx`, à la session de l'écran du duel) donne au tableau. */
export interface ProprietesDuTableau {
  /** Revenir à l'accueil du duel. */
  retour: () => void;
  /** Le code des bannières, chargé par le duel : `null` tant qu'il charge, `false` s'il n'a pas pu. */
  lib: LibDesBannieres | false | null;
}

type Onglet = "semaine" | "saison";
const ONGLETS: readonly { id: Onglet; mot: string; icone: () => ReturnType<typeof iconeDeLaSemaine> }[] = [
  { id: "semaine", mot: "La semaine", icone: iconeDeLaSemaine },
  { id: "saison", mot: "La saison", icone: iconeDeLaSaison },
];

/** Le message d'un refus du serveur, en mots. */
function messageDuRefus(e: unknown): string {
  const code = e instanceof ServerError ? e.code : "network";
  if (code === "duel_ferme") return "Le duel est fermé pour l'instant.";
  if (code === "rate_limited") return "Trop de demandes d'un coup : réessaie dans une minute.";
  return "Le tableau ne répond pas pour l'instant. Réessaie dans un instant.";
}

/** Le décor d'une bannière, sans son cadre, pour la poser derrière un Gaulois du podium. */
function decorDe(lib: LibDesBannieres | false | null, banniere: string | null): DecorDeBanniere | null {
  if (!lib || !banniere) return null;
  const v = lib.vignetteDeLaBanniere(banniere);
  return v ? sansCadre(v) : null;
}

/** Ce qu'une ligne dit aux lecteurs d'écran : « Quatrième : Brenn, note 58, 12 duels comptés, 8 gagnés, 1 égalité. » */
function phraseDeLaLigne(l: LigneDuTableau): string {
  const egalites = l.egalites ? `, ${compte(l.egalites, "égalité", "égalités")}` : "";
  const insignes = l.insignes ? `, ${compte(l.insignes, "semaine gagnée", "semaines gagnées")}` : "";
  return `${placeEnMots(l.rang)} : ${l.nom ?? "un Gaulois"}${l.moi ? " (toi)" : ""}, note ${l.note}, ${compte(l.duels, "duel compté", "duels comptés")}, ${compte(l.victoires, "gagné", "gagnés")}${egalites}${insignes}`;
}

/* ---------- Le podium ---------- */

/** Le Gaulois d'une marche, devant sa bannière ; sans dessin lisible, la place libre. */
function GauloisDeLaMarche({ g, lib }: { g: GauloisDuTableau; lib: LibDesBannieres | false | null }) {
  const decor = useMemo(() => decorDe(lib, g.banniere), [lib, g.banniere]);
  return g.tenue ? <ApercuGaulois tenue={g.tenue} familier={g.familier} decor={decor} class="dl-apercu-gaulois" /> : <ImageDuTableau cle="place-libre" planche={placeLibre} classe="dt-libre" />;
}

const PLACES_EN_MOTS: Readonly<Record<PlaceDuPodium, string>> = { 1: "Première", 2: "Deuxième", 3: "Troisième" };

/** Ce qu'une marche montre : un classé de la semaine ou de la saison, ou un gagnant d'une saison partagée. */
type Marche = { kind: "classe"; l: LigneDuTableau } | { kind: "partage"; g: GauloisDuTableau | null; stateres: number; moi: boolean } | { kind: "libre" };

function MarcheDuPodium({ place, marche, part, lib }: { place: PlaceDuPodium; marche: Marche; part: PartDeLaSaison | null; lib: LibDesBannieres | false | null }) {
  const moi = (marche.kind === "classe" && marche.l.moi) || (marche.kind === "partage" && marche.moi);
  const finDePart = part ? `, ${part.pourCent} pour cent de la cagnotte, ${nombre(part.montant)} ${part.montant > 1 ? "statères" : "statère"}` : "";
  const dit =
    marche.kind === "classe"
      ? `${phraseDeLaLigne(marche.l)}${finDePart}.`
      : marche.kind === "partage"
        ? `${placeEnMots(place)} : ${marche.g?.nom ?? "un Gaulois"}${marche.moi ? " (toi)" : ""}, ${nombre(marche.stateres)} ${marche.stateres > 1 ? "statères reçus" : "statère reçu"}.`
        : `${PLACES_EN_MOTS[place]} place : personne encore${finDePart}.`;
  const g = marche.kind === "classe" ? marche.l : marche.kind === "partage" ? marche.g : null;
  return (
    <li class="jeu-panneau jeu-n9 dt-marche" data-place={place} data-moi={moi ? "oui" : "non"} data-libre={g ? undefined : "oui"} data-testid={`tableau-marche-${place}`}>
      <span class="sr-only">{dit}</span>
      <Medaille place={place} classe="dt-medaille" />
      {g ? <GauloisDeLaMarche g={g} lib={lib} /> : <ImageDuTableau cle="place-libre" planche={placeLibre} classe="dt-libre" />}
      {g && (
        <span class="dt-marche-nom" aria-hidden="true">
          <span class="dt-nom">
            <Px t={g.nom ?? "Un Gaulois"} couleur="texte" muet />
          </span>
          <span class="dt-marche-court">{g.nom ?? "Un Gaulois"}</span>
          {marche.kind === "classe" && <Insignes n={marche.l.insignes} />}
          {moi && <Etiquette t="Toi" ton="bleu" />}
        </span>
      )}
      {marche.kind === "classe" && (
        <span class="dt-marche-note" aria-hidden="true">
          <Px t="Note" couleur="doux" classe="dt-marche-mot" muet />
          <Note note={marche.l.note} />
        </span>
      )}
      {marche.kind === "partage" ? (
        <span class="dt-part" aria-hidden="true">
          <ImageDuTableau cle={`part-${place}`} planche={() => partDeLaCagnotte(place)} />
          <span class="dt-part-mot">reçus</span>
          <PrixDuJeu valeur={marche.stateres} />
        </span>
      ) : (
        part && (
          <span class="dt-part" aria-hidden="true">
            <ImageDuTableau cle={`part-${place}`} planche={() => partDeLaCagnotte(place)} />
            <span class="dt-part-mot">{part.pourCent} pour cent</span>
            <PrixDuJeu valeur={part.montant} />
          </span>
        )
      )}
    </li>
  );
}

/** Les trois premiers en grand ; personne de classé : les marches vides et ce qu'il faut pour paraître. */
function Podium({ marches, parts, lib, vide }: { marches: Marche[]; parts: PartDeLaSaison[] | null; lib: LibDesBannieres | false | null; vide: preact.ComponentChildren | null }) {
  if (vide) {
    return (
      <div class="jeu-panneau jeu-n9 dl-p dt-vide" data-testid="tableau-vide">
        <ImageDuTableau cle="podium-vide" planche={podiumVide} />
        <p class="dl-p-mot">{vide}</p>
      </div>
    );
  }
  return (
    <ol class="dt-podium" aria-label="Les trois premiers">
      {([1, 2, 3] as const).map((place) => (
        <MarcheDuPodium key={place} place={place} marche={marches[place - 1] ?? { kind: "libre" }} part={parts?.find((p) => p.place === place) ?? null} lib={lib} />
      ))}
    </ol>
  );
}

const marchesDuTableau = (lignes: readonly LigneDuTableau[]): Marche[] =>
  ([1, 2, 3] as const).map((rang) => {
    const l = lignes.find((x) => x.rang === rang);
    return l ? { kind: "classe", l } : { kind: "libre" };
  });

/* ---------- « Ta place » ---------- */

function TaPlace({ moi, minimum, quoi, insignes }: { moi: MaPlace | null; minimum: number; quoi: Onglet; insignes: { semaine: string; note: number }[] }) {
  const p = moi ?? { gaulois: null, rang: null, note: null, duels: 0, victoires: 0, egalites: 0, manque: minimum };
  const ou = quoi === "semaine" ? "cette semaine" : "dans la saison";
  return (
    <div class="jeu-panneau jeu-n9 dl-p dt-moi" data-testid="tableau-moi">
      <div class="dl-p-tete">
        <Px t="Ta place" couleur="texte" />
      </div>
      {p.rang !== null && p.note !== null ? (
        <>
          <div class="dt-moi-corps">
            <span class="dt-moi-rang">
              {p.rang <= 3 && <Medaille place={p.rang as PlaceDuPodium} />}
              <Px t={rangCourt(p.rang)} couleur="texte" dit={`Tu es ${rangEnMots(p.rang)} ${ou}`} />
            </span>
            <div class="dt-moi-chiffres">
              <span class="dt-moi-ligne">
                <Px t="Note" couleur="doux" muet />
                <span class="dt-note">
                  <Px t={String(p.note)} couleur="texte" dit={`Note ${p.note}, 50 étant autant que prévu`} />
                </span>
              </span>
              <span class="dt-moi-ligne">
                <Px t={`${compte(p.duels, "duel", "duels")}, ${compte(p.victoires, "gagné", "gagnés")}`} couleur="doux" dit={`${compte(p.duels, "duel compté", "duels comptés")}, ${compte(p.victoires, "gagné", "gagnés")}`} />
              </span>
            </div>
          </div>
          <Jauge note={p.note} />
        </>
      ) : (
        <>
          <div class="dt-moi-corps">
            <Px t={`Encore ${compte(p.manque, "duel", "duels")}`} couleur="texte" dit={`Encore ${compte(p.manque, "duel compté", "duels comptés")} pour être classé ${ou}`} />
          </div>
          <span class="jeu-tube jeu-n9 jeu-crans dt-jauge" aria-hidden="true">
            <span class={`jeu-plein jeu-n9 jeu-plein-bleu ${p.duels <= 0 ? "jeu-plein-vide" : ""}`} style={`--part:${Math.min(1, p.duels / Math.max(1, minimum))}`} />
          </span>
          <p class="dl-p-mot">Ta note paraît au {rangEnMots(minimum)} duel compté.</p>
        </>
      )}
      {quoi === "semaine" && insignes.length > 0 && (
        <p class="dt-mes-insignes" title={`Semaines gagnées : ${insignes.map((i) => debutDeLaSemaine(i.semaine)).join(", ")}`} data-testid="tableau-mes-insignes">
          <DessinDeLInsigne echelle={2} />
          <Px t={compte(insignes.length, "semaine gagnée", "semaines gagnées")} couleur="or" />
        </p>
      )}
    </div>
  );
}

/* ---------- La semaine d'avant ---------- */

function SemaineDAvant({ precedente }: { precedente: NonNullable<EtatDuTableau["precedente"]> }) {
  const p = precedente.premier;
  if (!p) return null;
  const depuis = debutDeLaSemaine(precedente.semaine);
  return (
    <div class="jeu-panneau jeu-n9 dl-p dt-avant" data-testid="tableau-avant">
      <div class="dl-p-tete">
        <Px t="La semaine d'avant" couleur="texte" />
      </div>
      <div class="dt-avant-corps">
        <span class="sr-only">{`Duelliste de la semaine du ${depuis} : ${p.nom ?? "un Gaulois"}${p.moi ? " (toi)" : ""}, note ${p.note}.`}</span>
        <DessinDeLInsigne echelle={2} />
        <Buste tenue={p.tenue} />
        <span class="dt-nom" aria-hidden="true">
          <Px t={p.nom ?? "Un Gaulois"} couleur="texte" muet />
        </span>
        <Note note={p.note} couleur="or" />
      </div>
      <p class="dl-p-mot">Duelliste de la semaine du {depuis}.</p>
    </div>
  );
}

/* ---------- La liste ---------- */

function LigneDeLaListe({ l, hors = false }: { l: LigneDuTableau; hors?: boolean }) {
  const Balise = hors ? "div" : "li";
  return (
    <Balise class={`dt-ligne ${hors ? "dt-hors" : ""}`} data-moi={l.moi ? "oui" : "non"}>
      <span class="sr-only">{phraseDeLaLigne(l)}.</span>
      <span class="dt-rang" aria-hidden="true">
        <Px t={String(l.rang)} couleur="doux" muet />
      </span>
      <Buste tenue={l.tenue} />
      <span class="dt-qui" aria-hidden="true">
        <span class="dt-nom">
          <Px t={l.nom ?? "Un Gaulois"} couleur="texte" muet />
        </span>
        <Insignes n={l.insignes} />
        {l.moi && <Etiquette t="Toi" ton="bleu" />}
      </span>
      <Jauge note={l.note} />
      <Note note={l.note} />
      <span class="dt-chiffres" aria-hidden="true">
        <span class="dt-n">
          <Px t={String(l.duels)} muet />
          <b>{l.duels}</b>
          <span class="dt-n-mot">{l.duels > 1 ? "duels" : "duel"}</span>
        </span>
        <span class="dt-n">
          <Px t={String(l.victoires)} muet />
          <b>{l.victoires}</b>
          <span class="dt-n-mot">{l.victoires > 1 ? "gagnés" : "gagné"}</span>
        </span>
        <span class="dt-n dt-n-egalites">
          <Px t={String(l.egalites)} muet />
          <b>{l.egalites}</b>
          <span class="dt-n-mot">{l.egalites > 1 ? "égalités" : "égalité"}</span>
        </span>
      </span>
    </Balise>
  );
}

/** La liste, à partir de la quatrième place ; ta ligne dessous si tu es classé après les vingt premiers. */
function Classement({ lignes, moi }: { lignes: readonly LigneDuTableau[]; moi: MaPlace | null }) {
  const suite = lignes.filter((l) => l.rang >= 4);
  const hors = moi?.rang && moi.note !== null && !lignes.some((l) => l.moi) ? moi : null;
  if (!suite.length && !hors) return null;
  return (
    <div class="jeu-panneau jeu-n9 dl-p dt-classement" data-testid="tableau-liste">
      <div class="dt-entete" aria-hidden="true">
        <Px t="Duelliste" couleur="doux" classe="dt-e-qui" muet />
        <span class="dt-e-jauge" />
        <Px t="Note" couleur="doux" classe="dt-e-note" muet />
        <span class="dt-e-chiffres">
          <Px t="Duels" couleur="doux" muet />
          <Px t="Gagnés" couleur="doux" muet />
          <Px t="Égalités" couleur="doux" muet />
        </span>
      </div>
      {suite.length > 0 && (
        <ol class="dt-liste" start={4} aria-label="La suite du tableau">
          {suite.map((l) => (
            <LigneDeLaListe key={l.rang} l={l} />
          ))}
        </ol>
      )}
      {hors && hors.rang !== null && hors.note !== null && (
        <LigneDeLaListe hors l={{ nom: hors.gaulois?.nom ?? null, tenue: hors.gaulois?.tenue ?? null, banniere: hors.gaulois?.banniere ?? null, familier: hors.gaulois?.familier ?? null, rang: hors.rang, note: hors.note, duels: hors.duels, victoires: hors.victoires, egalites: hors.egalites, insignes: 0, moi: true }} />
      )}
    </div>
  );
}

/* ---------- La cagnotte de la saison ---------- */

function Cagnotte({ titre, somme, mot, partagee = false }: { titre: string; somme: number; mot: string; partagee?: boolean }) {
  return (
    <div class="jeu-panneau jeu-n9 dl-p dt-cagnotte" data-testid="tableau-cagnotte">
      <ImageDuTableau cle="cagnotte" planche={iconeCagnotte} />
      <div class="dt-cagnotte-mots">
        <Px t={titre} couleur="doux" muet />
        <span class="sr-only">{`${titre} : ${nombre(somme)} ${somme > 1 ? "statères" : "statère"}.`}</span>
        <span class="dt-cagnotte-somme" aria-hidden="true">
          <PrixDuJeu valeur={somme} />
        </span>
        <p class="dl-p-mot">{mot}</p>
      </div>
      {partagee && (
        <h4 class="jeu-ruban jeu-n9">
          <Px t="Partagée" couleur="creme" relief="ombre" />
        </h4>
      )}
    </div>
  );
}

/** Le podium d'une saison partagée : ce que chacun a reçu. */
function PartageDeLaSaison({ p, lib }: { p: PartagePrecedent; lib: LibDesBannieres | false | null }) {
  const marches: Marche[] = ([1, 2, 3] as const).map((place) => {
    const x = p.places.find((y) => y.place === place);
    return x ? { kind: "partage", g: x.gaulois, stateres: x.stateres, moi: x.moi } : { kind: "libre" };
  });
  return (
    <>
      <p class="dt-quand">
        <b>{p.nom}</b>, partagée le <b>{jourDeLInstant(p.partageeLe)}</b>.
      </p>
      <Cagnotte titre={`Cagnotte de la ${p.nom.toLowerCase()}`} somme={p.cagnotte} partagee mot={`Partagée le ${jourDeLInstant(p.partageeLe)}.${p.reste > 0 ? " Le reste attend la saison suivante." : ""}`} />
      <Podium marches={marches} parts={null} lib={lib} vide={null} />
    </>
  );
}

/* ---------- Le pli des règles ---------- */

function Regles({ e }: { e: EtatDuTableau }) {
  const [a, b, c] = e.regles.parts;
  return (
    <details class="fold dt-regles">
      <summary>Comment on est classé</summary>
      <ul>
        <li>Comptent : le boss du jour, la main de défense d'un autre Gaulois, les salles avec mise.</li>
        <li>Un même adversaire compte une fois par jour, {e.regles.parAdversaire === 2 ? "deux" : e.regles.parAdversaire} fois par semaine.</li>
        <li>La note dit si tu fais mieux que prévu contre chaque adversaire : battre qui tout le monde bat rapporte peu. 50 : autant que prévu.</li>
        <li>Jouer beaucoup ne fait pas monter : seuls les résultats comptent.</li>
        <li>
          Classé à partir de {e.regles.minimumSemaine} duels comptés dans la semaine, {e.regles.minimumSaison} dans la saison.
        </li>
        <li>Le premier de la semaine reçoit l'insigne, le mardi à 21 h 30. Il le garde.</li>
        <li>
          À la fin de la saison, la cagnotte va aux trois premiers : {a}, {b} et {c} pour cent. Ce qui reste va à la saison suivante.
        </li>
      </ul>
      <p data-testid="tableau-essai">{TEXTE_DE_L_ESSAI}</p>
    </details>
  );
}

/* ---------- Les deux vues ---------- */

function VueDeLaSemaine({ e, lib }: { e: EtatDuTableau; lib: LibDesBannieres | false | null }) {
  const s = e.semaine;
  return (
    <>
      <p class="dt-quand">
        Jusqu'au <b>{jourEtHeure(s.fin)}</b>.
      </p>
      <div class="dt-haut">
        <Podium
          marches={marchesDuTableau(s.lignes)}
          parts={null}
          lib={lib}
          vide={
            s.classes === 0 ? (
              <>
                On paraît ici à partir de <b>{compte(s.minimum, "duel compté", "duels comptés")}</b> dans la semaine.
              </>
            ) : null
          }
        />
        <div class="dt-cote">
          <TaPlace moi={s.moi} minimum={s.minimum} quoi="semaine" insignes={e.mesInsignes} />
          {e.precedente && <SemaineDAvant precedente={e.precedente} />}
        </div>
      </div>
      <Classement lignes={s.lignes} moi={s.moi} />
    </>
  );
}

function QuandDeLaSaison({ s }: { s: SaisonDuTableau }) {
  if (!s.commencee) {
    return (
      <p class="dt-quand">
        <b>{s.nom}</b> commence le <b>{jourEnLettres(s.debut)}</b>.
      </p>
    );
  }
  return (
    <p class="dt-quand">
      <b>{s.nom}</b>, {s.finie ? "finie le" : "jusqu'au"} <b>{jourEnLettres(s.fin)}</b>. Partage le <b>{jourEtHeure(s.partageLe)}</b>.
    </p>
  );
}

function VueDeLaSaison({ e, lib }: { e: EtatDuTableau; lib: LibDesBannieres | false | null }) {
  const s = e.saison;
  const motDeLaCagnotte = `Les salles y versent ${PART_DE_LA_CAGNOTTE} pour cent de chaque pot. Les trois premiers de la saison se la partagent.`;
  if (!s) {
    return (
      <>
        <Cagnotte titre="Cagnotte" somme={e.aVenir} mot="Elle attend la prochaine saison." />
        {e.partagePrecedent && <PartageDeLaSaison p={e.partagePrecedent} lib={lib} />}
      </>
    );
  }
  return (
    <>
      <QuandDeLaSaison s={s} />
      <Cagnotte titre="Cagnotte de la saison" somme={s.cagnotte} mot={motDeLaCagnotte} />
      {s.commencee && (
        <>
          <div class="dt-haut">
            <Podium
              marches={marchesDuTableau(s.lignes)}
              parts={s.parts}
              lib={lib}
              vide={
                s.classes === 0 ? (
                  <>
                    On paraît ici à partir de <b>{compte(s.minimum, "duel compté", "duels comptés")}</b> dans la saison.
                  </>
                ) : null
              }
            />
            <div class="dt-cote">
              <TaPlace moi={s.moi} minimum={s.minimum} quoi="saison" insignes={[]} />
            </div>
          </div>
          <Classement lignes={s.lignes} moi={s.moi} />
        </>
      )}
      {e.partagePrecedent && <PartageDeLaSaison p={e.partagePrecedent} lib={lib} />}
    </>
  );
}

/* ---------- L'écran ---------- */

/**
 * « Le tableau » du duel (chantier 5, 22 novembre 2026 ; dessin et spécification de Claude Fable 5.2) : le tableau des
 * duellistes de la semaine et de la saison, la cagnotte de la saison et ses trois parts. Le serveur classe et fait foi
 * (`src/lib/village/contrat-tableau.ts`, la règle dans `src/lib/village/tableau-duel.ts`) ; l'écran lit, une fois à
 * l'ouverture. Les noms du village, jamais un solde.
 */
export default function LeTableau({ retour, lib }: ProprietesDuTableau) {
  const [etat, setEtat] = useState<{ kind: "lecture" } | { kind: "lu"; e: EtatDuTableau } | { kind: "refus"; message: string }>({ kind: "lecture" });
  const [onglet, setOnglet] = useState<Onglet>("semaine");
  useEffect(() => {
    let fini = false;
    tableauDuel.etat().then(
      (brut) => {
        if (fini) return;
        const e = lireLeTableau(brut);
        setEtat(e ? { kind: "lu", e } : { kind: "refus", message: "Le tableau ne répond pas comme prévu. Réessaie dans un instant." });
      },
      (err: unknown) => !fini && setEtat({ kind: "refus", message: messageDuRefus(err) }),
    );
    return () => {
      fini = true;
    };
  }, []);
  const choisir = (o: Onglet): void => {
    if (o === onglet) return;
    SON.clic();
    setOnglet(o);
  };
  const onglets = (
    <div class="dt-onglets" role="tablist" aria-label="Semaine ou saison">
      {ONGLETS.map((o, i) => (
        <button
          key={o.id}
          type="button"
          class="dt-onglet"
          role="tab"
          id={`dt-onglet-${o.id}`}
          aria-selected={onglet === o.id}
          aria-controls={`dt-vue-${o.id}`}
          tabIndex={onglet === o.id ? 0 : -1}
          data-testid={`tableau-onglet-${o.id}`}
          onClick={() => choisir(o.id)}
          onKeyDown={(ev) => {
            const k = tabKeyTarget(ev.key, i, ONGLETS.length);
            if (k === null) return;
            ev.preventDefault();
            const cible = ONGLETS[k]!;
            choisir(cible.id);
            document.getElementById(`dt-onglet-${cible.id}`)?.focus();
          }}
        >
          <ImageDuTableau cle={`onglet-${o.id}`} planche={o.icone} />
          <Px t={o.mot} couleur="texte" classe="dt-onglet-ferme" muet />
          <Px t={o.mot} couleur="encre" classe="dt-onglet-ouvert" muet />
          <span class="sr-only">{o.mot}</span>
        </button>
      ))}
    </div>
  );
  return (
    <section class="dl-ecran dt-tableau" aria-label="Le tableau des duellistes" data-testid="tableau">
      <TeteDuTableau titre="Le tableau" retour={retour} droite={etat.kind === "lu" ? onglets : null} />
      {etat.kind === "lecture" && (
        <p class="dl-attente" role="status">
          Lecture du tableau…
        </p>
      )}
      {etat.kind === "refus" && (
        <p class="ds-refus" role="alert" data-testid="tableau-refus">
          {etat.message}
        </p>
      )}
      {etat.kind === "lu" && (
        <>
          {ONGLETS.map((o) => (
            <div key={o.id} class="dt-vue" role="tabpanel" id={`dt-vue-${o.id}`} aria-labelledby={`dt-onglet-${o.id}`} data-vue={o.id} hidden={onglet !== o.id}>
              {onglet === o.id && (o.id === "semaine" ? <VueDeLaSemaine e={etat.e} lib={lib} /> : <VueDeLaSaison e={etat.e} lib={lib} />)}
            </div>
          ))}
          <Regles e={etat.e} />
        </>
      )}
    </section>
  );
}
