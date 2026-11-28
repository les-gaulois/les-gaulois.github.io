import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import type { ComponentChildren, ComponentType } from "preact";
import { ORDRE_RARETES, RARETES, type Rarete, type Tenue } from "../../lib/gaulois";
import type { Banniere } from "../../lib/village/bannieres";
import { finitionParId, type FinitionDuRayon } from "../../lib/village/cartes";
import { adresseDansLaBoutique } from "../../lib/village/boutique-rayons";
import type { MesBannieres, PochetteBannieresReponse } from "../../lib/village/contrat";
import { sansCadre, type DecorDeBanniere } from "../../lib/village/decor-banniere";
import { trierParRarete } from "../../lib/village/defile";
import { ANCRE_BANNIERES, BANNIERE_HAUTEUR, BANNIERE_LARGEUR, apresLAchat, banniereDOuverture, idsDesBannieres, messageDuRefusDAchat, raisonDeLaBanniere, raisonDeLaPochetteDesBannieres, sansBanniere } from "../../lib/village/ecran-bannieres";
import { manque, pourcent, stateres } from "../../lib/village/ecran-boutique";
import type { Familier } from "../../lib/village/familiers";
import { Problem, Success, messageOf } from "../compte/common";
import { Compte, Dialogue, PochetteGagneeIci, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Pixels, Prix, peindre } from "./BoutiquePixels";
import { IconeDeRarete } from "./IconeDeRarete";
import { CarteAnimee, RefletDeBloc } from "./CarteAnimee";
import { DefileDeCartes, bruitDuJeu, piedDuDefile, type CarteDuDefile } from "./DefileDeCartes";
import { CartesDeLaVitrine } from "./Vitrine";
import { CarteDeCosmetique, useLargeurDeGrandeCarte } from "./CarteDeCosmetique";

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

/**
 * La fenêtre d'ouverture du booster des bannières (`PochetteBannieres.tsx`) et ce qu'elle reçoit. L'écran des boosters la
 * donne à la section (`FenetreDuBooster`) : ce fichier ne l'importe pas, pour que « Mon compte », qui montre la bannière du
 * Gaulois (`MaBanniere`), ne charge pas l'animation des boosters.
 */
export interface ProprietesDuBoosterDesBannieres {
  lib: Lib;
  prix: number;
  solde: number;
  tenue: Tenue;
  familier: Familier | null;
  ouvrir: () => Promise<Issue<PochetteBannieresReponse>>;
  montrer: (id: string) => Promise<Issue<string | null>>;
  dejaMontree: (id: string) => boolean;
  onFermer: (recue: string | null) => void;
}

