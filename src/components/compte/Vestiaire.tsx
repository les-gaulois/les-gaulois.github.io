import { Fragment, type ComponentChildren, type JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import {
  EMPLACEMENTS_VISAGE,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  PEAUX,
  POILS,
  RETOUR_VILLAGE_KEY,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  memeTenue,
  modeleDuGaulois,
  objetPorte,
  tenueAuHasard,
  tenueDuServeur,
  vignetteDeLObjet,
  type Emplacement,
  type EmplacementDuVisage,
  type Tenue,
  type Vignette,
} from "../../lib/gaulois";
import { EVENEMENT_ENREGISTRE } from "../../lib/compagnon/tenue";
import type { MesStateres } from "../../lib/stateres";
import type { MaBoutique, PlaqueVue } from "../../lib/village/contrat";
import { SOLDE_INCONNU, lireBoutique, lireStateres, motStatere, nombre, quantitePossedee, soldeAffiche } from "../../lib/village/ecran-boutique";
import { tailleDeLApercu } from "../../lib/village/ecran-familiers";
import { PLAQUES_CHANGEES } from "../../lib/village/ecran-forge";
import { FAMILIERS, familierDe } from "../../lib/village/familiers";
import { lirePlaques, plaqueDe } from "../../lib/village/forge";
import { MODELES, tenueAvecModele } from "../../lib/village/modeles";
import { cleDeLObjet, cleDesObjetsVus, ecrireLesVus, faireLePoint, lireLesVus, nouveauxDuRayon } from "../../lib/village/nouveaux-objets";
import { lireMesTenues, type MesTenues } from "../../lib/village/tenues-gardees";
import { NOMS_RAYONS, RAYONS, RAYON_CORPS, cadreDuVisage, collectionDuRayon, grosPlan, motsDeLaCollection, rangerLeRayon, visageNu, type Rayon } from "../../lib/village/vestiaire-rayons";
import { MaBanniere, useDecorDuGaulois } from "../village/Bannieres";
import { Piece } from "../village/BoutiquePixels";
import { ApercuGaulois, BarreDesRayons, Case, noterLeRetour, useSceneCollee } from "../village/Cases";
import { LivreDeLaCollection } from "../village/Collection";
import { MonFamilier, useFamiliers } from "../village/Familiers";
import { MonCorps, useModeles } from "../village/Modeles";
import { TenuesGardees } from "../village/TenuesGardees";
import { CodeLogin, DiscordButton, Loading, Problem, Success, codeLoginShown, messageOf, useMe } from "./common";

/** Le cadre des gros plans du visage, calculé une fois d'après les dessins du catalogue. */
const CADRE_VISAGE = cadreDuVisage();

/** Le visage du Gaulois, pour les cases des cheveux et de la barbe : un carré de 40 cases pris dans le dessin entier. */
function portrait(tenue: Tenue, haut: number): Vignette {
  const cote = 40;
  const gauche = (GAULOIS_LARGEUR - cote) / 2;
  const entier = casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" });
  const cases: (string | null)[] = [];
  for (let y = haut; y < haut + cote; y++) for (let x = gauche; x < gauche + cote; x++) cases.push(entier[y * GAULOIS_LARGEUR + x] ?? null);
  return { largeur: cote, hauteur: cote, cases };
}

/** Une pastille de couleur, son nom à côté : la couleur n'est jamais le seul repère. */
function Pastille({ nom, couleur, choisie, onClick }: { nom: string; couleur: string; choisie: boolean; onClick: () => void }) {
  return (
    <button type="button" class="vestiaire-teinte" aria-pressed={choisie} onClick={onClick}>
      <span class="vestiaire-teinte-rond" style={{ background: couleur }} aria-hidden="true" />
      {nom}
    </button>
  );
}

interface Choix {
  tenue: Tenue;
  /**
   * La tenue enregistrée : ce que le Gaulois porte vraiment. Une case de la tenue à l'écran qui n'y est pas porte « essai »
   * (21 novembre 2026), jusqu'à l'enregistrement ; l'objet enregistré garde sa coche. `null` : le Gaulois n'existe pas
   * encore, ce qu'on choisit est simplement choisi.
   */
  enregistree: Tenue | null;
  /** L'inventaire du membre ; `null` tant que le serveur ne l'a pas donné : seuls les objets gratuits se montrent. */
  boutique: MaBoutique | null;
  /** Les plaques de la forge sur ses objets. */
  plaques: readonly PlaqueVue[];
  /** Les objets arrivés depuis la dernière visite (leurs clés), et ce qu'on fait quand l'un d'eux est essayé. */
  nouveaux?: ReadonlySet<string>;
  onVu?: (cle: string) => void;
  onChange: (tenue: Tenue) => void;
}

/** La case d'un objet de la tenue : portée (la coche, ce qui est enregistré) ou en essai (à l'écran, pas encore enregistré). */
function etatDeLaCase({ tenue, enregistree }: Choix, emplacement: Emplacement, id: string): { portee: boolean; essayee: boolean } {
  const aLEcran = objetPorte(tenue, emplacement) === id;
  if (!enregistree) return { portee: aLEcran, essayee: false };
  const porte = objetPorte(enregistree, emplacement) === id;
  return { portee: porte, essayee: aLEcran && !porte };
}

/** Le titre d'une partie du vestiaire et son contenu. */
function Partie({ emplacement, children }: { emplacement: Emplacement; children: ComponentChildren }) {
  return (
    <div class="vestiaire-emplacement" data-testid={`vestiaire-${emplacement}`}>
      <p id={`vestiaire-${emplacement}`} class="nom-champ vestiaire-titre">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      {children}
    </div>
  );
}

/** La peau : une pastille par couleur. Sous un Gaulois unique, elle ne se voit pas : une ligne le dit, sans pastille. */
function Peau({ tenue, onChange }: Choix) {
  if (modeleDuGaulois(tenue)) {
    return (
      <Partie emplacement="peau">
        <p class="familier-invite" data-testid="vestiaire-peau-cachee">
          Cachée par votre Gaulois unique.
        </p>
      </Partie>
    );
  }
  return (
    <Partie emplacement="peau">
      <div class="vestiaire-pastilles" role="group" aria-labelledby="vestiaire-peau">
        {Object.entries(PEAUX).map(([id, peau]) => (
          <Pastille key={id} nom={peau.nom} couleur={peau.couleurs.s} choisie={tenue["peau"] === id} onClick={() => onChange(changerObjet(tenue, "peau", id))} />
        ))}
      </div>
    </Partie>
  );
}

/** Les cheveux ou la barbe : une case par coupe, avec le visage du Gaulois ; pour les cheveux, leur couleur dessous. */
function Poils(props: Choix & { emplacement: "cheveux" | "barbe" }) {
  const { emplacement, tenue, onChange } = props;
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={portrait(changerObjet(tenue, emplacement, id), emplacement === "cheveux" ? 2 : 8)} {...etatDeLaCase(props, emplacement, id)} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
      {emplacement === "cheveux" && (
        <div class="vestiaire-pastilles" role="group" aria-label="Couleur des cheveux et de la barbe">
          {Object.entries(POILS).map(([id, poils]) => (
            <Pastille key={id} nom={poils.nom} couleur={poils.couleurs.h} choisie={tenue[TEINTE_CHEVEUX] === id} onClick={() => onChange({ ...tenue, [TEINTE_CHEVEUX]: id })} />
          ))}
        </div>
      )}
    </Partie>
  );
}

