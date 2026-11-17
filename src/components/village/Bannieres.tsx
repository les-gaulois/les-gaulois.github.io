import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { motionAllowed } from "../../lib/fx/motion";
import { ORDRE_RARETES, RARETES, type Rarete, type Tenue } from "../../lib/gaulois";
import type { Banniere, EtatDeLaBanniere } from "../../lib/village/bannieres";
import { adresseDansLaBoutique } from "../../lib/village/boutique-rayons";
import type { MesBannieres, PochetteBannieresReponse } from "../../lib/village/contrat";
import { sansCadre, type DecorDeBanniere } from "../../lib/village/decor-banniere";
import { trierParRarete } from "../../lib/village/livre-bannieres";
import { ANCRE_BANNIERES, BANNIERE_HAUTEUR, BANNIERE_LARGEUR, apresLAchat, banniereDOuverture, idsDesBannieres, messageDuRefusDAchat, raisonDeLaBanniere, raisonDeLaPochetteDesBannieres, sansBanniere } from "../../lib/village/ecran-bannieres";
import { manque, motStatere, nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import type { Familier } from "../../lib/village/familiers";
import { Problem, Success, messageOf } from "../compte/common";
import { AlbumDePochette } from "./AlbumPochette";
import { Compte, Dialogue, PochetteGagneeIci, Refus, type BandeVue, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Piece, Pixels, Prix, peindre } from "./BoutiquePixels";
import { POCHETTE_BANNIERES_COTE, casesDeLaPochetteBannieres } from "./PochetteBannieresDessin";
import { LivreDesBannieres } from "./LivreDesBannieres";
import { BoutonSon, Tambour, preparerLeSon, useSonDuTambour } from "./Tambour";

/**
 * Les bannières du Gaulois à l'écran (15 novembre 2026, demande du pilote : « un lot de bannières », « achetables par
 * statères », « il pourra choisir la bannière qui s'affichera en faisant /gaulois ») : l'onglet « Bannière » des rayons
 * de « La boutique » (`SectionDesBannieres`) et le choix de la bannière de /gaulois dans « Mon Gaulois » (`MaBanniere`).
 * Le serveur décide de tout par `get_mes_bannieres`, `acheter_banniere`, `ouvrir_pochette_bannieres` (la pochette des
 * bannières, 16 novembre 2026) et `choisir_banniere` ; l'écran ne montre que ce qu'il a reçu.
 *
 * La liste et les dessins des bannières pèsent lourd : `src/lib/village/bannieres.ts` n'est chargé qu'ici, par un
 * `import()`, quand l'un des deux écrans s'affiche. Rien d'autre de ce fichier ne l'importe, sauf ses types.
 */
type Lib = typeof import("../../lib/village/bannieres");

let chargement: Promise<Lib> | null = null;
/** Le code des bannières, chargé une seule fois pour la page ; un échec se retente à la lecture suivante. */
export function charger(): Promise<Lib> {
  chargement ??= import("../../lib/village/bannieres").catch((e: unknown) => {
    chargement = null;
    throw e;
  });
  return chargement;
}

/** Les bannières du compte : en lecture, en panne (le reste de la page marche quand même), sans aucune bannière, ou lues. */
export type EtatDesBannieres = { kind: "lecture" } | { kind: "panne" } | { kind: "aucune" } | { kind: "pret"; mes: MesBannieres; lib: Lib };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/**
 * Les bannières du compte connecté et ce qu'il peut en faire. `lire` ne lève jamais : une panne se range dans l'état
 * (`discret` : une relecture, qui garde ce qui est à l'écran). `leger` (« Mon Gaulois ») : un compte sans bannière ne
 * charge pas les dessins. `acheter` et `choisir` rendent le résultat du serveur ou les mots de son refus ; après un refus
 * d'achat, les bannières se relisent, pour dire ce qui manque d'après le serveur.
 */
/** L'annonce d'une bannière choisie : le décor derrière le Gaulois se relit. */
export const BANNIERE_CHOISIE = "gal:banniere-choisie";

/**
 * Le décor derrière le Gaulois de « Mon Gaulois » et de la boutique : la toile de la bannière qu'il montre sur /gaulois,
 * sans son cadre, comme le fait le sentier ; `null` sans bannière, ou tant qu'elle n'est pas lue. `actif` : un visiteur sans
 * compte ne demande rien au serveur. De l'habillage : une
 * panne le laisse de côté.
 */
export function useDecorDuGaulois(actif = true): DecorDeBanniere | null {
  const { etat, lire } = useBannieres({ leger: true });
  useEffect(() => {
    if (!actif) return;
    void lire();
    const relire = (): void => void lire(true);
    window.addEventListener(BANNIERE_CHOISIE, relire);
    return () => window.removeEventListener(BANNIERE_CHOISIE, relire);
  }, [actif, lire]);
  const lib = etat.kind === "pret" ? etat.lib : null;
  const portee = etat.kind === "pret" ? etat.mes.porte : null;
  return useMemo(() => {
    const scene = lib && portee ? lib.vignetteDeLaBanniere(portee) : null;
    return scene ? sansCadre(scene) : null;
  }, [lib, portee]);
}

export function useBannieres({ leger = false }: { leger?: boolean } = {}) {
  const [etat, setEtat] = useState<EtatDesBannieres>({ kind: "lecture" });

  const lire = useCallback(
    async (discret = false): Promise<MesBannieres | null> => {
      const dessins = leger ? null : charger().catch(() => null);
      const reponse = await call<unknown>("get_mes_bannieres").catch(() => null);
      if (leger && sansBanniere(reponse)) {
        setEtat({ kind: "aucune" });
        return null;
      }
      const lib = reponse === null ? null : await (dessins ?? charger().catch(() => null));
      const mes = lib ? lib.lireMesBannieres(reponse) : null;
      if (lib && mes) setEtat({ kind: "pret", mes, lib });
      else if (!discret) setEtat({ kind: "panne" });
      return mes;
    },
    [leger],
  );

  const acheter = useCallback(
    async (banniere: Banniere, prix: number): Promise<Issue<number>> => {
      const lib = await charger().catch(() => null);
      if (!lib) return { ok: false, message: ILLISIBLE };
      try {
        // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
        const achat = lib.lireAchatBanniere(await call<unknown>("acheter_banniere", { p_banniere: banniere.id, p_prix_vu: prix }));
        if (!achat) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { ...e, mes: apresLAchat(e.mes, achat, new Date().toISOString()) } : e));
        return { ok: true, valeur: achat.solde };
      } catch (e) {
        if (!(e instanceof ServerError)) return { ok: false, message: messageOf(e) };
        const fraiche = await lire(true);
        return { ok: false, message: messageDuRefusDAchat(e.code, lib.messageDesBannieres, { manque: fraiche ? manque(fraiche.solde, fraiche.prix[banniere.rarete]) : null }) };
      }
    },
    [lire],
  );

  /**
   * Ouvrir une pochette des bannières : le serveur tire, débite et répond le trésor reçu, que les bannières du compte
   * prennent aussitôt, ou les statères qu'elle rend. Après un refus, elles se relisent, pour dire ce qui manque d'après le serveur.
   */
  const ouvrir = useCallback(
    async (prix: number): Promise<Issue<PochetteBannieresReponse>> => {
      const lib = await charger().catch(() => null);
      if (!lib) return { ok: false, message: ILLISIBLE };
      try {
        // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
        const tirage = lib.lirePochetteBannieres(await call<unknown>("ouvrir_pochette_bannieres", { p_prix_vu: prix }));
        if (!tirage) return { ok: false, message: ILLISIBLE };
        setEtat((e) => (e.kind === "pret" ? { ...e, mes: lib.apresLaPochetteDesBannieres(e.mes, tirage, new Date().toISOString()) } : e));
        return { ok: true, valeur: tirage };
      } catch (e) {
        if (!(e instanceof ServerError)) return { ok: false, message: messageOf(e) };
        const fraiche = await lire(true);
        return { ok: false, message: messageDuRefusDAchat(e.code, lib.messageDesBannieres, { manque: fraiche?.pochette ? manque(fraiche.solde, fraiche.pochette.prix) : null }) };
      }
    },
    [lire],
  );

  const choisir = useCallback(async (id: string | null): Promise<Issue<string | null>> => {
    const lib = await charger().catch(() => null);
    if (!lib) return { ok: false, message: ILLISIBLE };
    try {
      const choix = lib.lireChoixBanniere(await call<unknown>("choisir_banniere", { p_banniere: id }));
      if (!choix) return { ok: false, message: ILLISIBLE };
      setEtat((e) => (e.kind === "pret" ? { ...e, mes: { ...e.mes, porte: choix.porte } } : e));
      window.dispatchEvent(new CustomEvent(BANNIERE_CHOISIE));
      return { ok: true, valeur: choix.porte };
    } catch (e) {
      return { ok: false, message: e instanceof ServerError ? lib.messageDesBannieres(e.code) : messageOf(e) };
    }
  }, []);

  return { etat, lire, acheter, ouvrir, choisir };
}