/** Ce que reçoit la fiche du booster des bannières (`PochetteBannieres.tsx`), sous l'étal. */
export interface ProprietesDeLaFicheDesBannieres {
  lib: Lib;
  mes: MesBannieres & { pochette: NonNullable<MesBannieres["pochette"]> };
  possedees: ReadonlySet<string>;
  raison: string | null;
  gagnees: number;
  onOuvrir: () => void;
}

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
export function plusTard(tache: () => void): void {
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
export function SceneDeLaBanniere({ lib, banniere, tenue, familier, class: classe = "" }: { lib: Lib; banniere: Banniere; tenue: Tenue; familier: Familier | null; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => lib.sceneDeLaBanniere(banniere.id, tenue, familier), [lib, banniere.id, tenue, familier]);
  useEffect(() => {
    if (scene) peindre(toile.current, scene.largeur, scene.hauteur, scene.cases);
  }, [scene]);
  return <canvas ref={toile} width={BANNIERE_LARGEUR} height={BANNIERE_HAUTEUR} class={`pixels banniere-scene ${classe}`} role="img" aria-label={`Votre Gaulois devant la bannière « ${banniere.nom} »`} data-testid="banniere-scene" data-banniere={banniere.id} />;
}

/**
 * La carte d'une bannière : la carte des cosmétiques couchée (choix du pilote, 28 novembre 2026), la bannière entière en
 * pleine image ; essayée, le Gaulois du membre devant elle. Au pied : sa rareté, sa marque (« Sur /gaulois »), son prix ou
 * ce qu'elle est pour le compte. `grande` : la carte reçue à la fin d'un booster, à la largeur de l'écran.
 */
export function CarteDeBanniereCouchee({ lib, carte, essai = null, grande = false, etat, testid }: { lib: Lib; carte: Pick<CarteDuDefile, "id" | "nom" | "rarete" | "prix" | "mot" | "marque">; essai?: { tenue: Tenue; familier: Familier | null } | null; grande?: boolean; etat?: ComponentChildren; testid?: string }) {
  const tenue = essai?.tenue ?? null;
  const familier = essai?.familier ?? null;
  const image = useMemo(() => (tenue ? lib.sceneDeLaBanniere(carte.id, tenue, familier) : lib.vignetteDeLaBanniere(carte.id)), [lib, carte.id, tenue, familier]);
  const largeur = useLargeurDeGrandeCarte(true);
  return (
    <CarteDeCosmetique
      nom={carte.nom}
      rarete={carte.rarete}
      cle={`banniere/${carte.id}`}
      dessin={null}
      scene={image}
      couchee
      type={essai ? "Bannière essayée" : "Bannière"}
      effets={null}
      grande={grande}
      largeur={grande ? largeur : undefined}
      etat={etat}
      testid={testid}
      pied={piedDuDefile(carte)}
    />
  );
}

/** Le repère de forme d'une rareté, son icône (21 novembre 2026, à la place des losanges) : la même que sur les cases. */
function RepereDeRarete({ rarete }: { rarete: string }) {
  return (
    <span class="filtre-rang" aria-hidden="true">
      <IconeDeRarete rarete={rarete} />
    </span>
  );
}

const Scene = SceneDeLaBanniere;

/** La rareté d'une bannière hors d'une case : écrite, avec son icône, dans la couleur de la rareté. */
export function RareteDeLaBanniere({ rarete }: { rarete: Rarete }) {
  return (
    <span class="banniere-rarete" data-rarete={rarete}>
      <MarqueDeRarete rarete={rarete} />
    </span>
  );
}

/** La bannière montrée sur /gaulois, dite sous le défilé, à côté de ce qu'on peut en faire. */
function SurGaulois() {
  return (
    <span class="banniere-etat" data-etat="montree">
      Sur /gaulois
    </span>
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
 * « Les bannières », l'onglet « Bannière » des rayons de « La boutique » : l'objet le plus cher de la boutique (le
 * double d'un objet de la même rareté depuis le 21 novembre 2026, le triple avant). Toutes les bannières, triées par
 * rareté, réduites à une rareté si on le veut, en grandes cartes qui défilent (`DefileDeCartes.tsx`, 22 novembre 2026, à
 * la place du livre, à la demande du pilote) : la bannière entière dans sa carte, son nom, sa rareté, son prix ou ce
 * qu'elle est pour le compte ; sous la bande, sa description et de quoi l'acheter, l'essayer derrière son Gaulois ou la
 * mettre sur /gaulois. Le nom de l'onglet sert de titre : celui de la section ne se
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
  FenetreDuBooster,
  FicheDuBooster,
  boostersGagnes = 0,
}: {
  partie?: "bannieres" | "pochette";
  /** La fiche du booster des bannières (sous l'étal), donnée par l'écran des boosters, comme sa fenêtre. */
  FicheDuBooster?: ComponentType<ProprietesDeLaFicheDesBannieres>;
  /** Les boosters des bannières gagnés à la loterie, qui restent à ouvrir sans payer. */
  boostersGagnes?: number;
  /** La fenêtre d'ouverture du booster des bannières, donnée par l'écran des boosters ; sans elle, le booster ne s'ouvre pas ici. */
  FenetreDuBooster?: ComponentType<ProprietesDuBoosterDesBannieres>;
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
  // La bannière du milieu essayée derrière le Gaulois du membre, comme sur /gaulois ; l'essai s'arrête quand elle change.
  const [essai, setEssai] = useState(false);
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
  // Le défilé : toutes les bannières, de la plus courante à la plus rare, ou celles de la rareté retenue.
  const duDefile = trierParRarete(rareteRetenue ? liste.filter((b) => b.rarete === rareteRetenue) : liste, ORDRE_RARETES);
  /** Ce que dit chaque carte : son prix, « Du booster » pour un trésor, « À vous », et « Sur /gaulois » pour la montrée. */
  const cartesDuDefile = duDefile.map((b): CarteDuDefile => {
    const e = lib.etatDeLaBanniere(b.id, mes);
    return { id: b.id, nom: b.nom, rarete: b.rarete, prix: e === "a-acheter" ? mes.prix[b.rarete] : null, mot: e === "a-gagner" ? "Du booster" : e === "a-acheter" ? null : "À vous", marque: e === "montree" ? "Sur /gaulois" : null };
  });
  const total = ORDRE_RARETES.reduce((somme, r) => somme + comptes[r], 0);
  const soldeConnu = solde ?? mes.solde;

  /** Une autre bannière au milieu du défilé : rien n'est demandé au serveur, la fiche dessous la décrit. */
  const voir = (id: string) => {
    setChoisie(id);
    setEssai(false);
    setProbleme(null);
    setReussite(null);
  };

  /** Mettre une bannière sur /gaulois, ou revenir au décor de son lieu (`null`) : le serveur répond ce qu'il montre. */
  const montrer = async (id: string | null): Promise<Issue<string | null>> => {
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    const issue = await choisir(id);
    if (issue.ok) {
      setReussite(issue.valeur ? `« ${lib.banniereParId(issue.valeur)?.nom ?? "Cette bannière"} » est sur /gaulois.` : "Sur /gaulois, votre Gaulois retrouve le décor de son lieu.");
      if (issue.valeur) {
        bruitDuJeu("enfile");
        bruitDuJeu("enfile2", 0.09);
      }
    }
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
      bruitDuJeu("piece");
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

      {pochette && !entiere && FicheDuBooster && <FicheDuBooster lib={lib} mes={{ ...mes, pochette }} possedees={possedees} raison={raisonPochette} gagnees={boostersGagnes} onOuvrir={() => setPochetteOuverte(true)} />}
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
              <RepereDeRarete rarete={r} />
              {RARETES[r].nom}
              <span class="filtre-nombre tnum">{comptes[r]}</span>
              <span class="sr-only"> {comptes[r] > 1 ? "bannières" : "bannière"}</span>
            </button>
          ))}
        </div>
      )}

      {entiere && vue && etatVu && (
        <div class="banniere-vitrine dc-vitrine" data-rarete={vue.rarete} data-testid="banniere-vitrine" data-banniere={vue.id} data-etat={etatVu}>
          <DefileDeCartes
            cartes={cartesDuDefile}
            choisie={vue.id}
            onChoisir={voir}
            forme="banniere"
            label="Les bannières"
            carte={(c, milieu) => <CarteDeBanniereCouchee lib={lib} carte={c} essai={milieu && essai ? { tenue, familier } : null} />}
            testid="bannieres-defile"
          >
            <div class="dc-fiche">
              <p class="banniere-famille">{lib.FAMILLES_DES_BANNIERES[vue.famille]}</p>
              <h5 class="banniere-nom" data-testid="banniere-nom">
                {vue.nom}
              </h5>
              <p class="banniere-description">{vue.description}</p>
              <div class="dc-actions">
                {etatVu === "a-acheter" ? (
                  raison ? (
                    <p class="pochette-raison" data-testid="banniere-raison">
                      {raison}
                    </p>
                  ) : (
                    <button type="button" class="btn btn-primary" onClick={() => setFenetre(vue.id)} data-testid="banniere-acheter">
                      Acheter <Prix montant={prixVu} class="dc-prix-bouton" />
                    </button>
                  )
                ) : etatVu === "a-gagner" ? (
                  <p class="banniere-pochette-mot" data-testid="banniere-pochette-mot">
                    Ne s'achète pas : elle ne sort que du booster des bannières, dans « Les boosters »
                    {chanceVue > 0 && (
                      <>
                        , <span class="tnum">{pourcent(chanceVue)}</span> de chance dans votre prochain booster
                      </>
                    )}
                    .
                  </p>
                ) : etatVu === "a-moi" ? (
                  <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void montrerIci(vue.id)} data-testid="banniere-montrer">
                    {occupe ? "Enregistrement…" : "Mettre sur /gaulois"}
                  </button>
                ) : (
                  <SurGaulois />
                )}
                <button type="button" class="btn btn-ghost" aria-pressed={essai} onClick={() => setEssai((e) => !e)} data-testid="banniere-essayer">
                  Essayer sur mon Gaulois
                </button>
              </div>
              <div class="banniere-avis" data-testid="banniere-avis">
                <Success message={reussite} />
                <Problem message={probleme} />
              </div>
            </div>
          </DefileDeCartes>
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
      {pochetteOuverte && pochette && FenetreDuBooster && (
        <PochetteGagneeIci.Provider value={pochetteGagnee}>
          <FenetreDuBooster
            lib={lib}
            prix={pochette.prix}
            solde={soldeConnu}
            tenue={tenue}
            familier={familier}
            ouvrir={() => ouvrirLaPochette(pochette.prix)}
            montrer={montrer}
            dejaMontree={(id) => mes.porte === id}
            onFermer={(recue) => {
              setPochetteOuverte(false);
              // Le trésor reçu paraît au milieu du défilé.
              if (recue) setChoisie(recue);
            }}
          />
        </PochetteGagneeIci.Provider>
      )}
    </Enveloppe>
  );
}