/**
 * Les yeux, la bouche ou la cicatrice : une case par modèle, avec un gros plan du visage du Gaulois, sans barbe ni coiffe,
 * pour voir le trait qu'on choisit. Gratuits, sans rareté.
 */
function Visage(props: Choix & { emplacement: EmplacementDuVisage }) {
  const { emplacement, tenue, onChange } = props;
  const nu = visageNu(tenue);
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={grosPlan(casesDuGaulois(changerObjet(nu, emplacement, id)), CADRE_VISAGE)} visage {...etatDeLaCase(props, emplacement, id)} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
    </Partie>
  );
}

/**
 * Le rayon d'un emplacement : ce qui se porte, les objets gratuits et ceux que le membre possède. Ce qui reste à acheter
 * est à la boutique (l'onglet « La boutique » de `/village`), plus ici, depuis le 15 novembre 2026.
 */
function Objets(props: Choix & { emplacement: Emplacement }) {
  const { emplacement, tenue, boutique, plaques, nouveaux, onVu, onChange } = props;
  const possede = (id: string): number => (boutique ? quantitePossedee(boutique.inventaire, emplacement, id) : 0);
  return (
    <div class="vestiaire-rayon" data-testid={`vestiaire-${emplacement}`}>
      {/* Le nom du rayon est écrit dans son onglet : ici, il ne sert qu'à nommer le groupe de cases. */}
      <p id={`vestiaire-${emplacement}`} class="sr-only">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {rangerLeRayon(OBJETS[emplacement], possede).aMoi.map(([id, objet]) => (
          <Case
            key={id}
            objet={objet}
            vignette={vignetteDeLObjet(emplacement, id, tenue)}
            {...etatDeLaCase(props, emplacement, id)}
            vente={objet.gratuit ? undefined : { possede: possede(id) }}
            plaque={plaqueDe(plaques, { emplacement, objet: id })}
            nouveau={nouveaux?.has(cleDeLObjet({ emplacement, objet: id })) ?? false}
            onClick={() => {
              onVu?.(cleDeLObjet({ emplacement, objet: id }));
              onChange(changerObjet(tenue, emplacement, id));
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Les parties du rayon du corps, dans l'ordre de leurs pastilles : le corps (humain ou Gaulois unique), puis chaque trait. */
const PARTIES_DU_CORPS = ["corps", "peau", "cheveux", "barbe", ...EMPLACEMENTS_VISAGE] as const;
export type PartieDuCorps = (typeof PARTIES_DU_CORPS)[number];
/** Les clés de la tenue que règle le rayon du corps : un essai sur l'une d'elles se dit sur l'emplacement du corps, dans le jeu. */
export const CLES_DU_CORPS = ["modele", "peau", "cheveux", "barbe", TEINTE_CHEVEUX, ...EMPLACEMENTS_VISAGE] as const;

/** Le visage du Gaulois dans l'onglet du corps : avec sa barbe, sans coiffe ni arme. */
export function visageDuRayon(tenue: Tenue): Vignette {
  return grosPlan(casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" }), CADRE_VISAGE);
}

/**
 * La bourse en une ligne. Le détail de la bourse (d'où viennent les statères, les derniers reçus) est dans l'onglet « La
 * boutique », à côté ; le bouton « Aller à la boutique » est parti le 15 novembre 2026 avec la boutique en onglet (demande
 * du pilote). Un solde qui ne se sait pas encore ne s'écrit pas zéro. Le vestiaire du jeu (21 novembre 2026) ne la montre
 * plus : la barre du jeu, toujours en vue, la porte déjà.
 */
function LaBourse({ solde }: { solde: number | null }) {
  return (
    <p class="vestiaire-bourse" data-testid="vestiaire-bourse">
      <span class="vestiaire-bourse-solde">
        <span class="sr-only">Votre bourse : </span>
        <Piece />
        {solde === null ? (
          <span class="bourse-inconnu">{SOLDE_INCONNU}</span>
        ) : (
          <span>
            <strong class="tnum">{nombre(solde)}</strong> {motStatere(solde)}
          </span>
        )}
      </span>
    </p>
  );
}

/** Le familier et la bannière, dans le vestiaire du jeu, ont leur emplacement à côté du Gaulois, comme ses objets. */
export const FAMILIER = "familier";
export const BANNIERE = "banniere";
/** Ce que le vestiaire ouvre sous son Gaulois : un rayon, ou, dans le jeu, le familier ou la bannière. */
export type OngletDuVestiaire = Rayon | typeof FAMILIER | typeof BANNIERE;
export const estUnRayon = (onglet: OngletDuVestiaire): onglet is Rayon => (RAYONS as readonly string[]).includes(onglet);

type Etat = { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "pret"; enregistree: Tenue | null };

/**
 * Tout ce que fait le vestiaire, sans sa mise en page : ce qu'il lit du serveur, la tenue en cours, ce qu'il envoie. Deux
 * mises en page s'en servent : celle d'avant, ici (l'inscription dans « Mon Compte », la porte des visiteurs), et le
 * vestiaire du jeu « Mon Gaulois » (`VestiaireDuJeu.tsx`, 21 novembre 2026). `actif` : la partie est ouverte ; à son retour,
 * l'inventaire et les Gaulois uniques se relisent.
 */
export function useVestiaire(actif: boolean | undefined) {
  const { me, refresh } = useMe();
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [bourse, setBourse] = useState<MesStateres | null>(null);
  const [boutique, setBoutique] = useState<MaBoutique | null>(null);
  const [plaques, setPlaques] = useState<PlaqueVue[]>([]);
  const [panne, setPanne] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  // Le rayon ouvert (dans le jeu, le familier et la bannière en sont aussi). Le corps d'abord : c'est par lui qu'on crée
  // son Gaulois.
  const [rayon, setRayon] = useState<OngletDuVestiaire>(RAYON_CORPS);
  // La partie du corps ouverte dans son rayon. Sans choix, le corps d'un Gaulois qui existe, sinon la peau.
  const [partieDuCorps, setPartieDuCorps] = useState<PartieDuCorps | null>(null);
  // Le Gaulois existait déjà à la dernière lecture : vrai ou faux jusqu'à la suivante, même une fois le Gaulois créé, pour
  // que rien ne change de place sous les yeux de qui vient le créer (ici comme à l'inscription, dans « Mon compte »).
  const [existait, setExistait] = useState(false);
  // Le familier montré : son choix a son propre envoi, ses propres mots.
  const familiers = useFamiliers();
  const [occupeFamilier, setOccupeFamilier] = useState(false);
  const [problemeFamilier, setProblemeFamilier] = useState<string | null>(null);
  const [annonceFamilier, setAnnonceFamilier] = useState<string | null>(null);
  // Les Gaulois uniques du compte : les corps qu'il peut choisir.
  const modeles = useModeles();

  /** L'inventaire (dans la réponse de la boutique) et l'état de la bourse, relus ensemble : sans eux, le vestiaire reste. */
  const lireLInventaire = async (): Promise<void> => {
    const [b, s] = await Promise.all([call<unknown>("get_ma_boutique").then(lireBoutique, () => null), call<unknown>("get_mes_stateres").then(lireStateres, () => null)]);
    setBoutique(b);
    setBourse(s);
    setPanne(!b);
  };

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const [reponse] = await Promise.all([call<unknown>("get_mon_gaulois"), lireLInventaire(), familiers.lire(), modeles.lire()]);
      const enregistree = tenueDuServeur(reponse);
      setEtat({ kind: "pret", enregistree });
      setPlaques(lirePlaques((reponse as { gravures?: unknown } | null)?.gravures));
      setExistait(enregistree !== null);
      if (enregistree) setTenue(enregistree);
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (me?.signed_in) void lire();
  }, [me?.signed_in]);

  // De retour sur « Mon Gaulois » après la forge : la bourse a pu changer. Relecture discrète, sans rien effacer de
  // l'écran ni de la tenue en cours.
  const avant = useRef(actif);
  useEffect(() => {
    const revenu = actif === true && avant.current === false;
    avant.current = actif;
    if (revenu && etat.kind === "pret") {
      void lireLInventaire();
      // Un Gaulois unique acheté à la boutique, l'onglet voisin, paraît aussitôt parmi les corps.
      void modeles.lire(true);
    }
  }, [actif]);

  // « Le porter », dans l'onglet « La boutique » voisin, enregistre une tenue et l'annonce : le vestiaire la prend,
  // sinon il montrerait l'ancienne, et son « Enregistrer » retirerait l'objet tout juste porté. Sa propre annonce lui
  // revient aussi : c'est la tenue qu'il vient d'enregistrer, rien ne change.
  useEffect(() => {
    const prendre = (e: Event) => {
      const enregistree = tenueDuServeur((e as CustomEvent<unknown>).detail);
      if (!enregistree) return;
      setTenue(enregistree);
      setEtat((x) => (x.kind === "pret" ? { kind: "pret", enregistree } : x));
    };
    window.addEventListener(EVENEMENT_ENREGISTRE, prendre);
    return () => window.removeEventListener(EVENEMENT_ENREGISTRE, prendre);
  }, []);

  // Une plaque gravée ou effacée à la forge (l'onglet voisin) : les plaques du vestiaire se relisent, sans rien
  // toucher à la tenue en cours. Une relecture qui échoue garde celles qu'on avait.
  useEffect(() => {
    const relire = () => {
      void call<unknown>("get_mon_gaulois").then(
        (reponse) => setPlaques(lirePlaques((reponse as { gravures?: unknown } | null)?.gravures)),
        () => {},
      );
    };
    window.addEventListener(PLAQUES_CHANGEES, relire);
    return () => window.removeEventListener(PLAQUES_CHANGEES, relire);
  }, []);

  const changer = (suite: Tenue) => {
    setTenue(suite);
    setReussite(null);
    setProbleme(null);
  };

  const enregistrer = async () => {
    const premiereFois = etat.kind === "pret" && !etat.enregistree;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: tenue }));
      setEtat({ kind: "pret", enregistree });
      // Le script du Gaulois compagnon (src/scripts/compagnon.ts), absent du village, garde la tenue annoncée par
      // « gal:gaulois-enregistre » pour les pages suivantes.
      if (enregistree) window.dispatchEvent(new CustomEvent("gal:gaulois-enregistre", { detail: { tenue: enregistree } }));
      setReussite("Votre Gaulois est enregistré. Tapez /gaulois dans le Discord du clan pour le montrer.");
      // Un Gaulois tout juste créé reçoit ses statères du mois : on relit.
      if (premiereFois) await lireLInventaire();
    } catch (e) {
      setProbleme(messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  const choisirLeFamilier = async (id: string | null) => {
    setOccupeFamilier(true);
    setProblemeFamilier(null);
    setAnnonceFamilier(null);
    const issue = await familiers.choisir(id);
    if (issue.ok) setAnnonceFamilier(issue.valeur ? `« ${familierDe(issue.valeur)?.nom ?? "Ce familier"} » se tient à côté de votre Gaulois.` : "Votre Gaulois ne montre plus de familier.");
    else setProblemeFamilier(issue.message);
    setOccupeFamilier(false);
  };

  // La bannière qu'il montre sur /gaulois, derrière son Gaulois : rien pour un visiteur.
  const decor = useDecorDuGaulois(me !== null && me.signed_in);
  // Les tenues gardées : de l'habillage. Un serveur qui ne les connaît pas encore, ou en panne, n'en montre aucune.
  const [tenuesGardees, setTenuesGardees] = useState<MesTenues | null>(null);
  const [occupeTenues, setOccupeTenues] = useState(false);
  useEffect(() => {
    if (!existait) return;
    void call<unknown>("get_mes_tenues")
      .then(lireMesTenues, () => null)
      .then(setTenuesGardees);
  }, [existait]);
  const garderLaTenue = async (place: number): Promise<void> => {
    setOccupeTenues(true);
    setProbleme(null);
    try {
      const mes = lireMesTenues(await call<unknown>("garder_tenue", { p_place: place, p_tenue: tenue }));
      if (mes) setTenuesGardees(mes);
      else setProbleme("La réponse du serveur est illisible. Rechargez la page.");
    } catch (e) {
      setProbleme(messageOf(e));
    } finally {
      setOccupeTenues(false);
    }
  };

  // Les objets arrivés depuis la dernière visite portent « Nouveau » jusqu'à leur essai. La liste des objets déjà vus
  // reste sur l'appareil, par compte ; un stockage refusé ne montre aucune pastille.
  const [nouveaux, setNouveaux] = useState<ReadonlySet<string>>(new Set());
  const compte = me?.number;
  useEffect(() => {
    if (!boutique || compte === undefined) return;
    try {
      const point = faireLePoint(lireLesVus(localStorage.getItem(cleDesObjetsVus(compte))), boutique.inventaire.map(cleDeLObjet));
      localStorage.setItem(cleDesObjetsVus(compte), ecrireLesVus(point.vus));
      setNouveaux(point.nouveaux);
    } catch {
      setNouveaux(new Set());
    }
  }, [boutique, compte]);
  const noterVu = (cle: string): void => {
    if (!nouveaux.has(cle) || compte === undefined) return;
    const reste = new Set(nouveaux);
    reste.delete(cle);
    setNouveaux(reste);
    try {
      const vus = lireLesVus(localStorage.getItem(cleDesObjetsVus(compte))) ?? new Set<string>();
      vus.add(cle);
      localStorage.setItem(cleDesObjetsVus(compte), ecrireLesVus(vus));
    } catch {
      // Stockage refusé : la pastille reviendra à la prochaine visite, rien d'autre.
    }
  };

  const enregistree = etat.kind === "pret" ? etat.enregistree : null;
  const choix: Choix = { tenue, enregistree, boutique, plaques, nouveaux, onVu: noterVu, onChange: changer };
  const partieOuverte: PartieDuCorps = partieDuCorps === null || (partieDuCorps === "corps" && !existait) ? (existait ? "corps" : "peau") : partieDuCorps;
  return {
    me,
    refresh,
    etat,
    tenue,
    enregistree,
    /** La tenue à l'écran n'est pas l'enregistrée : il y a de quoi enregistrer. */
    change: !memeTenue(tenue, enregistree),
    choix,
    boutique,
    bourse,
    panne,
    occupe,
    probleme,
    reussite,
    rayon,
    setRayon,
    partieOuverte,
    setPartieDuCorps,
    existait,
    familiers,
    occupeFamilier,
    problemeFamilier,
    annonceFamilier,
    modeles,
    decor,
    tenuesGardees,
    occupeTenues,
    nouveaux,
    lire,
    lireLInventaire,
    changer,
    enregistrer,
    choisirLeFamilier,
    garderLaTenue,
    /** Une tenue au hasard parmi les objets gratuits, qui garde le corps choisi. */
    auHasard: () => changer(tenueAvecModele(tenueAuHasard(Math.random), modeleDuGaulois(tenue)?.id ?? null)),
    /** L'essai s'efface : la tenue enregistrée revient. */
    annuler: () => changer(enregistree ?? TENUE_DE_DEPART),
    /** La collection d'un rayon, « 12 sur 62 » : rien pour le corps, ni tant que l'inventaire n'est pas lu. */
    collection: (id: Rayon): string | null => (id === RAYON_CORPS || !boutique ? null : motsDeLaCollection(collectionDuRayon(id, (objet) => quantitePossedee(boutique.inventaire, id, objet)))),
    /** Un objet arrivé depuis la dernière visite attend dans ce rayon. */
    nouveauDans: (id: Rayon): boolean => id !== RAYON_CORPS && nouveauxDuRayon(nouveaux, id) > 0,
  };
}

/** Le vestiaire et ce qu'il sait : ce que rend `useVestiaire`. */
export type LeVestiaire = ReturnType<typeof useVestiaire>;

/**
 * Ce qui se montre avant le Gaulois du membre : la porte d'un visiteur (le Gaulois de départ, la connexion), la lecture,
 * ou la lecture en panne. `null` : le Gaulois est lu, le vestiaire peut s'ouvrir.
 */
export function avantLeGaulois(v: LeVestiaire): JSX.Element | null {
  const { me } = v;
  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (!me.signed_in) {
    return (
      <div class="vestiaire" data-testid="vestiaire-porte">
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
        <div class="vestiaire-porte">
          <p class="text-lg">Connectez-vous pour habiller votre Gaulois.</p>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" avant={() => noterLeRetour(RETOUR_VILLAGE_KEY)} />
          </div>
          {codeLoginShown() && (
            <div class="mt-6">
              <CodeLogin connecte={() => void v.refresh()} />
            </div>
          )}
        </div>
      </div>
    );
  }
  if (v.etat.kind === "lecture") return <Loading label="Lecture de votre Gaulois…" />;
  if (v.etat.kind === "erreur") return <Problem message={v.etat.message} onRetry={() => void v.lire()} />;
  return null;
}

/**
 * La pastille d'une partie du corps, ce qui la choisit : par défaut, un bouton du site écrit ; dans le vestiaire du jeu, un
 * bouton du kit à icône (21 novembre 2026, `VestiaireDuJeu.tsx`). `nom` : le nom de la partie, à dire.
 */
export type PastilleDuCorps = (p: { partie: PartieDuCorps; nom: string; choisie: boolean; choisir: () => void }) => JSX.Element;

/** Le rayon du corps : une partie à la fois, sous ses pastilles. */
export function RayonDuCorps({ v, pastille }: { v: LeVestiaire; pastille?: PastilleDuCorps }) {
  const { choix, partieOuverte, tenue, modeles } = v;
  return (
    <>
      {/* Une partie du corps à la fois (17 novembre 2026) : empilées, elles faisaient plus de quatre écrans, et le
          Gaulois sortait de la vue. Le corps ne se choisit que pour un Gaulois qui existe : rien pendant l'inscription. */}
      <div class="vestiaire-filtre vestiaire-parties" role="group" aria-label="Les parties du corps" data-testid="vestiaire-parties">
        {PARTIES_DU_CORPS.filter((partie) => partie !== "corps" || v.existait).map((partie) => {
          const nom = partie === "corps" ? "Corps" : NOMS_EMPLACEMENTS[partie];
          const choisie = partie === partieOuverte;
          const choisir = (): void => v.setPartieDuCorps(partie);
          if (pastille) return <Fragment key={partie}>{pastille({ partie, nom, choisie, choisir })}</Fragment>;
          return (
            <button key={partie} type="button" class="chip filtre" aria-pressed={choisie} onClick={choisir} data-testid={`vestiaire-partie-${partie}`}>
              {nom}
            </button>
          );
        })}
      </div>
      {partieOuverte === "corps" && <MonCorps etat={modeles.etat} tenue={tenue} vignette={(id) => portrait(tenueAvecModele(tenue, id), 2)} onChange={v.changer} onRelire={() => void modeles.lire()} />}
      {partieOuverte === "peau" && <Peau {...choix} />}
      {(partieOuverte === "cheveux" || partieOuverte === "barbe") && <Poils key={partieOuverte} emplacement={partieOuverte} {...choix} />}
      {EMPLACEMENTS_VISAGE.map((emplacement) => partieOuverte === emplacement && <Visage key={emplacement} emplacement={emplacement} {...choix} />)}
    </>
  );
}

/** Le rayon d'un emplacement d'objets. */
export function RayonDesObjets({ v, emplacement }: { v: LeVestiaire; emplacement: Emplacement }) {
  return <Objets key={emplacement} emplacement={emplacement} {...v.choix} />;
}

/** Le choix du familier montré, pour un Gaulois qui existe. `plie` : dans son pli (la page d'avant), ou ses cartes seules. */
export function ChoixDuFamilier({ v, plie = true }: { v: LeVestiaire; plie?: boolean }) {
  if (!v.existait) return null;
  return <MonFamilier etat={v.familiers.etat} occupe={v.occupeFamilier} probleme={v.problemeFamilier} annonce={v.annonceFamilier} onChoisir={(id) => void v.choisirLeFamilier(id)} onRelire={() => void v.familiers.lire()} plie={plie} />;
}

/** La bannière montrée sur /gaulois et son livre, pour un Gaulois qui existe. */
export function ChoixDeLaBanniere({ v, actif }: { v: LeVestiaire; actif: boolean | undefined }) {
  if (!v.existait || v.me === null || !v.me.signed_in) return null;
  return <MaBanniere actif={actif} nom={v.me.name ?? "Moi"} tenue={v.enregistree ?? v.tenue} familier={v.familiers.montre} />;
}

/** Sans réponse de l'inventaire, le vestiaire marche quand même : un compte qui crée son Gaulois ne voit rien de plus. */
export function PanneDeLInventaire({ v }: { v: LeVestiaire }) {
  if (!v.panne || !v.existait) return null;
  return (
    <div data-testid="vestiaire-panne">
      <Problem message="Votre inventaire ne répond pas pour l'instant : seuls les objets gratuits se montrent." onRetry={() => void v.lireLInventaire()} />
    </div>
  );
}

/** Ce qui suit le Gaulois et ses rayons : les tenues gardées, puis le livre de la collection, dont une ligne de rayon ouvre ce rayon. */
export function TenuesEtCollection({ v }: { v: LeVestiaire }) {
  const { existait, tenuesGardees, boutique, familiers, modeles } = v;
  return (
    <>
      {/* Trois tenues à garder et à remettre : elles ne se portent qu'une fois enregistrées, par le bouton d'enregistrement. */}
      {existait && tenuesGardees && <TenuesGardees mes={tenuesGardees} tenue={v.tenue} occupe={v.occupeTenues || v.occupe} onRemettre={v.changer} onGarder={(place) => void v.garderLaTenue(place)} />}
      {/* Le livre de la collection : ce qu'il possède sur ce qui existe, partout. Une ligne de rayon ouvre ce rayon. */}
      {existait && boutique && (
        <LivreDeLaCollection
          inventaire={boutique.inventaire}
          familiers={familiers.etat.kind === "pret" ? { possedes: familiers.etat.mes.familiers.length, existants: FAMILIERS.length } : null}
          modeles={modeles.etat.kind === "pret" ? { possedes: modeles.etat.mes.modeles.length, existants: MODELES.length } : null}
          onRayon={(id) => {
            v.setRayon(id);
            document.getElementById(`vestiaire-rayon-${id}`)?.focus();
          }}
        />
      )}
    </>
  );
}

/** Ce que dit l'enregistrement : son refus, sa réussite, et qu'un Gaulois n'existe qu'enregistré. */
export function MessagesDuVestiaire({ v }: { v: LeVestiaire }) {
  return (
    <>
      <Problem message={v.probleme} />
      <Success message={v.reussite} />
      {!v.enregistree && !v.reussite && <p class="text-sm text-muted">Votre Gaulois n'existe qu'une fois enregistré.</p>}
    </>
  );
}

/**
 * « Mon Gaulois », sur `/village` jusqu'au 21 novembre 2026, et l'inscription dans « Mon compte » : le visiteur voit le
 * Gaulois de départ et la porte ; un compte lié à Discord habille le sien avec ce qui est à lui, les objets gratuits et son
 * inventaire. Le serveur décide de tout (tenue, inventaire) : l'écran ne fait que proposer et montrer ce qu'il a reçu. Sans
 * réponse de l'inventaire, le vestiaire reste, avec les objets gratuits.
 *
 * Depuis le 14 novembre 2026, le vestiaire s'ouvre un rayon à la fois (`src/lib/village/vestiaire-rayons.ts`) : le corps
 * (peau, cheveux, barbe, et le visage au choix : yeux, bouche, cicatrice), puis la tête, le haut, le bas, les pieds et
 * l'arme. Depuis le 15 novembre 2026, les achats (la boutique de chaque rayon, la pochette surprise, le marché) et la
 * bourse détaillée sont dans l'onglet « La boutique » (`src/components/village/Boutique.tsx`), à côté de celui-ci :
 * ici, la bourse tient en une ligne.
 *
 * Le familier montré à côté du Gaulois (15 novembre 2026) se choisit au-dessus des rayons, parmi ceux qu'on a
 * (`MonFamilier` de `src/components/village/Familiers.tsx`) : le choix part tout de suite au serveur
 * (`choisir_familier`), sans passer par l'enregistrement de la tenue, qui ne change pas. Il ne s'annonce pas par
 * `gal:gaulois-enregistre` : cette annonce porte la tenue enregistrée, que le Gaulois compagnon garde, et le compagnon
 * n'a pas de familier.
 *
 * Le corps (15 novembre 2026) se choisit en tête du rayon du corps : l'humain, ou un des Gaulois uniques du compte
 * (`MonCorps` de `src/components/village/Modeles.tsx`, lus par `get_mes_modeles`). C'est une clé de la tenue : il change
 * l'aperçu et s'enregistre avec elle. « Au hasard » garde le corps choisi.
 *
 * Depuis le 21 novembre 2026, `/village` montre le vestiaire du jeu (`src/components/village/VestiaireDuJeu.tsx`), fait
 * des mêmes pièces : celui-ci ne sert plus qu'à l'inscription dans « Mon compte » et à la porte des visiteurs.
 */
export default function Vestiaire({ actif }: { actif?: boolean } = {}) {
  const v = useVestiaire(actif);
  const { racine, scene, barre, panneau } = useSceneCollee(v.rayon, v.etat.kind);
  const attente = avantLeGaulois(v);
  if (attente) return attente;
  const rayon: Rayon = estUnRayon(v.rayon) ? v.rayon : RAYON_CORPS;
  return (
    <div ref={racine} class="vestiaire" data-testid="vestiaire">
      <div ref={scene} class="vestiaire-scene" data-familier={tailleDeLApercu(v.familiers.montre) ?? undefined}>
        <ApercuGaulois tenue={v.tenue} familier={v.familiers.montre} decor={v.decor} />
        <div class="vestiaire-scene-actions">
          <button type="button" class="btn btn-ghost" onClick={v.auHasard}>
            Au hasard
          </button>
        </div>
      </div>
      <div class="vestiaire-colonne">
        {/* La bourse et la boutique ne servent qu'une fois le Gaulois créé : la ligne ne paraît que pour un Gaulois qui
            existait déjà à la lecture, jamais sous les yeux de qui vient de le créer. */}
        {v.existait && v.boutique && <LaBourse solde={soldeAffiche(v.boutique.solde, v.bourse)} />}
        <PanneDeLInventaire v={v} />
        {/* Le familier ne se montre qu'à côté d'un Gaulois qui existe : rien pendant l'inscription. */}
        <ChoixDuFamilier v={v} />
        {/* La bannière montrée sur /gaulois, comme le familier : pour un Gaulois qui existe. */}
        <ChoixDeLaBanniere v={v} actif={actif} />
        <TenuesEtCollection v={v} />
        <form
          class="vestiaire-choix"
          onSubmit={(e) => {
            e.preventDefault();
            void v.enregistrer();
          }}
        >
          <div ref={barre} class="vestiaire-barre">
            <BarreDesRayons
              prefixe="vestiaire"
              label="Les rayons du vestiaire"
              rayons={RAYONS}
              noms={NOMS_RAYONS}
              rayon={rayon}
              vignette={(id) => (id === RAYON_CORPS ? visageDuRayon(v.tenue) : vignetteDeLObjet(id, v.tenue[id] ?? "", v.tenue))}
              // La collection de chaque rayon : ce qu'il possède sur ce qui existe. Rien tant que l'inventaire n'est pas lu.
              mention={v.collection}
              marque={(id) => (v.nouveauDans(id) ? "Nouveau" : null)}
              onChoisir={v.setRayon}
            />
          </div>
          <div ref={panneau} id="vestiaire-panneau" class="vestiaire-panneau" role="tabpanel" aria-labelledby={`vestiaire-rayon-${rayon}`}>
            {rayon === RAYON_CORPS ? <RayonDuCorps v={v} /> : <RayonDesObjets v={v} emplacement={rayon} />}
          </div>
          <div class="vestiaire-envoi" data-colle={v.change ? "" : undefined}>
            <div class="vestiaire-envoi-boutons">
              <button type="submit" class="btn btn-primary btn-lg" disabled={v.occupe || !v.change} data-testid="vestiaire-enregistrer">
                {v.occupe ? "Enregistrement…" : v.enregistree ? "Enregistrer ma tenue" : "Créer mon Gaulois"}
              </button>
              {v.change && v.enregistree && (
                <button type="button" class="btn btn-ghost" onClick={v.annuler}>
                  Annuler
                </button>
              )}
            </div>
            <MessagesDuVestiaire v={v} />
          </div>
        </form>
      </div>
    </div>
  );
}