/* Les dessins lourds se font un à un, chacun dans son propre tour de la boucle du navigateur : la page ne se fige pas. */
const file: (() => void)[] = [];
let enCours = false;
function suivante(): void {
  const tache = file.shift();
  if (!tache) {
    enCours = false;
    return;
  }
  tache();
  setTimeout(suivante, 0);
}
function plusTard(tache: () => void): void {
  file.push(tache);
  if (enCours) return;
  enCours = true;
  setTimeout(suivante, 0);
}

/**
 * Le Gaulois du membre (sa tenue enregistrée, et son familier s'il en montre un) devant une bannière, comme /gaulois la
 * montrera, sans le logo du clan ni les insignes. Une image : son texte de remplacement la nomme, la description de la
 * bannière est écrite à côté.
 */
function Scene({ lib, banniere, tenue, familier, class: classe = "" }: { lib: Lib; banniere: Banniere; tenue: Tenue; familier: Familier | null; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => lib.sceneDeLaBanniere(banniere.id, tenue, familier), [lib, banniere.id, tenue, familier]);
  useEffect(() => {
    if (scene) peindre(toile.current, scene.largeur, scene.hauteur, scene.cases);
  }, [scene]);
  return <canvas ref={toile} width={BANNIERE_LARGEUR} height={BANNIERE_HAUTEUR} class={`pixels banniere-scene ${classe}`} role="img" aria-label={`Votre Gaulois devant la bannière « ${banniere.nom} »`} data-testid="banniere-scene" data-banniere={banniere.id} />;
}

/** Le repère de forme d'une rareté, de un à cinq losanges : le même que sur les cases. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="filtre-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** La rareté d'une bannière hors d'une case : écrite et comptée en losanges, dans la couleur de la rareté. */
function RareteDeLaBanniere({ rarete }: { rarete: Rarete }) {
  return (
    <span class="banniere-rarete" data-rarete={rarete}>
      <MarqueDeRarete rarete={rarete} />
    </span>
  );
}