/**
 * Ce que la bannière du milieu donne ailleurs : le Gaulois du membre devant elle sur /gaulois, en tête de sa fiche (avec le
 * reflet de sa finition), sa carte du podium et sa carte de la vitrine. Repris du livre d'avant, sous le défilé.
 */
function ApercusDeLaBanniere({ lib, banniere, nom, tenue, familier, finition }: { lib: Lib; banniere: Banniere; nom: string; tenue: Tenue; familier: Familier | null; finition: FinitionDuRayon | null }) {
  const adresse = `${basePath()}/bannieres/${banniere.id}.png`;
  const maCarte = useMemo(() => [{ nom, tenue, moi: true, familier: familier?.id ?? null, banniere: banniere.id, carte: finition?.id ?? null }], [nom, tenue, familier, banniere.id, finition]);
  return (
    <div class="livre-apercus dc-apercus">
      <figure class="livre-apercu">
        <figcaption>Sur /gaulois</figcaption>
        <SceneDeLaBanniere lib={lib} banniere={banniere} tenue={tenue} familier={familier} class="livre-apercu-scene" />
      </figure>
      <figure class="livre-apercu" data-testid="banniere-apercu-fiche">
        <figcaption>Sur ma fiche</figcaption>
        <div class="fiche-banniere">
          <img src={adresse} width={BANNIERE_LARGEUR} height={BANNIERE_HAUTEUR} alt="" decoding="async" />
          <RefletDeBloc finition={finition} />
          <span class="fiche-banniere-titre">Ses parties sous le tag</span>
        </div>
        <p class="livre-apercu-note">À la prochaine mise à jour du site, si votre pseudo est public.</p>
      </figure>
      <figure class="livre-apercu" data-testid="banniere-apercu-carte">
        <figcaption>Ma carte</figcaption>
        <CarteAnimee finition={finition} tenue={tenue} fond={`--banniere:url("${adresse}")`} classe="livre-apercu-carte" familier={familier} />
        <p class="livre-apercu-note">Sur ma fiche, et en haut de l'accueil si je suis sur le podium de la semaine.</p>
      </figure>
      <figure class="livre-apercu">
        <figcaption>Dans la vitrine</figcaption>
        <CartesDeLaVitrine gaulois={maCarte} testid="banniere-apercu-vitrine" label="Ma carte de la vitrine" />
      </figure>
    </div>
  );
}

