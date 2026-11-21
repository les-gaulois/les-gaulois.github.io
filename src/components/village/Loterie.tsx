import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { HAUTEUR as DECOR_HAUTEUR, LARGEUR as DECOR_LARGEUR } from "../../../supabase/functions/code-discord/decors/commun";
import { ServerError, call } from "../../lib/compte/api";
import { motionAllowed } from "../../lib/fx/motion";
import type { CarteDeScene } from "../../lib/jeu/boosters";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import { nombreEcrit } from "../../lib/jeu/ecriture";
import { carteDuBoosterDeLoterie, miniBooster, ticketDOr } from "../../lib/jeu/loterie-dessins";
import { disqueDeChance, medaille, petitBooster, pileDeBillets, sablier } from "../../lib/jeu/loterie-pieces";
import type { Planche } from "../../lib/jeu/planche";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, lireTenue } from "../../lib/gaulois";
import { jouer } from "../../lib/jeu/sons";
import { reveillerLeSon, sonRevele } from "../../lib/jeu/sons-des-boosters";
import { addDays } from "../../lib/time";
import { POCHETTES_GAGNEES, PREMIER_TIRAGE_LOTERIE, TICKET_D_OR, type BoosterOuvert, type LotDeLoterie, type MaLoterie, type PartDeLoterie } from "../../lib/village/contrat";
import { instant, nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { boostersGagnesEnMots } from "../../lib/village/etal";
import {
  CLE_DU_TIRAGE_VU,
  NOMS_DES_RANGS,
  RANGS,
  apresLOuverture,
  billetsDe,
  billetsEnMots,
  boosterSuivant,
  bustesDeLaJauge,
  decompteDuTirage,
  decompteEnMots,
  dureeDuTirage,
  etatDuTirage,
  gagnants,
  jourCourt,
  jourDeLaRangee,
  jourDeParis,
  jourEnMots,
  lireBoosterOuvert,
  lireLoterie,
  maPart,
  messageDuRefusDuBooster,
  ordreDeLaJauge,
  partEnPourcent,
  pochettesDuLot,
  semaineDesBoosters,
  semaineDuTirage,
  totalDesBillets,
  type EtatDuJour,
  type Rang,
} from "../../lib/village/loterie";
import { Loading, Problem, messageOf } from "../compte/common";
import { Etiquette, Px } from "../jeu/Pixels";
import { charger as chargerLesBannieres } from "./Bannieres";
import { MESURES, dessinDuGaulois, encresDe, images, peindreLaScene, tailleDe, toileDe, type Dessin, type Taille } from "./LoterieToile";
import { BoutonDesBoosters, FenetreDuBooster, PaquetEnImage, RefusDuBooster, ResultatDuBooster, StateresEnPixels } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";
import { Toile } from "./PlaceToile";

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
/** Refus après lesquels réessayer ne sert à rien. */
const SANS_RETOUR = new Set(["not_signed_in", "suspended", "not_validated"]);
/** Les crans de la course de la pointe, chacun avec son tic : ils s'espacent quand elle ralentit. */
const CRANS_DE_LA_POINTE = 30;
/** Le son de la carte retournée qui dit chaque marche, celui d'une rareté des boosters : l'or le plus grand. */
const SON_DU_RANG = { 1: 5, 2: 4, 3: 3 } as const;

/**
 * La scène de la loterie, dessinée sur une toile sans fond : les trois cases des lots, puis la ligne des parts en ruban.
 * Sans `tirage` : le tirage à venir, immobile, les places des gagnants vides. Avec : le dernier tirage ; chaque
 * changement de `lecture` (au-dessus de zéro) rejoue l'animation, si les animations sont permises (bouton pause de
 * l'en-tête, réglage du système), sinon le bilan est posé tout de suite. Décorative : ce qu'elle montre est écrit à côté.
 */
function SceneDeLoterie({ parts, lots, tirage = false, lecture = 0, onFini }: { parts: readonly PartDeLoterie[]; lots: readonly LotDeLoterie[]; tirage?: boolean; lecture?: number; onFini?: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState<Taille>(1);
  const m = MESURES[taille];
  // Sans tirage, pas d'épingle sous la ligne : la toile s'arrête juste dessous.
  const hauteur = tirage ? m.hauteur : m.ligne.y + m.ligne.h + 10;
  const ordre = useMemo(() => ordreDeLaJauge(parts), [parts]);
  const avecBuste = useMemo(() => bustesDeLaJauge(parts, Math.floor(m.ligne.cadre.largeur / m.ligne.cadre.buste)), [parts, m]);
  const dessins = useMemo(() => {
    const table = new Map<number, Dessin>();
    parts.forEach((part, i) => {
      if (!avecBuste.has(i) && part.rang === null) return;
      const dessin = dessinDuGaulois(part.tenue);
      if (dessin) table.set(i, dessin);
    });
    return table;
  }, [parts, avecBuste]);

  // Les bannières des gagnants : leur code, lourd, ne se charge que s'il y en a une à montrer.
  const [lib, setLib] = useState<Awaited<ReturnType<typeof chargerLesBannieres>> | null>(null);
  const aMontrer = tirage && parts.some((part) => part.rang !== null && part.banniere !== null);
  useEffect(() => {
    if (!aMontrer || lib) return;
    let vivant = true;
    void chargerLesBannieres().then(
      (charge) => vivant && setLib(charge),
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, [aMontrer, lib]);
  const fonds = useMemo(() => {
    const table = new Map<number, HTMLCanvasElement>();
    if (!lib) return table;
    parts.forEach((part, i) => {
      if (part.rang === null || !part.banniere) return;
      const decor = lib.dessinDeLaBanniere(part.banniere);
      const fond = decor ? toileDe(decor.cases, DECOR_LARGEUR, DECOR_HAUTEUR) : null;
      if (fond) table.set(i, fond);
    });
    return table;
  }, [parts, lib]);

  const fini = useRef(onFini);
  fini.current = onFini;
  // La dernière lecture déjà jouée : une relecture du serveur ou un changement de largeur ne rejoue pas le tirage.
  const jouee = useRef(0);
  // Les bannières arrivent après le départ du tirage : le dessin les lit à chaque image, sans repartir ni s'arrêter.
  const fondsLus = useRef(fonds);
  fondsLus.current = fonds;
  const anime = useRef(false);
  const auRepos = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!anime.current) auRepos.current?.();
  }, [fonds]);

  // La largeur se mesure avant le premier dessin : sans cela, le premier passage de l'observateur changerait la toile
  // juste après le départ du tirage, et l'arrêterait.
  useLayoutEffect(() => {
    if (boite.current) setTaille(tailleDe(boite.current.clientWidth));
  }, []);
  useEffect(() => {
    const el = boite.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(() => setTaille(tailleDe(el.clientWidth)));
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  // Le thème change (clair ou sombre, bouton de l'en-tête ; thème rouge de l'équipe) : la toile lit ses couleurs dans
  // les jetons de la page au moment de peindre, elle se repeint donc avec les nouvelles.
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observateur = new MutationObserver(() => setTheme((n) => n + 1));
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-theme"] });
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    const el = toile.current;
    const c = el?.getContext("2d");
    if (!el || !c) {
      if (tirage && lecture > 0) fini.current?.();
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = m.largeur * dpr;
    el.height = hauteur * dpr;
    const encres = encresDe(el);
    // Faux si le navigateur ne sait pas dessiner la scène (un très vieux navigateur) : le tirage s'arrête là, et le
    // podium écrit dessous le dit quand même.
    const peindre = (t: number | null): boolean => {
      try {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, m.largeur, hauteur);
        c.globalAlpha = 1;
        peindreLaScene(c, m, encres, images(), { parts, lots, ordre, avecBuste, dessins, fonds: fondsLus.current }, t);
        return true;
      } catch {
        return false;
      }
    };
    auRepos.current = () => void peindre(tirage ? Infinity : null);
    if (!tirage) {
      peindre(null);
      return;
    }
    const duree = dureeDuTirage(gagnants(parts).length);
    if (lecture < 1 || lecture === jouee.current || duree === 0 || !motionAllowed()) {
      jouee.current = lecture;
      peindre(Infinity);
      if (lecture > 0) fini.current?.();
      return;
    }
    jouee.current = lecture;
    anime.current = true;
    let image = 0;
    const debut = performance.now();
    // Les sons du jeu suivent le tirage (21 novembre 2026, demande d'une page de loterie « plus jeu ») : un tic à chaque cran de
    // la pointe, qui ralentit avec elle ; à l'arrêt, le son d'une carte retournée, plus grand pour l'or ; un battement quand le
    // gagnant s'envole vers sa case. Ils suivent le réglage du son du jeu, et se taisent avec l'animation. Après une image
    // tardive (l'onglet est revenu au premier plan), ce qui est passé est noté sans bruit : rien ne part d'un coup.
    reveillerLeSon();
    const podium = gagnants(parts);
    const ecoute = podium.map(() => ({ cran: -1, arrive: false, envol: false }));
    let derniere = 0;
    const ecouter = (t: number) => {
      const muet = t - derniere > 0.5;
      derniere = t;
      const e = etatDuTirage(t, podium.length);
      ecoute.forEach((suivi, k) => {
        const pointe = e.pointes[k];
        if (pointe === null || pointe === undefined) return;
        const cran = Math.floor(pointe * CRANS_DE_LA_POINTE);
        if (!e.arrives[k] && cran !== suivi.cran) {
          suivi.cran = cran;
          if (!muet) jouer("tic");
        }
        if (e.arrives[k] && !suivi.arrive) {
          suivi.arrive = true;
          if (!muet) sonRevele(SON_DU_RANG[podium[k]!.rang]);
        }
        if ((e.montees[k] ?? 0) > 0 && !suivi.envol) {
          suivi.envol = true;
          if (!muet) jouer("flap");
        }
      });
    };
    const boucle = (maintenant: number) => {
      const t = (maintenant - debut) / 1000;
      ecouter(t);
      // Mises en pause en cours de route (bouton de l'en-tête) : le bilan, tout de suite.
      if (t >= duree || !motionAllowed() || !peindre(t)) {
        anime.current = false;
        peindre(Infinity);
        fini.current?.();
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => {
      anime.current = false;
      cancelAnimationFrame(image);
    };
  }, [m, hauteur, parts, lots, ordre, avecBuste, dessins, tirage, lecture, theme]);

  return (
    <div ref={boite} class="loterie-scene">
      <canvas ref={toile} class="loterie-toile" style={{ aspectRatio: `${m.largeur} / ${hauteur}` }} aria-hidden="true" />
    </div>
  );
}

/* ---------- L'écran ---------- */

type Etat = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string; reessayer: boolean } | { kind: "prete"; ma: MaLoterie };

/** Toutes les parts d'un tirage, en tableau : ce que la ligne dessine, en chiffres. */
function TableDesParts({ parts, fait, titre = "Toutes les parts" }: { parts: readonly PartDeLoterie[]; fait: boolean; titre?: string }) {
  // Les tickets d'or (depuis le tirage du 24 novembre 2026) et les billets achetés (avant) : leur colonne seulement s'il y en a.
  const avecOr = parts.some((part) => (part.tickets_or ?? 0) > 0);
  const avecAchat = parts.some((part) => part.achetes > 0);
  return (
    <details class="fold">
      <summary>{titre}</summary>
      <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau des parts, zone défilante">
        <table class="data-table tnum w-full text-sm">
          <caption class="sr-only">Les billets de chaque Gaulois dans ce tirage, et sa part de tous les billets.</caption>
          <thead>
            <tr>
              <th scope="col">Gaulois</th>
              <th scope="col">Billets gagnés</th>
              {avecOr && <th scope="col">Tickets d'or</th>}
              {avecAchat && <th scope="col">Billets achetés</th>}
              <th scope="col">Part</th>
              {fait && <th scope="col">Podium</th>}
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => (
              <tr key={i} class={part.moi ? "loterie-moi" : undefined}>
                <th scope="row">
                  {part.nom}
                  {part.moi ? " (vous)" : ""}
                </th>
                <td>{nombre(part.gratuits)}</td>
                {avecOr && <td>{nombre(part.tickets_or ?? 0)}</td>}
                {avecAchat && <td>{nombre(part.achetes)}</td>}
                <td>{pourcent(partEnPourcent(part, parts))}</td>
                {fait && <td>{part.rang === null ? "" : NOMS_DES_RANGS[part.rang]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Le dessin d'un booster de la rangée de la semaine : scellé, ouvert, ou la place vide d'un jour sans booster ; décoratif. */
function MiniBooster({ etat }: { etat: "ferme" | "ouvert" | "vide" }) {
  const planche = useMemo(() => miniBooster(etat), [etat]);
  const url = urlDeLaPlanche(`loterie-mini|${etat}`, () => planche);
  return <i class="loterie-jeu-mini" aria-hidden="true" style={`--i:${url};--w:${planche.width};--h:${planche.height}`} />;
}

/** Ce qu'un jour de la rangée dit aux lecteurs d'écran, après son nom. */
function motDuJour(etat: EtatDuJour, billets: number | null, ticketOr: boolean | null): string {
  if (etat === "ferme") return "booster à ouvrir";
  if (etat === "ouvert") return `booster ouvert, ${billetsEnMots(billets ?? 0)}${ticketOr ? " et un ticket d'or" : ""}`;
  if (etat === "a-venir") return "pas encore de booster : il vient quand vous jouez avec le clan";
  return "pas de booster ce jour-là";
}

/**
 * L'ouverture d'un booster de loterie (21 novembre 2026) : la même animation que les autres boosters (`OuvertureDuBooster`,
 * validée par le pilote). Le serveur ouvre d'abord (`ouvrir_booster_loterie`, qui tire le ticket d'or), pendant que le paquet
 * se secoue ; puis le joueur ouvre le paquet et retourne la carte de ses billets, avec le ticket d'or s'il y en a un. Dessous :
 * ce que la carte montre, en lettres du site, et le booster suivant s'il en reste. `onOuvert` reçoit la réponse du serveur
 * dès qu'elle arrive, même si la fenêtre est déjà fermée : le booster est ouvert.
 */
function FenetreDuBoosterDeLoterie({ jour, aujourdhui, suivant, onOuvert, onSuivant, onFermer }: { jour: string; aujourdhui: string; suivant: string | null; onOuvert: (ouvert: BoosterOuvert) => void; onSuivant: (jour: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"envoi" | "ouvre" | "revele">("envoi");
  const [refus, setRefus] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<{ booster: BoosterOuvert; carte: CarteDeScene } | null>(null);
  const rappel = useRef(onOuvert);
  rappel.current = onOuvert;
  useEffect(() => {
    let vivante = true;
    void (async () => {
      try {
        const lu = lireBoosterOuvert(await call<unknown>("ouvrir_booster_loterie", { p_jour: jour }));
        if (!lu) {
          if (vivante) setRefus(ILLISIBLE);
          return;
        }
        rappel.current(lu);
        if (!vivante) return;
        setOuvert({ booster: lu, carte: carteDuBoosterDeLoterie({ billets: lu.billets, ticketOr: lu.ticket_or, billetsOr: lu.billets_or }) });
        setEtape("ouvre");
      } catch (e) {
        if (vivante) setRefus(messageDuRefusDuBooster(e instanceof ServerError ? e.code : "network"));
      }
    })();
    return () => {
      vivante = false;
    };
    // Une fenêtre par booster : le jour ne change pas pendant qu'elle est ouverte.
  }, []);
  const b = ouvert?.booster ?? null;
  const titre = refus ? "Le booster reste fermé" : etape === "revele" && b ? (b.ticket_or ? "Un ticket d'or" : "Vos billets") : "Booster de loterie";
  const enScene = etape !== "envoi" && ouvert !== null;
  return (
    <FenetreDuBooster titre={titre} etape={enScene ? "ouvre" : "confirmer"} occupe={(etape === "envoi" && refus === null) || etape === "ouvre"} scene={enScene} onFermer={onFermer} testid="loterie-fenetre">
      {enScene && ouvert && b ? (
        <OuvertureDuBooster sorte="loterie" carte={ouvert.carte} revelee={etape === "revele"} onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}>
          <ResultatDuBooster nom={billetsEnMots(b.billets)} detail={b.ticket_or ? <Etiquette t="Ticket d'or" ton="or" dit="et un ticket d'or" /> : null} testid="loterie-booster-ouvert">
            <p class="bst-mot">
              {b.ticket_or ? `Le ticket d'or vaut ${billetsEnMots(b.billets_or)} de plus : ` : ""}
              {billetsEnMots(b.total)} pour le tirage du {jourEnMots(b.tirage)}.
            </p>
            {b.jour === aujourdhui && <p class="bst-mot">Les points de vos parties de plus tard aujourd'hui s'y ajouteront.</p>}
          </ResultatDuBooster>
          <div class="bst-actions">
            {suivant && <BoutonDesBoosters t="Ouvrir le suivant" dit="Ouvrir le booster suivant" or onClick={() => onSuivant(suivant)} testid="loterie-suivant" />}
            <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="loterie-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : (
        <div class="bst-confirmer">
          <div class="bst-attente" data-envoi={refus === null ? "" : undefined}>
            <PaquetEnImage sorte="loterie" classe="bst-attente-paquet" />
          </div>
          <div class="bst-confirmer-compte">
            <p class="bst-mot">Le booster du {jourEnMots(jour)}.</p>
            <RefusDuBooster message={refus} />
            {refus !== null && (
              <div class="bst-actions">
                <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="loterie-fermer" />
              </div>
            )}
          </div>
        </div>
      )}
    </FenetreDuBooster>
  );
}

/** Une pièce dessinée de la loterie, en image à l'échelle du kit ; décorative. */
function Piece({ cle, planche, classe = "" }: { cle: string; planche: () => Planche; classe?: string }) {
  const p = useMemo(planche, [cle]);
  const url = urlDeLaPlanche(`loterie|${cle}`, () => p);
  return <i class={`loterie-jeu-piece ${classe}`} aria-hidden="true" style={`--i:${url};--w:${p.width};--h:${p.height}`} />;
}

/**
 * Le compte à rebours du tirage (21 novembre 2026 : le tirage du mardi comme un événement) : les jours, les heures et les
 * minutes jusqu'au mardi 21 h 30, en grands chiffres du jeu, relus chaque demi-minute (rien ne bouge entre deux). Il ne fait
 * que compter jusqu'à l'heure que donne le serveur (`heure` de `get_loterie`) : le serveur seul tire.
 */
function CompteARebours({ heure, tirage, releve, enAttente }: { heure: string; tirage: string; releve: string | null; enAttente: boolean }) {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(minuterie);
  }, []);
  const reste = decompteDuTirage(heure, maintenant);
  const quand = majuscule(jourEnMots(tirage));
  const cases: [number, string][] = reste
    ? [
        [reste.jours, "Jours"],
        [reste.heures, "Heures"],
        [reste.minutes, "Minutes"],
      ]
    : [];
  return (
    <section class="loterie-jeu-compte jeu-panneau jeu-n9" aria-labelledby="loterie-compte-titre" data-testid="loterie-compte">
      <h3 id="loterie-compte-titre" class="loterie-jeu-ruban">
        <span class="jeu-ruban jeu-n9">
          <Px t="Prochain tirage" couleur="creme" relief="ombre" />
        </span>
      </h3>
      <div class="loterie-jeu-compte-corps">
        <Piece cle="sablier" planche={sablier} classe="loterie-jeu-sablier" />
        {reste ? (
          <p class="loterie-jeu-compte-chiffres" role="timer" aria-live="off" aria-label={`Tirage dans ${decompteEnMots(reste)}`} data-testid="loterie-reste">
            {cases.map(([n, mot]) => (
              <span key={mot} class="loterie-jeu-compte-case">
                <Px t={String(n).padStart(2, "0")} classe="loterie-jeu-compte-n" muet />
                <Px t={mot} couleur="doux" muet />
              </span>
            ))}
          </p>
        ) : (
          <p class="loterie-jeu-compte-chiffres" data-testid="loterie-reste">
            <Px t={enAttente ? "Tirage en cours" : "C'est l'heure"} classe="loterie-jeu-compte-n" />
          </p>
        )}
        <div class="loterie-jeu-compte-quand">
          <p data-testid="loterie-quand">
            <Px t={quand} dit={quand} />
          </p>
          <p class="loterie-jeu-heure">
            <Etiquette t="21 h 30" ton="bleu" dit="21 h 30" />
            <Px t="heure de Paris" couleur="doux" />
          </p>
        </div>
      </div>
      {releve && (
        <p class="info-discrete loterie-jeu-releve" data-testid="loterie-releve">
          Parties relues le {instant(releve)}
        </p>
      )}
    </section>
  );
}

/**
 * Vos billets (21 novembre 2026, page de loterie « plus jeu ») : une pile de billets dessinée avec leur nombre, le ticket
 * d'or qui brille, la part de chances lisible d'un coup d'œil. La pile, ses billets ; le ticket d'or, combien ; le disque de votre part des billets
 * comptés pour l'instant (avant le tirage, seuls les boosters ouverts comptent), et la barre de vos billets parmi tous.
 */
function MesBillets({ ma }: { ma: MaLoterie }) {
  const moi = maPart(ma.parts);
  const total = totalDesBillets(ma.parts);
  const mesBillets = moi ? billetsDe(moi) : 0;
  const tickets = moi?.tickets_or ?? 0;
  const part = moi && total > 0 ? mesBillets / total : 0;
  const partEcrite = String(Math.round(part * 1000) / 10).replace(".", ",");
  return (
    <section class="loterie-jeu-billets jeu-panneau jeu-n9" aria-labelledby="loterie-billets-titre" data-testid="loterie-mes-billets">
      <h3 id="loterie-billets-titre" class="loterie-jeu-ruban">
        <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
          <Px t="Vos billets" couleur="creme" relief="ombre" />
        </span>
      </h3>
      <dl class="loterie-jeu-chiffres">
        <div class="loterie-jeu-chiffre" data-sorte="billets">
          <dt>
            <Piece cle={`pile|${Math.min(mesBillets, 100)}`} planche={() => pileDeBillets(mesBillets)} classe="loterie-jeu-pile" />
            <Px t="Billets" couleur="doux" dit="Vos billets" />
          </dt>
          <dd>
            <Px t={nombreEcrit(mesBillets)} classe="loterie-jeu-grand" dit={nombre(mesBillets)} />
          </dd>
        </div>
        <div class="loterie-jeu-chiffre" data-sorte="or" data-brille={tickets > 0 ? "" : undefined}>
          <dt>
            <Piece cle="ticket-d-or" planche={ticketDOr} classe="loterie-jeu-ticket" />
            <Px t="Tickets d'or" couleur="doux" dit="Vos tickets d'or" />
          </dt>
          <dd>
            <Px t={nombreEcrit(tickets)} couleur="or" classe="loterie-jeu-grand" dit={nombre(tickets)} />
          </dd>
        </div>
        <div class="loterie-jeu-chiffre" data-sorte="part">
          <dt>
            <Piece cle={`disque|${part <= 0 ? 0 : part >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(part * 100)))}`} planche={() => disqueDeChance(part)} classe="loterie-jeu-disque" />
            <Px t="Votre part" couleur="doux" dit="Votre part des billets comptés pour l'instant" />
          </dt>
          <dd>
            <Px t={`${partEcrite} %`} classe="loterie-jeu-grand" dit={`${partEcrite} %`} />
          </dd>
        </div>
      </dl>
      <div class="jeu-tube jeu-n9 loterie-jeu-barre" role="img" aria-label={`Vos billets : ${nombre(mesBillets)} sur ${nombre(total)} comptés pour l'instant`}>
        <div class="jeu-plein jeu-plein-bleu jeu-n9" style={`--part:${total > 0 && mesBillets > 0 ? Math.max(0.02, Math.min(1, mesBillets / total)) : 0}`} />
        <Px t={`${nombreEcrit(mesBillets)} sur ${nombreEcrit(total)}`} couleur="creme" relief="cerne" muet />
      </div>
    </section>
  );
}

/**
 * Votre semaine (décision du pilote, 20 novembre 2026, à la place du guichet : plus aucun billet ne s'achète ; écran de jeu
 * du 21 novembre 2026) : le booster du jour en grand, à ouvrir d'un clic par l'animation des boosters, puis les sept jours du
 * mardi au lundi, un booster par jour joué avec le clan, fermé ou ouvert. Le serveur tire le ticket d'or ; l'écran montre ce
 * qu'il répond, puis relit la loterie.
 */
function MesBoosters({ ma, onOuvert }: { ma: MaLoterie; onOuvert: (apres: MaLoterie) => void }) {
  const or = ma.or ?? TICKET_D_OR;
  const [aujourdhui] = useState(() => jourDeParis(new Date()));
  const rangee = useMemo(() => semaineDesBoosters(ma.tirage, ma.boosters ?? [], aujourdhui), [ma.tirage, ma.boosters, aujourdhui]);
  const fermes = rangee.filter((j) => j.etat === "ferme").length;
  const duJour = rangee.find((j) => j.jour === aujourdhui) ?? null;
  // Le booster en cours d'ouverture : son jour, et un compteur pour qu'un « suivant » ouvre une fenêtre neuve.
  const [enCours, setEnCours] = useState<{ jour: string; n: number } | null>(null);
  // La loterie la plus récente, pour qu'une réponse arrivée après une autre ne la remplace pas par une plus ancienne.
  const derniere = useRef(ma);
  derniere.current = ma;
  const ouvrir = (jour: string) => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEnCours((e) => ({ jour, n: (e?.n ?? 0) + 1 }));
  };
  return (
    <section class="loterie-jeu-boosters jeu-panneau jeu-n9" aria-labelledby="loterie-boosters-titre" data-testid="loterie-boosters">
      <h3 id="loterie-boosters-titre" class="loterie-jeu-ruban">
        <span class="jeu-ruban jeu-ruban-bleu jeu-n9">
          <Px t="Votre semaine" couleur="creme" relief="ombre" />
        </span>
      </h3>
      <div class="loterie-jeu-du-jour" data-etat={duJour?.etat ?? "autre-tirage"} data-testid="loterie-du-jour">
        {duJour?.etat === "ferme" ? (
          <button type="button" class="loterie-jeu-du-jour-paquet" tabIndex={-1} disabled={enCours !== null} onClick={() => ouvrir(duJour.jour)} data-testid="loterie-ouvrir-du-jour">
            <PaquetEnImage sorte="loterie" classe="loterie-jeu-du-jour-image" />
            <span class="sr-only">Ouvrir le booster de loterie d'aujourd'hui</span>
          </button>
        ) : (
          <span class="loterie-jeu-du-jour-paquet" aria-hidden="true">
            <MiniBooster etat={duJour?.etat === "ouvert" ? "ouvert" : "vide"} />
          </span>
        )}
        <div class="loterie-jeu-du-jour-texte">
          <p>
            <Px t="Booster du jour" couleur="doux" />
          </p>
          {duJour?.etat === "ferme" && <BoutonDesBoosters t="Ouvrir" dit="Ouvrir le booster de loterie d'aujourd'hui" or disabled={enCours !== null} onClick={() => ouvrir(duJour.jour)} testid="loterie-ouvrir-du-jour-bouton" />}
          {duJour?.etat === "ouvert" && duJour.booster && (
            <p class="loterie-jeu-gain-du-jour">
              <Px t={`+${nombreEcrit(duJour.booster.billets ?? 0)}`} classe="loterie-jeu-grand" dit={billetsEnMots(duJour.booster.billets ?? 0)} />
              {duJour.booster.ticket_or && <Etiquette t={`Ticket d'or +${nombreEcrit(or.billets)}`} ton="or" dit={`et un ticket d'or, ${billetsEnMots(or.billets)} de plus`} />}
            </p>
          )}
          {duJour?.etat === "ouvert" && <p class="loterie-jeu-mot">Les points de vos parties de plus tard aujourd'hui s'y ajoutent.</p>}
          {duJour?.etat === "a-venir" && <p class="loterie-jeu-mot">Il arrive après votre première partie avec le clan aujourd'hui, une fois relue.</p>}
          {duJour === null && <p class="loterie-jeu-mot">Vos parties d'aujourd'hui comptent pour le tirage suivant.</p>}
        </div>
      </div>
      <ol class="loterie-jeu-semaine" aria-label="Vos boosters de loterie, un par jour joué avec le clan" data-testid="loterie-semaine">
        {rangee.map((j) => {
          const nom = jourDeLaRangee(j.jour);
          const dit = `${jourEnMots(j.jour)} : ${motDuJour(j.etat, j.booster?.billets ?? null, j.booster?.ticket_or ?? null)}`;
          return (
            <li key={j.jour} class="loterie-jeu-jour" data-etat={j.etat} data-aujourdhui={j.jour === aujourdhui ? "" : undefined} data-testid="loterie-booster">
              {j.etat === "ferme" ? (
                <button type="button" class="loterie-jeu-case" disabled={enCours !== null} onClick={() => ouvrir(j.jour)} aria-label={`Ouvrir le booster du ${jourEnMots(j.jour)}`} data-testid="loterie-ouvrir-booster">
                  <MiniBooster etat="ferme" />
                </button>
              ) : (
                <span class="loterie-jeu-case" role="img" aria-label={dit}>
                  <MiniBooster etat={j.etat === "ouvert" ? "ouvert" : "vide"} />
                </span>
              )}
              <span class="loterie-jeu-nom" aria-hidden="true">
                <Px t={nom} couleur={j.jour === aujourdhui ? "or" : "doux"} muet />
              </span>
              {j.etat === "ouvert" && j.booster && (
                <span class="loterie-jeu-gain" aria-hidden="true">
                  <Px t={`+${nombreEcrit(j.booster.billets ?? 0)}`} muet />
                  {j.booster.ticket_or && <Etiquette t={`+${nombreEcrit(or.billets)}`} ton="or" />}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div class="loterie-jeu-notes" aria-live="polite">
        {(ma.boosters ?? []).length === 0 ? (
          <p data-testid="loterie-sans-booster">
            Un booster de loterie arrive chaque jour où vous jouez avec le clan : autant de billets que de points rapportés ce jour-là, et une fois sur {nombre(or.sur)} un ticket d'or qui vaut {billetsEnMots(or.billets)} de plus.
          </p>
        ) : (
          fermes > 0 && <p>Un booster pas ouvert compte quand même : le serveur l'ouvre juste avant le tirage.</p>
        )}
      </div>
      {enCours && (
        <FenetreDuBoosterDeLoterie
          key={enCours.n}
          jour={enCours.jour}
          aujourdhui={aujourdhui}
          suivant={boosterSuivant(rangee, enCours.jour)}
          onOuvert={(ouvert) => onOuvert(apresLOuverture(derniere.current, ouvert))}
          onSuivant={ouvrir}
          onFermer={() => setEnCours(null)}
        />
      )}
    </section>
  );
}

/** Le code des bannières, demandé une fois s'il y a un gagnant à montrer devant la sienne ; `null` tant qu'il n'est pas là. */
function useLibDesBannieres(utile: boolean): Awaited<ReturnType<typeof chargerLesBannieres>> | null {
  const [lib, setLib] = useState<Awaited<ReturnType<typeof chargerLesBannieres>> | null>(null);
  useEffect(() => {
    if (!utile || lib) return;
    let vivant = true;
    void chargerLesBannieres().then(
      (charge) => vivant && setLib(charge),
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, [utile, lib]);
  return lib;
}

/**
 * Un gagnant du dernier tirage, en carte (21 novembre 2026, page de loterie « plus jeu ») : sa médaille,
 * lui devant sa bannière (le Gaulois seul, sans bannière), son nom, son lot en pièce et en boosters dessinés, et le billet
 * tiré (gagné, ou acheté avant le 24 novembre 2026). Rien de plus que ce que le serveur a noté.
 */
function CarteDuGagnant({ rang, part, billet, lot, lib }: { rang: Rang; part: PartDeLoterie; billet: number; lot: LotDeLoterie | null; lib: Awaited<ReturnType<typeof chargerLesBannieres>> | null }) {
  const tenue = useMemo(() => lireTenue(part.tenue), [part.tenue]);
  const scene = useMemo(() => (lib && part.banniere && tenue ? lib.sceneDeLaBanniere(part.banniere, tenue) : null), [lib, part.banniere, tenue]);
  const seul = useMemo(() => (tenue && !scene ? casesDuGaulois(tenue) : null), [tenue, scene]);
  return (
    <li class="loterie-jeu-gagnant" data-rang={rang} data-moi={part.moi ? "" : undefined}>
      <span class="loterie-jeu-gagnant-medaille">
        <Piece cle={`medaille|${rang}`} planche={() => medaille(rang)} />
        <Px t={NOMS_DES_RANGS[rang]} couleur="doux" dit={NOMS_DES_RANGS[rang]} />
      </span>
      <span class="loterie-jeu-gagnant-image" aria-hidden="true">
        {scene ? <Toile largeur={scene.largeur} hauteur={scene.hauteur} cases={scene.cases} echelle={2} /> : seul ? <Toile largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={seul} echelle={2} /> : null}
      </span>
      <span class="loterie-jeu-gagnant-nom">
        {part.nom}
        {part.moi ? " (vous)" : ""}
      </span>
      {lot && (
        <span class="loterie-jeu-gagnant-lot">
          <StateresEnPixels n={lot.gain} />
          <span class="loterie-jeu-gagnant-boosters" aria-hidden="true">
            {POCHETTES_GAGNEES.flatMap((sorte) => Array.from({ length: lot.pochettes[sorte] }, (_, k) => <Piece key={`${sorte}-${k}`} cle={`petit|${sorte}`} planche={() => petitBooster(sorte)} />))}
          </span>
          <span class="sr-only">, {pochettesDuLot(lot).join(", ")}</span>
        </span>
      )}
      <span class="pochette-note">billet {billet < part.gratuits ? "gagné" : "acheté"}</span>
    </li>
  );
}

/**
 * Le dernier tirage : la scène animée, ses gagnants en cartes, et le bouton pour le revoir. `nouveau` : la première visite
 * après le tirage, où il se montre en tête de la page, comme un événement.
 */
function DernierTirage({ dernier, lots, nouveau = false }: { dernier: NonNullable<MaLoterie["dernier"]>; lots: readonly LotDeLoterie[]; nouveau?: boolean }) {
  const [lecture, setLecture] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const podium = gagnants(dernier.parts);
  const semaine = semaineDuTirage(dernier.tirage);
  const lib = useLibDesBannieres(podium.some((g) => g.part.banniere !== null));

  // La première fois que ce navigateur voit ce tirage, il se joue seul ; ensuite, le bilan attend.
  useEffect(() => {
    let vu: string | null = null;
    try {
      vu = localStorage.getItem(CLE_DU_TIRAGE_VU);
      localStorage.setItem(CLE_DU_TIRAGE_VU, dernier.tirage);
    } catch {
      // Sans stockage, le tirage se joue à chaque ouverture : rien de grave.
    }
    if (vu !== dernier.tirage && podium.length > 0 && motionAllowed()) {
      setEnCours(true);
      setLecture(1);
    }
  }, [dernier.tirage]);

  // Un garde-fou : quoi qu'il arrive au dessin, le podium écrit paraît au plus tard quatre secondes après la fin prévue.
  useEffect(() => {
    if (!enCours) return;
    const minuterie = setTimeout(() => setEnCours(false), (dureeDuTirage(podium.length) + 4) * 1000);
    return () => clearTimeout(minuterie);
  }, [enCours, lecture]);

  if (dernier.parts.length === 0) return null;
  return (
    <section class="loterie-bloc loterie-jeu-dernier jeu-ecran-cadre jeu-n9" data-nouveau={nouveau ? "" : undefined} aria-labelledby="loterie-dernier-titre" data-testid="loterie-dernier">
      <div class="loterie-jeu-ruban" aria-hidden="true">
        <span class={`jeu-ruban ${nouveau ? "" : "jeu-ruban-bleu"} jeu-n9`}>
          <Px t={nouveau ? "Le tirage a eu lieu" : "Dernier tirage"} couleur="creme" relief="ombre" muet />
        </span>
      </div>
      <div class="loterie-bloc-tete">
        <div>
          <h3 id="loterie-dernier-titre" class="loterie-jeu-date">
            <span class="sr-only">{nouveau ? "Le tirage a eu lieu : " : "Dernier tirage : "}</span>
            <Px t={majuscule(jourEnMots(dernier.tirage))} dit={majuscule(jourEnMots(dernier.tirage))} />
          </h3>
          <p class="pochette-note">
            Points du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)}, {nombre(totalDesBillets(dernier.parts))} billets.
          </p>
        </div>
        <BoutonDesBoosters
          t="Revoir le tirage"
          disabled={enCours}
          onClick={() => {
            reveillerLeSon();
            setEnCours(true);
            setLecture((n) => n + 1);
          }}
          testid="loterie-revoir"
        />
      </div>
      <SceneDeLoterie parts={dernier.parts} lots={lots} tirage lecture={lecture} onFini={() => setEnCours(false)} />
      {/* Les gagnants en cartes : cachés pendant que la scène les dévoile, pour ne pas les dire avant elle, puis annoncés aux
          lecteurs d'écran quand ils paraissent. */}
      <div aria-live="polite">
        {!enCours && podium.length > 0 && (
          <ol class="loterie-podium loterie-jeu-gagnants" aria-label="Le podium du tirage" data-testid="loterie-podium">
            {podium.map((g) => (
              <CarteDuGagnant key={g.rang} rang={g.rang} part={g.part} billet={g.billet} lot={lots.find((l) => l.rang === g.rang) ?? null} lib={lib} />
            ))}
          </ol>
        )}
      </div>
      {!enCours && <TableDesParts parts={dernier.parts} fait titre="Toutes les parts du dernier tirage" />}
    </section>
  );
}

const majuscule = (texte: string): string => texte.charAt(0).toUpperCase() + texte.slice(1);

/**
 * L'onglet « La loterie » de « Mon Gaulois » (16 novembre 2026), dans la mise en page choisie par le pilote, « le podium
 * d'abord » : la date du tirage en grand, les trois cases des lots où chaque gagnant paraît devant sa bannière, la ligne
 * des parts en ruban, sans or, puis vos boosters de loterie de la semaine (écran de jeu du 21 novembre 2026 : plus aucun
 * billet ne s'achète). Chaque mardi à 21 h 30 (le lundi jusqu'au 17 novembre 2026), le serveur tire l'or, l'argent puis le
 * bronze parmi les billets des sept jours d'avant. Tout vient de `get_loterie` ; rien n'est du temps réel : la page se relit
 * à l'ouverture de l'onglet, après l'ouverture d'un booster, et autour de l'heure du tirage.
 */
export default function LoterieDuMardi({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "attente" });

  const lire = useCallback(async (discret: boolean) => {
    if (!discret) setEtat({ kind: "lecture" });
    try {
      const ma = lireLoterie(await call<unknown>("get_loterie"));
      if (ma) setEtat({ kind: "prete", ma });
      else if (!discret) setEtat({ kind: "erreur", message: ILLISIBLE, reessayer: true });
    } catch (e) {
      if (!discret) setEtat({ kind: "erreur", message: messageOf(e), reessayer: !(e instanceof ServerError && SANS_RETOUR.has(e.code)) });
    }
  }, []);

  useEffect(() => {
    if (actif) void lire(etat.kind === "prete");
  }, [actif]);

  const ma = etat.kind === "prete" ? etat.ma : null;
  // Le dernier tirage pas encore vu par ce navigateur se montre en tête, comme un événement, le temps de cette visite ; il se
  // range ensuite en bas de la page. Décidé une fois par tirage : sa lecture le note vu, et la page ne saute pas.
  const nouveaux = useRef(new Map<string, boolean>());
  const tirageFait = ma?.dernier?.tirage ?? null;
  if (tirageFait && !nouveaux.current.has(tirageFait)) {
    let vu: string | null = null;
    try {
      vu = localStorage.getItem(CLE_DU_TIRAGE_VU);
    } catch {
      // Sans stockage : le tirage n'est pas en tête, il se joue quand même à sa place.
      vu = tirageFait;
    }
    nouveaux.current.set(tirageFait, vu !== tirageFait);
  }
  const dernierNouveau = tirageFait !== null && nouveaux.current.get(tirageFait) === true;
  // Le tirage attendu n'est pas encore lu : l'heure vient de passer, le serveur le fait dans la minute. Au-delà de vingt
  // minutes, l'écran n'attend plus : il ne promet pas un tirage qui n'est pas venu.
  const attendu = ma ? addDays(ma.tirage, -7) : null;
  const depuis = ma ? Date.now() - (Date.parse(ma.heure) - 7 * 86_400_000) : 0;
  const enAttente = ma !== null && attendu !== null && attendu >= PREMIER_TIRAGE_LOTERIE && (ma.dernier?.tirage ?? "") < attendu && depuis >= 0 && depuis < 20 * 60_000;

  // Autour de l'heure : une relecture juste après le tirage, puis toutes les 40 secondes tant qu'il n'est pas lu.
  useEffect(() => {
    if (!actif || !ma) return;
    const avant = Date.parse(ma.heure) - Date.now();
    const delai = enAttente ? 40_000 : avant > 0 && avant < 6 * 3600_000 ? avant + 45_000 : null;
    if (delai === null) return;
    const minuterie = setTimeout(() => void lire(true), delai);
    return () => clearTimeout(minuterie);
  }, [actif, ma, enAttente, lire]);

  if (etat.kind === "attente" || etat.kind === "lecture") return <Loading label="Lecture de la loterie…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={etat.reessayer ? () => void lire(false) : undefined} />;

  const { ma: loterie } = etat;
  const semaine = semaineDuTirage(loterie.tirage);
  const gagnees = boostersGagnesEnMots(loterie.bons);
  const dernier = loterie.dernier ? <DernierTirage key={loterie.dernier.tirage} dernier={loterie.dernier} lots={loterie.lots} nouveau={dernierNouveau} /> : null;
  return (
    <div class="loterie loterie-jeu" data-testid="loterie">
      <div class="loterie-jeu-titre" aria-hidden="true">
        <span class="jeu-ruban jeu-n9">
          <Px t="La loterie du mardi" couleur="creme" relief="ombre" muet />
        </span>
      </div>
      {dernierNouveau && dernier}

      <CompteARebours heure={loterie.heure} tirage={loterie.tirage} releve={loterie.releve} enAttente={enAttente} />

      {gagnees.length > 0 && (
        <p class="loterie-gagnees loterie-jeu-bulle jeu-bulle jeu-n9" data-testid="loterie-gagnees">
          Vos boosters gagnés ou offerts, à ouvrir sans rien payer : {gagnees.join(", ")}. <a href="#pochettes">Les ouvrir</a>
        </p>
      )}

      {enAttente && (
        <p class="pochette-raison loterie-jeu-bulle jeu-bulle jeu-n9" role="status" data-testid="loterie-attente">
          Le tirage du {jourEnMots(attendu ?? loterie.tirage)} arrive dans la minute.
        </p>
      )}

      <section aria-labelledby="loterie-parts-titre" class="loterie-prochain loterie-jeu-scene jeu-ecran-cadre jeu-n9">
        <h3 id="loterie-parts-titre" class="sr-only">
          Les lots et les parts du prochain tirage
        </h3>
        <SceneDeLoterie parts={loterie.parts} lots={loterie.lots} />
      </section>
      <MesBillets ma={loterie} />
      <MesBoosters
        ma={loterie}
        onOuvert={(apres) => {
          setEtat({ kind: "prete", ma: apres });
          // La part de chacun se relit au serveur, sans effacer l'écran.
          void lire(true);
        }}
      />

      <div class="loterie-jeu-plis jeu-ecran-cadre jeu-n9">
        {loterie.parts.length > 0 && <TableDesParts parts={loterie.parts} fait={false} titre="Toutes les parts du prochain tirage" />}
        {/* Les règles et les lots en toutes lettres : la scène les dessine, ce pli les écrit. */}
        <details class="fold" data-testid="loterie-regles">
          <summary>Les règles et les lots</summary>
          <div class="loterie-regles mt-3">
            <p>
              Un booster de loterie par jour joué avec le clan, du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)} : autant de billets que de points rapportés au clan ce jour-là (au moins un dès qu'une partie en rapporte), et une fois sur {nombre((loterie.or ?? TICKET_D_OR).sur)} un ticket d'or qui vaut {nombre((loterie.or ?? TICKET_D_OR).billets)} billets de plus. Un booster pas ouvert compte quand même : le serveur l'ouvre juste avant le tirage. Plus aucun billet ne s'achète. L'or est tiré d'abord, puis l'argent et le bronze ; un gagnant ne regagne pas.
            </p>
            <ol class="loterie-lots" aria-label="Les lots du podium" data-testid="loterie-lots">
              {RANGS.map((rang) => {
                const lot = loterie.lots.find((l) => l.rang === rang);
                return (
                  lot && (
                    <li key={rang} data-rang={rang}>
                      <span class="loterie-rang">{NOMS_DES_RANGS[rang]}</span>
                      <span>{[stateres(lot.gain), ...pochettesDuLot(lot)].join(", ")}</span>
                    </li>
                  )
                );
              })}
            </ol>
          </div>
        </details>
      </div>

      {!dernierNouveau && dernier}
    </div>
  );
}