/**
 * Ce qu'une bannière est pour ce compte, en deux mots : rien pour une bannière à acheter (son prix le dit), « Pochette »
 * pour un trésor qu'il n'a pas (il ne s'achète pas).
 */
function MotsDeLEtat({ etat }: { etat: EtatDeLaBanniere }) {
  if (etat === "a-acheter") return null;
  return (
    <span class="banniere-etat" data-etat={etat}>
      {etat === "montree" ? "Sur /gaulois" : etat === "a-gagner" ? "Pochette" : "À vous"}
    </span>
  );
}

const CASES_POCHETTE = casesDeLaPochetteBannieres();

/** Le dessin de la pochette des bannières, décoratif : son nom est écrit à côté. */
export function DessinPochetteBannieres({ echelle, class: classe = "" }: { echelle: number; class?: string }) {
  return <Pixels largeur={POCHETTE_BANNIERES_COTE} hauteur={POCHETTE_BANNIERES_COTE} cases={CASES_POCHETTE} echelle={echelle} class={classe} />;
}

/** Les losanges d'une rareté, de un à cinq, décoratifs : le repère de forme des cases. */
function LosangesDeCase({ rang }: { rang: number }) {
  return (
    <span class="case-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * La pochette des bannières, dans l'onglet « Pochettes » de la boutique : la seule façon d'avoir un trésor de la pochette. Son
 * dessin, son prix (celui du serveur), combien de trésors le compte a, ses chances, toujours écrites avant d'ouvrir (la
 * part des pochettes qui rendent des statères, puis chaque rareté, 100 en tout), et le bouton d'ouverture, ou la raison
 * pour laquelle il ne peut pas ouvrir. Le dessin ouvre l'album de ses trésors (`AlbumPochette.tsx`), chacun avec sa chance.
 */
function PochetteDesBannieres({ lib, mes, possedees, raison, onOuvrir }: { lib: Lib; mes: MesBannieres & { pochette: NonNullable<MesBannieres["pochette"]> }; possedees: ReadonlySet<string>; raison: string | null; onOuvrir: () => void }) {
  const pochette = mes.pochette;
  // Les chances à chaque pochette : celles du serveur, ramenées à la part des pochettes qui donnent un trésor.
  const chances = useMemo(() => lib.chancesDUnTresor(pochette), [lib, pochette]);
  const lignes = lib.lignesDesChancesDesTresors(chances, possedees);
  const aMoi = lib.TRESORS.filter((b) => possedees.has(b.id)).length;
  const rendus = lib.rendusDesPaliers(pochette.prix, pochette.paliers);
  // La part des statères rendus pour ce compte : celle du serveur, plus les chances des raretés où il a tout.
  const chanceRendus = lib.chanceDesStateresRendus(pochette, possedees) ?? 0;
  const rembourse = chanceRendus > 1e-9 && rendus.length > 0;
  // L'album se calcule sur les bannières reçues du serveur (un nouvel ensemble à chaque rendu ne le recalculerait pas).
  const lireAlbum = useCallback(() => lib.albumDesTresors(chances, idsDesBannieres(mes)), [lib, chances, mes]);
  // Les trésors se peignent en arrière-plan, un par tour de la boucle : au premier survol, l'album les trouve prêts. Les
  // dessiner tous d'un coup à l'ouverture figerait la page une bonne demi-seconde.
  useEffect(() => {
    for (const tresor of lib.TRESORS) plusTard(() => void lib.dessinDeLaBanniere(tresor.id));
  }, [lib]);
  return (
    <section class="bannieres-pochette" aria-labelledby="bannieres-pochette-titre" data-testid="bannieres-pochette">
      <AlbumDePochette lireAlbum={lireAlbum} nombre={lib.TRESORS.length} nom="Voir les trésors de la pochette des bannières" testid="bannieres-pochette">
        <DessinPochetteBannieres echelle={4} class="bannieres-pochette-dessin" />
      </AlbumDePochette>
      <div class="bannieres-pochette-nom">
        <h4 id="bannieres-pochette-titre" class="nom-champ bannieres-pochette-titre">
          La pochette des bannières
        </h4>
        <Prix montant={mes.pochette.prix} class="bannieres-pochette-prix" />
        <p class="bannieres-pochette-compte" data-testid="bannieres-pochette-compte">
          <strong class="tnum">{aMoi}</strong> sur {lib.TRESORS.length} trésors à vous
        </p>
        {raison ? (
          <p class="pochette-raison" data-testid="bannieres-pochette-raison">
            {raison}
          </p>
        ) : (
          <div>
            <button type="button" class="btn btn-primary" onClick={onOuvrir} data-testid="bannieres-pochette-ouvrir">
              Ouvrir une pochette
            </button>
          </div>
        )}
      </div>
      {lignes && (
        <ul class="pochette-chances bannieres-pochette-chances" aria-label="Vos chances à chaque pochette" data-testid="bannieres-pochette-chances">
          {rembourse && (
            <li class="bannieres-chance-rendu" data-testid="bannieres-pochette-rendu">
              <Piece />
              <span class="pochette-rarete">
                Statères rendus
                <small>
                  de {nombre(Math.min(...rendus))} à {stateres(Math.max(...rendus))}
                </small>
              </span>
              <span class="tnum">{pourcent(chanceRendus)}</span>
            </li>
          )}
          {lignes.map(({ rarete, chance, reste }) => (
            <li key={rarete} data-rarete={rarete}>
              <LosangesDeCase rang={RARETES[rarete].rang} />
              <span class="pochette-rarete">{RARETES[rarete].nom}</span>
              {reste > 0 ? <span class="tnum">{pourcent(chance)}</span> : <span class="bannieres-pochette-complet">toutes à vous</span>}
            </li>
          ))}
        </ul>
      )}
      <p class="pochette-note bannieres-pochette-regle">Les trésors de la pochette ne s'obtiennent qu'ici, jamais à la boutique. La pochette ne donne jamais une bannière que vous avez déjà.</p>
    </section>
  );
}

/**
 * Ouvrir une pochette des bannières : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis fait tourner le
 * tambour (`Tambour.tsx`) jusqu'au trésor reçu et, un instant après l'arrêt, le montre en grand, derrière le Gaulois du
 * membre. Le tambour ne fait défiler que des trésors que ce compte n'avait pas, aux chances qu'avait sa pochette
 * (`bandeDesTresors`) : il ne fait que montrer ce que le serveur a déjà tiré. Une pochette qui rend des statères ne fait
 * pas tourner le tambour : la fenêtre dit aussitôt combien, et quelle part du prix. « Passer » l'arrête ; animations coupées, il
 * ne tourne pas. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les mots du refus et « Fermer ».
 */
function DialoguePochetteBannieres({ lib, prix, chances, possedees, solde, tenue, familier, ouvrir, montrer, dejaMontree, onFermer }: { lib: Lib; prix: number; chances: Readonly<Record<Rarete, number>>; possedees: ReadonlySet<string>; solde: number; tenue: Tenue; familier: Familier | null; ouvrir: () => Promise<Issue<PochetteBannieresReponse>>; montrer: (id: string) => Promise<Issue<string | null>>; dejaMontree: (id: string) => boolean; onFermer: (recue: string | null) => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "arrete" | "revele" | "pose">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteBannieresReponse | null>(null);
  const [bande, setBande] = useState<BandeVue | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  // Ce que ce compte avait en ouvrant : la pochette a tiré parmi les autres trésors, le tambour aussi.
  const [avant] = useState(possedees);
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    const recue = issue.ok && issue.valeur.banniere ? lib.banniereParId(issue.valeur.banniere.banniere) : null;
    if (issue.ok && recue) {
      const tour = lib.bandeDesTresors(recue, chances, avant);
      setBande({ depart: tour.depart, cible: tour.cible, rangees: tour.rangees.map((rangee) => ({ nom: rangee.valeur.nom, rarete: rangee.rarete, dessin: lib.vignetteDeLaBanniere(rangee.valeur.id) })) });
      setTirage(issue.valeur);
      setEtape("tourne");
    } else if (issue.ok) {
      setTirage(issue.valeur);
      setEtape("revele");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  // Le tambour arrêté reste un instant, le temps de voir la rareté fêtée, puis la bannière paraît en grand.
  useEffect(() => {
    if (etape !== "arrete") return;
    const minuterie = window.setTimeout(() => setEtape("revele"), motionAllowed() ? 1600 : 0);
    return () => window.clearTimeout(minuterie);
  }, [etape]);
  const recue = tirage?.banniere ? lib.banniereParId(tirage.banniere.banniere) : null;
  const rendu = tirage?.remboursement ?? null;
  const tourne = etape === "tourne" || etape === "arrete";
  const revelee = etape === "revele" || etape === "pose";
  const fermer = () => onFermer(recue?.id ?? null);
  const poser = async () => {
    if (!recue) return;
    setEtape("pose");
    setRefus(null);
    const issue = await montrer(recue.id);
    if (issue.ok) fermer();
    else {
      setRefus(issue.message);
      setEtape("revele");
    }
  };
  return (
    <Dialogue titre={recue && tourne ? "La pochette s'ouvre…" : recue && revelee ? "Un nouveau trésor" : rendu && revelee ? "Des statères rendus" : refus ? "La pochette reste fermée" : "Ouvrir une pochette des bannières ?"} etape={tourne ? "tourne" : revelee ? "revele" : "confirmer"} occupe={etape === "envoi" || etape === "pose" || tourne} onFermer={fermer} testid="dialogue-pochette-bannieres">
      {tourne && recue && bande ? (
        <>
          <Tambour rangees={bande.rangees} depart={bande.depart} cible={bande.cible} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "arrete" : e))} />
          <div class="boutique-dialogue-actions">
            {/* « Passer » montre la bannière tout de suite, sans attendre la toile : la fenêtre ne reste jamais bloquée. */}
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                setPasser(true);
                setEtape("revele");
              }}
              data-testid="bannieres-pochette-passer"
            >
              Passer
            </button>
            <BoutonSon son={son} onBasculer={basculerSon} testid="bannieres-pochette-son" />
          </div>
        </>
      ) : tirage && recue ? (
        <div class="banniere-recue">
          <div class="banniere-fenetre" data-rarete={recue.rarete} data-testid="bannieres-pochette-tirage" data-banniere={recue.id}>
            <Scene lib={lib} banniere={recue} tenue={tenue} familier={familier} class="banniere-scene-fenetre" />
          </div>
          <p class="banniere-recue-nom" data-testid="bannieres-pochette-tirage-nom">
            {recue.nom}
          </p>
          <RareteDeLaBanniere rarete={recue.rarete} />
          <p class="boutique-dialogue-texte">
            Il vous reste {stateres(tirage.solde)}. {tirage.reste > 0 ? `Encore ${tirage.reste} ${tirage.reste > 1 ? "trésors" : "trésor"} à gagner.` : "Vous les avez tous."}
          </p>
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!dejaMontree(recue.id) && (
              <button type="button" class="btn btn-primary" disabled={etape === "pose"} onClick={() => void poser()} data-testid="bannieres-pochette-poser">
                {etape === "pose" ? "Enregistrement…" : "Mettre sur /gaulois"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "pose"} onClick={fermer} data-testid="bannieres-pochette-fermer">
              Fermer
            </button>
          </div>
        </div>
      ) : tirage && rendu ? (
        <div class="banniere-recue">
          <div class="banniere-rendu" data-testid="bannieres-pochette-rendu-recu">
            <Piece taille={24} echelle={3} />
            <p class="banniere-rendu-montant">
              <strong class="tnum">{nombre(rendu.rendu)}</strong>
              {motStatere(rendu.rendu)} {rendu.rendu > 1 ? "rendus" : "rendu"} par la pochette
            </p>
            <p class="banniere-rendu-part">
              <span class="tnum">{pourcent(rendu.pourcent)}</span> de son prix
            </p>
          </div>
          <p class="boutique-dialogue-texte">Pas de trésor cette fois. Il vous reste {stateres(tirage.solde)}.</p>
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-ghost" onClick={fermer} data-testid="bannieres-pochette-fermer">
              Fermer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="pochette-attente" data-envoi={etape === "envoi" ? "" : undefined}>
            <DessinPochetteBannieres echelle={4} />
          </div>
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="bannieres-pochette-confirmer">
                {etape === "envoi" ? "Ouverture…" : "Ouvrir"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={fermer} data-testid="bannieres-pochette-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/**
 * Acheter une bannière : la fenêtre la montre derrière le Gaulois du membre, dit son prix et ce qu'il restera, puis
 * demande au serveur. Après l'achat, elle se met sur /gaulois tout de suite si le membre le veut. Si le serveur refuse, le
 * compte de l'ouverture s'efface : il ne reste que la bannière, les mots du refus et « Fermer ».
 */
function DialogueBanniere({ lib, banniere, prix, solde, tenue, familier, acheter, montrer, onFermer }: { lib: Lib; banniere: Banniere; prix: number; solde: number; tenue: Tenue; familier: Familier | null; acheter: () => Promise<Issue<number>>; montrer: () => Promise<Issue<string | null>>; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "fait" | "pose">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    const issue = await acheter();
    if (issue.ok) {
      setReste(issue.valeur);
      setEtape("fait");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const poser = async () => {
    setEtape("pose");
    setRefus(null);
    const issue = await montrer();
    if (issue.ok) onFermer();
    else {
      setRefus(issue.message);
      setEtape("fait");
    }
  };
  const achetee = etape === "fait" || etape === "pose";
  return (
    <Dialogue titre={achetee ? `« ${banniere.nom} » est à vous` : refus ? "Achat impossible" : `Acheter « ${banniere.nom} » ?`} etape={achetee ? "fait" : "confirmer"} occupe={etape === "envoi" || etape === "pose"} onFermer={onFermer} testid="dialogue-banniere">
      <div class="banniere-fenetre" data-rarete={banniere.rarete}>
        <Scene lib={lib} banniere={banniere} tenue={tenue} familier={familier} class="banniere-scene-fenetre" />
      </div>
      <RareteDeLaBanniere rarete={banniere.rarete} />
      {achetee ? (
        <>
          {reste !== null && <p class="boutique-dialogue-texte">Il vous reste {stateres(reste)}.</p>}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-primary" disabled={etape === "pose"} onClick={() => void poser()} data-testid="banniere-poser">
              {etape === "pose" ? "Enregistrement…" : "Mettre sur /gaulois"}
            </button>
            <button type="button" class="btn btn-ghost" disabled={etape === "pose"} onClick={onFermer} data-testid="banniere-fermer">
              Fermer
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Après un refus, les chiffres de l'ouverture ne valent plus (le solde ou le prix a changé) : le refus seul. */}
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="banniere-confirmer">
                {etape === "envoi" ? "Achat…" : "Acheter"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="banniere-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/**
 * « Les bannières », l'onglet « Bannière » des rayons de « La boutique » : l'objet le plus cher de la boutique (le triple
 * d'un objet de la même rareté). Depuis le 16 novembre 2026, à la demande du pilote, toutes les bannières sont dans le livre
 * des bannières (`LivreDesBannieres.tsx`, mode « boutique »), triées par rareté, réduites à une rareté si on le veut : la
 * bannière touchée s'y dresse derrière le Gaulois du membre, et la fiche d'à côté donne sa description, son prix, et de
 * quoi l'acheter ou la mettre sur /gaulois. Le nom de l'onglet sert de titre : celui de la section ne se
 * lit qu'aux lecteurs d'écran. L'adresse des bannières (`#bannieres`) est suivie par la boutique, qui ouvre cet onglet.
 * `tenue` et `familier` : la tenue enregistrée et le familier montré. `solde` : le dernier que le serveur a donné à la
 * page ; `onSolde` le lui rend après un achat, `onRefus` après un refus (la bourse se relit).
 *
 * `partie` (16 novembre 2026) : ce que la section montre. « bannieres », l'onglet « Bannière » ; « pochette », la seule
 * pochette des bannières, pour l'onglet « Pochettes ». La boutique ne garde qu'une section pour les deux onglets : le
 * trésor sorti de la pochette est déjà dans la vitrine quand l'onglet « Bannière » se rouvre.
 */
export function SectionDesBannieres({
  partie = "bannieres",
  tenue,
  familier,
  solde,
  pochetteGagnee = false,
  onSolde,
  onRefus,
  onPrixDeLaPochette,
}: {
  partie?: "bannieres" | "pochette";
  tenue: Tenue;
  familier: Familier | null;
  solde: number | null;
  /** Une pochette des bannières gagnée à la loterie attend : elle s'ouvre sans rien payer, quel que soit le solde. */
  pochetteGagnee?: boolean;
  onSolde: (solde: number) => void;
  onRefus: () => void;
  /** Le prix de la pochette des bannières, dès qu'il est lu, pour l'étiquette de l'étal ; `null` tant qu'il ne l'est pas. */
  onPrixDeLaPochette?: (prix: number | null) => void;
}) {
  const { etat, lire, acheter, ouvrir, choisir } = useBannieres();
  const prixDeLaPochette = etat.kind === "pret" ? (etat.mes.pochette?.prix ?? null) : null;
  useEffect(() => onPrixDeLaPochette?.(prixDeLaPochette), [prixDeLaPochette]);
  const [rarete, setRarete] = useState<Rarete | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<string | null>(null);
  const [pochetteOuverte, setPochetteOuverte] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);

  useEffect(() => {
    void lire();
  }, [lire]);

  if (etat.kind !== "pret") {
    return (
      <section class="bannieres" aria-labelledby="bannieres-titre" data-testid="bannieres" data-etat={etat.kind}>
        <h4 id="bannieres-titre" class="sr-only">
          Les bannières
        </h4>
        {etat.kind === "lecture" ? (
          <p class="text-muted" role="status">
            Lecture des bannières…
          </p>
        ) : (
          <div data-testid="bannieres-panne">
            <Problem message="Les bannières ne répondent pas pour l'instant." onRetry={() => void lire()} />
          </div>
        )}
      </section>
    );
  }

  const { mes, lib } = etat;
  const entiere = partie === "bannieres";
  const possedees = idsDesBannieres(mes);
  // Un serveur qui ne connaît pas encore la pochette (sa migration n'est pas collée) : ses trésors ne se montrent pas, sauf
  // ceux que le compte aurait déjà.
  const liste = mes.pochette ? lib.BANNIERES : lib.BANNIERES.filter((b) => !lib.estDeLaPochette(b) || possedees.has(b.id));
  const montree = lib.banniereParId(mes.porte);
  const vue = lib.banniereParId(choisie ?? banniereDOuverture(mes, liste.map((b) => b.id)));
  const comptes = lib.comptesParRarete(null, liste);
  const rareteRetenue = rarete && comptes[rarete] > 0 ? rarete : null;
  // Le livre : toutes les bannières, de la plus courante à la plus rare, ou celles de la rareté retenue.
  const duLivre = trierParRarete(rareteRetenue ? liste.filter((b) => b.rarete === rareteRetenue) : liste, ORDRE_RARETES);
  const total = ORDRE_RARETES.reduce((somme, r) => somme + comptes[r], 0);
  const soldeConnu = solde ?? mes.solde;

  const voir = (id: string) => {
    setChoisie(id);
    setProbleme(null);
    setReussite(null);
  };
  /** Le livre dresse la bannière touchée : rien n'est demandé au serveur, la fiche d'à côté la décrit. */
  const voirDansLeLivre = (id: string | null): Promise<Issue<string | null>> => {
    if (id) voir(id);
    return Promise.resolve({ ok: true, valeur: id });
  };
  /** Ce qu'une bannière est pour ce compte, en mots, pour qui ne voit pas sa vignette. */
  const motDe = (id: string): string => {
    const e = lib.etatDeLaBanniere(id, mes);
    const banniere = lib.banniereParId(id);
    if (e === "montree") return "sur /gaulois";
    if (e === "a-moi") return "à vous";
    if (e === "a-gagner") return "dans la pochette des bannières";
    return banniere ? stateres(mes.prix[banniere.rarete]) : "";
  };

  /** Mettre une bannière sur /gaulois, ou revenir au décor de son lieu (`null`) : le serveur répond ce qu'il montre. */
  const montrer = async (id: string | null): Promise<Issue<string | null>> => {
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    const issue = await choisir(id);
    if (issue.ok) setReussite(issue.valeur ? `« ${lib.banniereParId(issue.valeur)?.nom ?? "Cette bannière"} » est sur /gaulois.` : "Sur /gaulois, votre Gaulois retrouve le décor de son lieu.");
    setOccupe(false);
    return issue;
  };
  const montrerIci = async (id: string | null) => {
    const issue = await montrer(id);
    if (!issue.ok) setProbleme(issue.message);
  };

  const acheterLaBanniere = async (banniere: Banniere, prix: number): Promise<Issue<number>> => {
    const issue = await acheter(banniere, prix);
    if (issue.ok) {
      onSolde(issue.valeur);
      setProbleme(null);
      setReussite(`« ${banniere.nom} » est à vous.`);
    } else onRefus();
    return issue;
  };

  /** Ouvrir une pochette des bannières : la bourse de la page prend le solde du serveur ; après un refus, elle se relit. */
  const ouvrirLaPochette = async (prix: number): Promise<Issue<PochetteBannieresReponse>> => {
    const issue = await ouvrir(prix);
    if (issue.ok) {
      onSolde(issue.valeur.solde);
      setProbleme(null);
      const { banniere, remboursement } = issue.valeur;
      setReussite(banniere ? `« ${lib.banniereParId(banniere.banniere)?.nom ?? "Cette bannière"} » est à vous.` : remboursement ? `La pochette vous a rendu ${stateres(remboursement.rendu)}.` : null);
    } else onRefus();
    return issue;
  };

  const etatVu = vue ? lib.etatDeLaBanniere(vue.id, mes) : null;
  const prixVu = vue ? mes.prix[vue.rarete] : 0;
  const raison = vue && etatVu === "a-acheter" ? raisonDeLaBanniere(mes, soldeConnu, prixVu) : null;
  const aAcheter = fenetre ? lib.banniereParId(fenetre) : null;
  // La pochette des bannières : seulement si le serveur la connaît, et s'il y a des trésors dessinés.
  const pochette = mes.pochette && lib.TRESORS.length > 0 ? mes.pochette : null;
  const raisonPochette = pochette ? raisonDeLaPochetteDesBannieres(mes, pochetteGagnee ? Math.max(soldeConnu, pochette.prix) : soldeConnu, pochette.prix, lib.chancesDesTresorsPourMoi(pochette.chances, possedees) === null) : null;
  // La chance du trésor regardé à chaque pochette, remboursements comptés.
  const chanceVue = vue && etatVu === "a-gagner" && pochette ? lib.chanceDuTresor(vue.id, lib.chancesDUnTresor(pochette), possedees) : 0;

  // Dans l'onglet « Pochettes », un serveur qui ne connaît pas la pochette des bannières : rien à montrer.
  if (!entiere && !pochette) return null;

  // Dans l'onglet « Pochettes », la pochette est déjà une région à son nom : l'enveloppe n'en est pas une seconde.
  const Enveloppe = entiere ? "section" : "div";

  return (
    <Enveloppe class="bannieres" aria-labelledby={entiere ? "bannieres-titre" : undefined} data-testid="bannieres" data-etat="pret">
      {entiere && (
        <>
          <div class="bannieres-tete">
            <h4 id="bannieres-titre" class="sr-only">
              Les bannières
            </h4>
            <p class="bannieres-compte" data-testid="bannieres-compte">
              <strong class="tnum">{possedees.size}</strong> sur {liste.length} à vous
            </p>
          </div>
          <p class="bannieres-porte" data-testid="bannieres-porte">
            <span>
              Sur /gaulois : <strong>{montree ? `« ${montree.nom} »` : "le décor de votre lieu"}</strong>
            </span>
            {montree && (
              <button type="button" class="chip" disabled={occupe} onClick={() => void montrerIci(null)} data-testid="bannieres-decor">
                Revenir au décor de mon lieu
              </button>
            )}
          </p>
        </>
      )}

      {pochette && !entiere && <PochetteDesBannieres lib={lib} mes={{ ...mes, pochette }} possedees={possedees} raison={raisonPochette} onOuvrir={() => setPochetteOuverte(true)} />}
      {/* Sans la vitrine, qui le dit dans l'onglet « Bannière » : ce qui vient de se passer (trésor reçu, mis sur /gaulois). */}
      {!entiere && (
        <div class="banniere-avis" data-testid="bannieres-pochette-avis">
          <Success message={pochetteOuverte ? null : reussite} />
          <Problem message={pochetteOuverte ? null : probleme} />
        </div>
      )}

      {entiere && (
        <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="bannieres-raretes">
          <button type="button" class="chip filtre" aria-pressed={rareteRetenue === null} onClick={() => setRarete(null)} data-testid="bannieres-rarete-tout">
            Tout
            <span class="filtre-nombre tnum">{total}</span>
            <span class="sr-only"> {total > 1 ? "bannières" : "bannière"}</span>
          </button>
          {ORDRE_RARETES.map((r) => (
            <button key={r} type="button" class="chip filtre" data-rarete={r} aria-pressed={rareteRetenue === r} disabled={comptes[r] === 0} onClick={() => setRarete(rareteRetenue === r ? null : r)} data-testid={`bannieres-rarete-${r}`}>
              <Losanges rang={RARETES[r].rang} />
              {RARETES[r].nom}
              <span class="filtre-nombre tnum">{comptes[r]}</span>
              <span class="sr-only"> {comptes[r] > 1 ? "bannières" : "bannière"}</span>
            </button>
          ))}
        </div>
      )}

      {entiere && vue && etatVu && (
        <div class="banniere-vitrine banniere-vitrine-livre" data-rarete={vue.rarete} data-testid="banniere-vitrine" data-banniere={vue.id} data-etat={etatVu}>
          <div class="banniere-vue">
            <LivreDesBannieres mode="boutique" lib={lib} miennes={duLivre} montree={vue} tenue={tenue} familier={familier} choisir={voirDansLeLivre} etatDe={(id) => lib.etatDeLaBanniere(id, mes)} motDe={motDe} />
          </div>
          <div class="banniere-fiche">
            <p class="banniere-famille">{lib.FAMILLES_DES_BANNIERES[vue.famille]}</p>
            <h5 class="banniere-nom" data-testid="banniere-nom">
              {vue.nom}
            </h5>
            <RareteDeLaBanniere rarete={vue.rarete} />
            <p class="banniere-description">{vue.description}</p>
            <div class="banniere-actions">
              {etatVu === "a-acheter" ? (
                <>
                  <Prix montant={prixVu} class="banniere-prix" />
                  {raison ? (
                    <p class="pochette-raison" data-testid="banniere-raison">
                      {raison}
                    </p>
                  ) : (
                    <div>
                      <button type="button" class="btn btn-primary" onClick={() => setFenetre(vue.id)} data-testid="banniere-acheter">
                        Acheter
                      </button>
                    </div>
                  )}
                </>
              ) : etatVu === "a-gagner" ? (
                <>
                  <MotsDeLEtat etat={etatVu} />
                  <p class="banniere-pochette-mot" data-testid="banniere-pochette-mot">
                    Ne s'achète pas : elle ne sort que de la pochette des bannières, dans « Les pochettes »
                    {chanceVue > 0 && (
                      <>
                        , <span class="tnum">{pourcent(chanceVue)}</span> de chance dans votre prochaine pochette
                      </>
                    )}
                    .
                  </p>
                </>
              ) : (
                <>
                  <MotsDeLEtat etat={etatVu} />
                  {etatVu === "a-moi" && (
                    <div>
                      <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void montrerIci(vue.id)} data-testid="banniere-montrer">
                        {occupe ? "Enregistrement…" : "Mettre sur /gaulois"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div class="banniere-avis" data-testid="banniere-avis">
              <Success message={reussite} />
              <Problem message={probleme} />
            </div>
          </div>
        </div>
      )}

      {aAcheter && (
        <DialogueBanniere
          lib={lib}
          banniere={aAcheter}
          prix={mes.prix[aAcheter.rarete]}
          solde={soldeConnu}
          tenue={tenue}
          familier={familier}
          acheter={() => acheterLaBanniere(aAcheter, mes.prix[aAcheter.rarete])}
          montrer={() => montrer(aAcheter.id)}
          onFermer={() => setFenetre(null)}
        />
      )}
      {pochetteOuverte && pochette && (
        <PochetteGagneeIci.Provider value={pochetteGagnee}>
          <DialoguePochetteBannieres
            lib={lib}
            prix={pochette.prix}
            chances={pochette.chances}
            possedees={possedees}
            solde={soldeConnu}
            tenue={tenue}
            familier={familier}
            ouvrir={() => ouvrirLaPochette(pochette.prix)}
            montrer={montrer}
            dejaMontree={(id) => mes.porte === id}
            onFermer={(recue) => {
              setPochetteOuverte(false);
              // Le trésor reçu paraît dans la vitrine, dressé dans le livre.
              if (recue) setChoisie(recue);
            }}
          />
        </PochetteGagneeIci.Provider>
      )}
    </Enveloppe>
  );
}

/**
 * « Ma bannière », dans « Mon Gaulois » : la bannière montrée sur /gaulois, à choisir parmi celles qu'on a, ou le décor de
 * son lieu, dans le livre des bannières (`LivreDesBannieres.tsx`). Le choix part tout de suite au serveur
 * (`choisir_banniere`) : il ne passe pas par l'enregistrement de la tenue. Sans bannière, une ligne mène aux bannières de
 * « La boutique », sans charger leurs dessins. En panne, le vestiaire reste. `actif` : l'onglet est ouvert ; au retour de
 * la boutique, les bannières se relisent. `nom`, `tenue` et `familier` : le membre et son Gaulois enregistré, ceux que /gaulois et la vitrine montrent.
 */
export function MaBanniere({ actif, nom, tenue, familier }: { actif?: boolean | undefined; nom: string; tenue: Tenue; familier: Familier | null }) {
  const { etat, lire, choisir } = useBannieres({ leger: true });
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    void lire();
  }, [lire]);
  const avant = useRef(actif);
  useEffect(() => {
    const revenu = actif === true && avant.current === false;
    avant.current = actif;
    if (revenu) void lire(true);
  }, [actif, lire]);

  if (etat.kind === "lecture") return null;
  if (etat.kind === "panne") {
    return (
      <div data-testid="banniere-panne">
        <Problem message="Vos bannières ne répondent pas pour l'instant." onRetry={() => void lire()} />
      </div>
    );
  }
  if (etat.kind === "aucune" || etat.mes.bannieres.length === 0) {
    return (
      <p class="familier-invite" data-testid="banniere-invite">
        Pour une bannière derrière votre Gaulois sur /gaulois : <a href={`${basePath()}${adresseDansLaBoutique(ANCRE_BANNIERES)}`}>les bannières de la boutique</a>.
      </p>
    );
  }
  const { mes, lib } = etat;
  const montree = lib.banniereParId(mes.porte);
  const miennes = trierParRarete(mes.bannieres.flatMap((ligne) => lib.banniereParId(ligne.banniere) ?? []), ORDRE_RARETES);
  // La bannière montrée, en petit dans le cadre : une seule, peinte tout de suite.
  const vignette = montree ? lib.vignetteDeLaBanniere(montree.id) : null;
  return (
    <details class="fold banniere-choix" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} data-testid="banniere-choix">
      {/* Un cadre entier à cliquer, avec la bannière montrée en petit et un bouton écrit : le pli d'une ligne ne se voyait pas. */}
      <summary>
        {vignette ? <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={1} class="banniere-vignette" /> : <span class="banniere-lieu" aria-hidden="true" />}
        <span class="banniere-choix-mots">
          <span id="banniere-choix-titre" class="banniere-choix-titre">
            Ma bannière sur /gaulois
          </span>
          <span class="banniere-choix-nom">{montree ? montree.nom : "Le décor de mon lieu"}</span>
        </span>
        <span class="banniere-choix-bouton" aria-hidden="true">
          {ouvert ? "Fermer" : "Changer"}
        </span>
      </summary>
      {/* Le livre ne se dessine qu'une fois le pli ouvert. */}
      {ouvert && <LivreDesBannieres lib={lib} miennes={miennes} montree={montree} nom={nom} tenue={tenue} familier={familier} choisir={choisir} />}
    </details>
  );
}