/**
 * Les bannières du compte en grandes cartes qui défilent, dans « Mon Gaulois » (22 novembre 2026, à la place du livre, à
 * la demande du pilote) : celles qu'on a seulement ; sous la bande, « Mettre sur /gaulois », ou « Retirer » pour revenir au
 * décor de son lieu, et les aperçus de la bannière du milieu. Le serveur décide (`choisir_banniere`) : la marque « Sur
 * /gaulois » ne change qu'après sa réponse.
 */
function DefileDeMesBannieres({ lib, miennes, montree, nom, tenue, familier, choisir, finition }: { lib: Lib; miennes: readonly Banniere[]; montree: Banniere | null; nom: string; tenue: Tenue; familier: Familier | null; choisir: (id: string | null) => Promise<Issue<string | null>>; finition: FinitionDuRayon | null }) {
  const [vue, setVue] = useState<string | null>(montree?.id ?? null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const banniere = miennes.find((b) => b.id === vue) ?? montree ?? miennes[0] ?? null;
  if (!banniere) return null;
  const cartes = miennes.map((b): CarteDuDefile => ({ id: b.id, nom: b.nom, rarete: b.rarete, prix: null, mot: "À vous", marque: montree?.id === b.id ? "Sur /gaulois" : null }));
  const portee = montree?.id === banniere.id;
  const mettre = async (id: string | null): Promise<void> => {
    setOccupe(true);
    setProbleme(null);
    setAnnonce(null);
    const issue = await choisir(id);
    if (issue.ok) {
      setAnnonce(issue.valeur ? `« ${lib.banniereParId(issue.valeur)?.nom ?? "Cette bannière"} » est sur /gaulois.` : "Sur /gaulois, votre Gaulois retrouve le décor de son lieu.");
      if (issue.valeur) {
        bruitDuJeu("enfile");
        bruitDuJeu("enfile2", 0.09);
      }
    } else setProbleme(issue.message);
    setOccupe(false);
  };
  return (
    <DefileDeCartes
      cartes={cartes}
      choisie={banniere.id}
      onChoisir={(id) => {
        setVue(id);
        setProbleme(null);
        setAnnonce(null);
      }}
      forme="banniere"
      label="Mes bannières"
      carte={(c) => <CarteDeBanniereCouchee lib={lib} carte={c} />}
      testid="mes-bannieres-defile"
    >
      <div class="dc-fiche">
        <p class="banniere-description">{banniere.description}</p>
        <div class="dc-actions">
          {portee ? (
            <>
              <SurGaulois />
              <button type="button" class="btn btn-ghost" disabled={occupe} onClick={() => void mettre(null)} data-testid="banniere-retirer">
                {occupe ? "Enregistrement…" : "Retirer"}
              </button>
            </>
          ) : (
            <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void mettre(banniere.id)} data-testid="banniere-mettre">
              {occupe ? "Enregistrement…" : "Mettre sur /gaulois"}
            </button>
          )}
        </div>
        <Problem message={probleme} />
        <p class="sr-only" role="status" data-testid="banniere-annonce">
          {annonce}
        </p>
      </div>
      <ApercusDeLaBanniere lib={lib} banniere={banniere} nom={nom} tenue={tenue} familier={familier} finition={finition} />
    </DefileDeCartes>
  );
}

/**
 * « Ma bannière », dans « Mon Gaulois » : la bannière montrée sur /gaulois, à choisir parmi celles qu'on a, ou le décor de
 * son lieu, dans le défilé de ses bannières (`DefileDeMesBannieres`, à la place du livre). Le choix part tout de suite au serveur
 * (`choisir_banniere`) : il ne passe pas par l'enregistrement de la tenue. Sans bannière, une ligne mène aux bannières de
 * « La boutique », sans charger leurs dessins. En panne, le vestiaire reste. `actif` : l'onglet est ouvert ; au retour de
 * la boutique, les bannières se relisent. `nom`, `tenue` et `familier` : le membre et son Gaulois enregistré, ceux que /gaulois et la vitrine montrent.
 */
export function MaBanniere({ actif, nom, tenue, familier }: { actif?: boolean | undefined; nom: string; tenue: Tenue; familier: Familier | null }) {
  const { etat, lire, choisir } = useBannieres({ leger: true });
  const [ouvert, setOuvert] = useState(false);
  // La finition de carte qu'il montre (rayon « Cartes »), pour les aperçus : lue quand le pli s'ouvre. De
  // l'habillage : sans le rayon, ou en panne, les aperçus gardent le reflet offert.
  const [finition, setFinition] = useState<FinitionDuRayon | null>(null);
  useEffect(() => {
    if (!ouvert) return;
    call<unknown>("get_mes_cartes").then(
      (reponse) => setFinition(finitionParId(typeof reponse === "object" && reponse !== null && typeof (reponse as { porte?: unknown }).porte === "string" ? (reponse as { porte: string }).porte : null)),
      () => setFinition(null),
    );
  }, [ouvert]);

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
      {/* Le défilé ne se dessine qu'une fois le pli ouvert. */}
      {ouvert && <DefileDeMesBannieres lib={lib} miennes={miennes} montree={montree} nom={nom} tenue={tenue} familier={familier} choisir={choisir} finition={finition} />}
    </details>
  );
}
