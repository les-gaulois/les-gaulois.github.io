import type { ComponentType, JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { call, duel } from "../../../lib/compte/api";
import { TENUE_DE_DEPART, changerObjet, tenueDuServeur, type Tenue } from "../../../lib/gaulois";
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { ecrire, enCapitales, largeurDuTexte } from "../../../lib/jeu/ecriture";
import { sansCadre } from "../../../lib/village/decor-banniere";
import { R, Planche } from "../../../lib/jeu/planche";
import { lireBoutique } from "../../../lib/village/ecran-boutique";
import {
  ADVERSAIRES_D_ENTRAINEMENT,
  CLE_DU_GUIDE,
  EMPLACEMENTS_DE_LA_MAIN,
  NIVEAUX_D_ENTRAINEMENT,
  NOMS_DES_EMPLACEMENTS,
  NOMS_DES_NIVEAUX,
  cartesAMoi,
  choisirLaMainDeJeu,
  compteDeLaCollection,
  NIVEAUX_AVEC_ARTICLE,
  lireLEtatDuServeur,
  marqueDeLaMain,
  type PartieEnCours,
  mainParDefaut,
  nomDeLObjet,
  type EtatLuDuServeur,
  refusDeLaMain,
  resteDeLaBourse,
  type NiveauDEntrainement,
} from "../../../lib/village/ecran-duel";
import { familierDe, type Familier } from "../../../lib/village/familiers";
import type { ObjetPossede } from "../../../lib/village/contrat";
import { Etiquette, Px } from "../../jeu/Pixels";
import { messageOf } from "../../compte/common";
import { FenetreDuBooster } from "../KitDesBoosters";
import { ApercuGaulois } from "../Cases";
import { AURAS } from "./dessins-des-cartes";
import { iconeApprenti, iconeCollection, iconeDefense, iconeDruide, iconeDuDuel, iconeGuerrier, iconeHistorique } from "./dessins-ecran";
import { MOTEUR, choisirAuNiveau, estUnCompagnon, estUnLieu } from "./moteur-du-site";
import type { MoteurDuDuel } from "./moteur";
import { Recueil, urlDeLaCarte } from "./Recueil";
import { lancerLeDuel, type CampAPoser, type FinDuDuel, type LieuDuDuel, type OptionsDeLaScene, type SceneDuDuel } from "./SceneDuDuel";
import { urlDePetiteIcone } from "./petites-icones";
import { EntreeDesSalles } from "../duel-salles/Entree";
import type { ProprietesDesSalles } from "../duel-salles/LesSalles";
import { EntreeDuTableau } from "../duel-tableau/Entree";
import type { ProprietesDuTableau } from "../duel-tableau/LeTableau";
import { DEFIS, ICONE_DES_DEFIS, ICONE_DU_BOSS, ListeDesDefis, PanneauDesDefis, PanneauDuBoss, bossDAujourdHui, choisirLeBoss, motDeFinDuBoss, optionsDuBossDuJour, partieContreLeBoss, sceneDuDefi, tenueDuBoss, useDefisReussis, type Boss, type Defi } from "./BossEtDefis";
import { SON } from "./sons-du-duel";

/**
 * « Le duel » de « Mon Gaulois » (22 novembre 2026) : le duel de cartes « Coup pour coup », d'après la maquette validée par
 * le pilote (« j'aime beaucoup ») et les écrans dessinés autour par Claude Fable 5.2. L'accueil du duel, puis :
 *
 * - **le duel d'entraînement** contre la machine, en trois niveaux (apprenti, guerrier, druide), joué dans la page avec le
 *   moteur partagé, avec ses vrais objets : rien n'est envoyé au serveur, rien n'est gagné ;
 * - **ma main de défense**, celle que la machine joue quand un autre membre te défie, et son historique ;
 * - **ma collection**, le recueil : les cartes qu'on n'a pas sont grisées, avec où les trouver.
 *
 * Les cartes sont les vrais objets du membre (son inventaire), plus les cartes de base que tout le monde a. Le serveur fait
 * foi pour tout duel qui compte (`get_mon_duel` et les fonctions de `contrat-duel.ts`) ; tant qu'il n'a pas encore le duel,
 * l'entraînement et la collection marchent seuls, et la main de défense attend de pouvoir s'enregistrer.
 *
 * Ce fichier et tout ce qu'il tire (la scène, le moteur) ne se chargent qu'à l'ouverture de la partie (`VillageApp.tsx`) :
 * un membre qui ne voit pas le duel ne les reçoit jamais.
 */

/** La main de jeu (entraînement, boss, salles) gardée sur l'appareil : retrouvée au prochain duel. */
const CLE_DE_LA_MAIN = "gal-duel-main";
/** La dernière défense que cet appareil a prise pour main de jeu : une défense qui en diffère a été enregistrée depuis. */
const CLE_DE_LA_DEFENSE_VUE = "gal-duel-defense-vue";
/** La même, pour cette visite, quand l'appareil ne garde rien. */
let defenseVueIci: string | null = null;

function lireLaMainGardee(): string[] | null {
  try {
    const brut = localStorage.getItem(CLE_DE_LA_MAIN);
    const x: unknown = brut ? JSON.parse(brut) : null;
    return Array.isArray(x) && x.every((id) => typeof id === "string") ? x : null;
  } catch {
    return null;
  }
}

/** La mémoire de la visite d'abord : elle suit chaque défense prise, même quand le stockage, plein, n'a rien pu écrire. */
function lireLaDefenseVue(): string | null {
  if (defenseVueIci !== null) return defenseVueIci;
  try {
    return localStorage.getItem(CLE_DE_LA_DEFENSE_VUE);
  } catch {
    return null;
  }
}

function noterLaDefenseVue(defense: readonly string[]): void {
  defenseVueIci = marqueDeLaMain(defense);
  try {
    localStorage.setItem(CLE_DE_LA_DEFENSE_VUE, defenseVueIci);
  } catch {
    // Sans stockage, la défense vue vaut pour cette visite.
  }
}

/**
 * Le dernier état du duel connu de cette page. L'accès au duel (`VillageApp.tsx`) n'est lu qu'à l'ouverture de « Mon
 * Gaulois » : sans ce souvenir, revenir sur le duel repartait d'avant la défense enregistrée ou le duel joué entre-temps.
 */
let dernierEtat: { serveur: unknown; etat: EtatLuDuServeur | null } | null = null;

const ICONES = {
  duel: () => urlDeLaPlanche("duel-ic-duel", iconeDuDuel),
  apprenti: () => urlDeLaPlanche("duel-ic-apprenti", iconeApprenti),
  guerrier: () => urlDeLaPlanche("duel-ic-guerrier", iconeGuerrier),
  druide: () => urlDeLaPlanche("duel-ic-druide", iconeDruide),
  defense: () => urlDeLaPlanche("duel-ic-defense", iconeDefense),
  historique: () => urlDeLaPlanche("duel-ic-historique", iconeHistorique),
  collection: () => urlDeLaPlanche("duel-ic-collection", iconeCollection),
};
const ICONE_DU_NIVEAU: Readonly<Record<NiveauDEntrainement, () => string>> = { apprenti: ICONES.apprenti, guerrier: ICONES.guerrier, druide: ICONES.druide };

/** Les paillettes des cartes légendaires et divines, et la flèche du retour. */
const PAILLETTES = (): string =>
  urlDeLaPlanche("duel-paillettes", () => {
    const p = new Planche(23, 29);
    for (const [x, y, k] of [
      [3, 4, 1],
      [15, 9, 0],
      [8, 17, 1],
      [19, 22, 0],
      [12, 26, 0],
      [1, 13, 0],
    ] as const) {
      R(p, x, y, 1, 1, "#ffffff");
      if (k) {
        R(p, x - 1, y, 3, 1, "#ffffff");
        R(p, x, y - 1, 1, 3, "#ffffff");
      }
    }
    return p;
  });
const FLECHE = (): string => urlDePetiteIcone("fleche", false);

/**
 * Un mot en pixels dans deux couleurs, une par thème : le vert de « repoussé », que l'écriture du kit n'a pas. Même forme que
 * `Px` (`.jeu-px`), son texte pour les lecteurs d'écran.
 */
const VERT = { clair: "#13763a", sombre: "#7df0a0" };
const ROUGE = { clair: "#c2182b", sombre: "#ff8a8f" };
function Mot({ t, clair, sombre, dit }: { t: string; clair: string; sombre: string; dit?: string }) {
  const mot = enCapitales(t);
  const img = (coul: string): string => urlDeLaPlanche(`duel-mot-couleur|${mot}|${coul}`, () => ecrire(mot, coul));
  return (
    <span class="jeu-px">
      <i aria-hidden="true" style={`--i:${img(clair)};--i-sombre:${img(sombre)};--w:${largeurDuTexte(mot)};--h:9`} />
      <span class="sr-only">{dit ?? t}</span>
    </span>
  );
}

/** Les totaux de l'historique, tels que le serveur les donne ; rien tant qu'il ne les donne pas. */
function BilanDeLaDefense({ serveur, classe = "" }: { serveur: EtatLuDuServeur | null; classe?: string }) {
  if (!serveur || serveur.repousses === null || serveur.battus === null) return null;
  return (
    <span class={`dl-bilan ${classe}`}>
      <Mot t={`${serveur.repousses} REPOUSSÉ${serveur.repousses > 1 ? "S" : ""}`} {...VERT} dit={`${serveur.repousses} repoussés`} />
      <Mot t={`${serveur.battus} FOIS BATTU`} {...ROUGE} dit={`${serveur.battus} fois battu`} />
    </span>
  );
}

/** Une icône dessinée du duel, sur 24 cases. */
function IconeDuDuel({ url, classe = "" }: { url: string; classe?: string }) {
  return <i class={`jeu-ic ${classe}`} style={{ "--i": url } as JSX.CSSProperties} aria-hidden="true" />;
}

/* ---------- Ce que le duel lit ---------- */

interface MonGaulois {
  tenue: Tenue;
  familier: Familier | null;
  banniere: string | null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Le Gaulois du membre, son familier, sa bannière, et son inventaire : ce dont les cartes ont besoin. */
function useLeMembre() {
  const [gaulois, setGaulois] = useState<MonGaulois | null>(null);
  const [inventaire, setInventaire] = useState<readonly ObjetPossede[] | null>(null);
  const [panne, setPanne] = useState(false);
  useEffect(() => {
    let fini = false;
    void (async () => {
      const [g, f, b, boutique] = await Promise.all([
        call<unknown>("get_mon_gaulois").catch(() => null),
        call<unknown>("get_mes_familiers").catch(() => null),
        call<unknown>("get_mes_bannieres").catch(() => null),
        call<unknown>("get_ma_boutique").then(lireBoutique, () => null),
      ]);
      if (fini) return;
      const porteF = estObjet(f) && typeof f["porte"] === "string" ? f["porte"] : null;
      const porteB = estObjet(b) && typeof b["porte"] === "string" ? b["porte"] : null;
      setGaulois({ tenue: tenueDuServeur(g) ?? TENUE_DE_DEPART, familier: porteF ? (familierDe(porteF) ?? null) : null, banniere: porteB });
      setInventaire(boutique?.inventaire ?? null);
      setPanne(!boutique);
    })();
    return () => {
      fini = true;
    };
  }, []);
  return { gaulois, inventaire, panne };
}

/** La bannière d'un lieu, dessinée à la demande : le code des bannières n'est chargé que pour un duel. */
type LibDesBannieres = typeof import("../../../lib/village/bannieres");
let chargement: Promise<LibDesBannieres> | null = null;
/** `null` tant qu'il charge ; `false` s'il n'a pas pu se charger : le duel se joue alors devant un pré, sans effet de lieu. */
function useBannieres(): LibDesBannieres | false | null {
  const [lib, setLib] = useState<LibDesBannieres | false | null>(null);
  useEffect(() => {
    chargement ??= import("../../../lib/village/bannieres");
    void chargement.then(setLib, () => setLib(false));
  }, []);
  return lib;
}

function lieuDe(lib: LibDesBannieres | false | null, id: string | null, m: MoteurDuDuel): { lieu: LieuDuDuel; idDuLieu: string | null } {
  const b = id && lib ? lib.banniereParId(id) : null;
  const decor = id && lib ? lib.dessinDeLaBanniere(id) : null;
  const idDuLieu = b && estUnLieu(b.famille) ? b.famille : null;
  return {
    lieu: { nom: b?.nom ?? "", phrase: idDuLieu ? (m.lieux[idDuLieu]?.phrase ?? null) : null, banniere: decor ? { cases: decor.cases, largeur: 124, hauteur: 80, pieds: 72 } : null },
    idDuLieu,
  };
}
const compagnonDe = (f: Familier | null): string | null => (f && estUnCompagnon(f.famille) ? f.famille : null);

/* ---------- L'en-tête d'un écran du duel ---------- */

function TeteDEcran({ titre, icone, retour, droite }: { titre: string; icone: string; retour: () => void; droite?: JSX.Element | null }) {
  return (
    <div class="dl-tete">
      <button
        type="button"
        class="jeu-btn jeu-btn-bleu jeu-n9 jeu-btn-ic dl-btn"
        aria-label="Retour à l'accueil du duel"
        data-mot="Retour"
        data-testid="duel-retour"
        onClick={() => {
          SON.clic();
          retour();
        }}
      >
        <i class="jeu-pic" style={{ "--i": FLECHE() } as JSX.CSSProperties} />
      </button>
      <h3 class="dl-tete-titre">
        <IconeDuDuel url={icone} />
        <Px t={titre} couleur="texte" />
      </h3>
      {droite}
    </div>
  );
}

/* ---------- Le duel ---------- */

/** L'arène : sa rencontre, et de quoi en refaire une neuve pour « Rejouer » (jamais une reprise, jamais une partie finie). */
type Vue = { kind: "accueil" } | { kind: "arene"; rencontre: Rencontre; neuve: () => Rencontre; partie: number } | { kind: "collection" } | { kind: "defense" } | { kind: "defis" } | { kind: "salles" } | { kind: "tableau" };

export default function LeDuel({ serveur }: { serveur: unknown | null }) {
  const m = MOTEUR;
  const { gaulois, inventaire, panne } = useLeMembre();
  const lib = useBannieres();
  const [vue, setVue] = useState<Vue>({ kind: "accueil" });
  const [etatServeur, setEtatServeur] = useState<EtatLuDuServeur | null>(() => (dernierEtat && dernierEtat.serveur === serveur ? dernierEtat.etat : lireLEtatDuServeur(serveur)));
  useEffect(() => {
    dernierEtat = { serveur, etat: etatServeur };
  }, [serveur, etatServeur]);
  // Les cartes à moi : celles que le serveur dit jouables quand il a le duel, sinon l'inventaire et les cartes de base.
  const aMoi = useMemo(() => etatServeur?.collection ?? (inventaire || !panne ? cartesAMoi(m.catalogue, inventaire) : null), [etatServeur, inventaire, panne, m]);
  const [main, setMain] = useState<string[] | null>(null);
  const [reussis, noterReussi] = useDefisReussis();
  // Après un duel au serveur : l'état se relit (le boss battu, la partie finie, l'historique).
  const relireLeServeur = (): void => {
    if (!etatServeur) return;
    void duel.etat().then(
      (r) => setEtatServeur(lireLEtatDuServeur(r)),
      () => undefined,
    );
  };
  const boss = useMemo(() => bossDAujourdHui(etatServeur?.boss ?? null), [etatServeur]);
  useEffect(() => {
    if (serveur) relireLeServeur();
  }, []);
  const mainRef = useRef<readonly string[]>([]);
  mainRef.current = main ?? [];
  // Les salles en direct (vague 2, session « Duel : salles en direct avec mise ») : leur écran ne se charge qu'en y entrant.
  const [LesSalles, setLesSalles] = useState<ComponentType<ProprietesDesSalles> | null>(null);
  useEffect(() => {
    if (vue.kind !== "salles" || LesSalles) return;
    import("../duel-salles/LesSalles").then(
      (mod) => setLesSalles(() => mod.default),
      () => setVue({ kind: "accueil" }),
    );
  }, [vue.kind, LesSalles]);

  // Le tableau des duellistes (vague 2, session « Duel : tableau et saison ») : son écran ne se charge qu'en y entrant.
  const [LeTableau, setLeTableau] = useState<ComponentType<ProprietesDuTableau> | null>(null);
  useEffect(() => {
    if (vue.kind !== "tableau" || LeTableau) return;
    import("../duel-tableau/LeTableau").then(
      (mod) => setLeTableau(() => mod.default),
      () => setVue({ kind: "accueil" }),
    );
  }, [vue.kind, LeTableau]);

  const garderLaMain = (x: string[]): void => {
    setMain(x);
    try {
      localStorage.setItem(CLE_DE_LA_MAIN, JSON.stringify(x));
    } catch {
      // Sans stockage, la main vaut pour cette visite.
    }
  };
  // La main de jeu : une défense neuve pour cet appareil la remplace (enregistrée ici, ailleurs, ou avant) ; sinon, à
  // l'ouverture, celle de l'appareil si elle est encore valable, puis la défense, puis ce que porte le Gaulois. Jamais
  // pendant un duel ou dans les salles : la main montrée est celle qui part au serveur ; elle se reprend au retour.
  const enJeu = vue.kind === "arene" || vue.kind === "salles";
  useEffect(() => {
    if (!gaulois || !aMoi || (enJeu && main)) return;
    const choix = choisirLaMainDeJeu({
      actuelle: main,
      gardee: lireLaMainGardee(),
      defense: etatServeur?.defense ?? null,
      defenseVue: lireLaDefenseVue(),
      valable: (x) => refusDeLaMain(x, m.catalogue, aMoi, m.prix, m.P.BOURSE) === null,
      parDefaut: () => mainParDefaut(m.catalogue, gaulois.tenue, aMoi, m.prix, m.P.BOURSE),
    });
    if (!choix) return;
    if (choix.adoptee) {
      noterLaDefenseVue(choix.main);
      garderLaMain(choix.main);
    } else setMain(choix.main);
  }, [gaulois, aMoi, etatServeur, main, m, enJeu]);

  const style = { "--dl-paillettes": PAILLETTES() } as JSX.CSSProperties;
  if (!gaulois || !main || !aMoi) {
    return (
      <div class="duel-jeu" style={style} data-testid="duel">
        <p class="dl-attente">{panne ? "La garde-robe ne répond pas : tes cartes ne se savent pas. Réessaie dans un instant." : "Lecture de tes cartes…"}</p>
      </div>
    );
  }

  return (
    <div class="duel-jeu" style={style} data-testid="duel" data-vue={vue.kind}>
      {vue.kind === "accueil" && (
        <Accueil
          m={m}
          main={main}
          aMoi={aMoi}
          serveur={etatServeur}
          onNiveau={(niveau) => setVue({ kind: "arene", rencontre: rencontreDEntrainement(niveau), neuve: () => rencontreDEntrainement(niveau), partie: Date.now() })}
          onDefense={() => setVue({ kind: "defense" })}
          onCollection={() => setVue({ kind: "collection" })}
          boss={
            <PanneauDuBoss
              boss={boss}
              battu={etatServeur?.bossBattu ?? false}
              lib={lib || null}
              onAffronter={() => {
                // Une partie que le serveur garde ouverte contre un boss se reprend, contre ce boss-là (peut-être celui d'hier).
                const enCours = etatServeur?.partie?.contre === "boss" ? etatServeur.partie : null;
                const neuve = (): Rencontre => rencontreDuBoss(bossDAujourdHui(), !!etatServeur, () => mainRef.current, null, relireLeServeur);
                setVue({ kind: "arene", rencontre: enCours ? rencontreDuBoss(bossDAujourdHui(enCours.boss), true, () => mainRef.current, enCours, relireLeServeur) : neuve(), neuve, partie: Date.now() });
              }}
            />
          }
          defis={<PanneauDesDefis reussis={reussis} onOuvrir={() => setVue({ kind: "defis" })} />}
          salles={<EntreeDesSalles onOuvrir={() => setVue({ kind: "salles" })} />}
          tableau={<EntreeDuTableau onOuvrir={() => setVue({ kind: "tableau" })} />}
        />
      )}
      {vue.kind === "tableau" &&
        (LeTableau ? (
          <LeTableau
            retour={() => {
              relireLeServeur();
              setVue({ kind: "accueil" });
            }}
            lib={lib}
          />
        ) : (
          <p class="dl-attente">Ouverture du tableau…</p>
        ))}
      {vue.kind === "salles" &&
        (LesSalles ? (
          <LesSalles
            retour={() => {
              relireLeServeur();
              setVue({ kind: "accueil" });
            }}
            m={m}
            lib={lib}
            gaulois={{ tenue: gaulois.tenue, familier: gaulois.familier, banniere: gaulois.banniere }}
            main={main}
            aMoi={aMoi}
            onMain={garderLaMain}
          />
        ) : (
          <p class="dl-attente">Ouverture des salles…</p>
        ))}
      {vue.kind === "arene" && (
        <Arene
          key={vue.partie}
          m={m}
          lib={lib}
          gaulois={gaulois}
          main={main}
          aMoi={aMoi}
          rencontre={vue.rencontre}
          onMain={garderLaMain}
          onRejouer={() => setVue({ kind: "arene", rencontre: vue.neuve(), neuve: vue.neuve, partie: Date.now() })}
          onQuitter={() => {
            relireLeServeur();
            setVue({ kind: "accueil" });
          }}
        />
      )}
      {vue.kind === "defis" && (
        <section class="dl-ecran" aria-label="Les défis">
          <TeteDEcran
            titre="Défis"
            icone={ICONE_DES_DEFIS()}
            retour={() => setVue({ kind: "accueil" })}
            droite={<Px t={`${DEFIS.filter((d) => reussis.has(d.id)).length} SUR ${DEFIS.length}`} couleur="or" classe="dl-p-droite" />}
          />
          <ListeDesDefis
            reussis={reussis}
            onJouer={(d) => {
              const neuve = (): Rencontre => rencontreDuDefi(d, () => noterReussi(d.id));
              setVue({ kind: "arene", rencontre: neuve(), neuve, partie: Date.now() });
            }}
          />
        </section>
      )}
      {vue.kind === "collection" && (
        <section class="dl-ecran" aria-label="Ma collection">
          <TeteDEcran titre="Ma collection" icone={ICONES.collection()} retour={() => setVue({ kind: "accueil" })} droite={<CompteDeLaCollection m={m} aMoi={aMoi} />} />
          <div class="jeu-panneau jeu-n9 dl-p">
            <Recueil m={m} aMoi={aMoi} />
          </div>
        </section>
      )}
      {vue.kind === "defense" && (
        <MainDeDefense
          m={m}
          lib={lib}
          gaulois={gaulois}
          aMoi={aMoi}
          serveur={etatServeur}
          depart={etatServeur?.defense ? [...etatServeur.defense] : main}
          onEnregistree={(defense) => {
            // La défense qu'on vient d'enregistrer est aussi la main de jeu : le boss, l'entraînement et les salles la prennent.
            noterLaDefenseVue(defense);
            garderLaMain([...defense]);
            setEtatServeur((s) => (s ? { ...s, defense } : s));
          }}
          retour={() => setVue({ kind: "accueil" })}
        />
      )}
    </div>
  );
}

function CompteDeLaCollection({ m, aMoi }: { m: MoteurDuDuel; aMoi: ReadonlySet<string> }) {
  const { a, total } = compteDeLaCollection(m.catalogue, aMoi);
  return (
    <span class="dl-compte">
      <Px t={`${a} SUR ${total}`} couleur="or" dit={`${a} cartes sur ${total}`} />
      <span class="jeu-tube jeu-n9 dl-tube" aria-hidden="true">
        <span class="jeu-plein jeu-n9 jeu-plein-or" style={`--part:${(a / Math.max(1, total)).toFixed(3)}`} />
      </span>
    </span>
  );
}

/** Une petite carte, image seule (dans l'accueil et la défense). */
function PetiteCarte({ m, id, classe = "" }: { m: MoteurDuDuel; id: string; classe?: string }) {
  const c = m.carte(id);
  return <i class={`dl-petite ${classe}`} data-r={c.r} style={{ backgroundImage: urlDeLaCarte(m, id), "--rc": AURAS[c.r] } as JSX.CSSProperties} aria-hidden="true" />;
}

/* ---------- L'accueil ---------- */

function Accueil({ m, main, aMoi, serveur, onNiveau, onDefense, onCollection, boss = null, defis = null, salles = null, tableau = null }: { m: MoteurDuDuel; main: readonly string[]; aMoi: ReadonlySet<string>; serveur: EtatLuDuServeur | null; onNiveau: (n: NiveauDEntrainement) => void; onDefense: () => void; onCollection: () => void; boss?: JSX.Element | null; defis?: JSX.Element | null; salles?: JSX.Element | null; tableau?: JSX.Element | null }) {
  const defense = serveur?.defense ?? null;
  const [guideRevu, setGuideRevu] = useState(false);
  const { a, total } = compteDeLaCollection(m.catalogue, aMoi);
  const eventail = [...aMoi].filter((id) => m.catalogue[id]?.r !== "base").sort((x, y) => m.prix(y) - m.prix(x)).slice(0, 3);
  return (
    <section class="dl-accueil" aria-label="L'accueil du duel">
      {boss}
      <div class="jeu-panneau jeu-n9 dl-p dl-p-entrainement">
        <h3 class="dl-p-tete">
          <IconeDuDuel url={ICONES.duel()} />
          <Px t="Entraînement" couleur="texte" />
        </h3>
        <div class="dl-niveaux" role="group" aria-label="Choisir le niveau de la machine">
          {NIVEAUX_D_ENTRAINEMENT.map((n, i) => (
            <button
              key={n}
              type="button"
              class="jeu-btn jeu-btn-bleu jeu-n9 dl-btn dl-niveau"
              aria-label={`Duel d'entraînement contre ${NIVEAUX_AVEC_ARTICLE[n]}, niveau ${i + 1} sur 3`}
              data-mot={NOMS_DES_NIVEAUX[n]}
              data-testid={`duel-niveau-${n}`}
              onClick={() => {
                SON.clic();
                onNiveau(n);
              }}
            >
              <IconeDuDuel url={ICONE_DU_NIVEAU[n]()} />
              <Etiquette t={String(i + 1)} ton="or" classe="dl-niveau-rang" />
            </button>
          ))}
        </div>
        <p class="dl-p-mot">
          Contre la machine, dans ton navigateur : rien n'est gagné ni perdu.{" "}
          <button
            type="button"
            class="dl-lien"
            data-testid="duel-revoir-guide"
            onClick={() => {
              try {
                localStorage.removeItem(CLE_DU_GUIDE);
              } catch {
                // Sans stockage, le guide revient de lui-même au prochain duel.
              }
              SON.clic();
              setGuideRevu(true);
            }}
          >
            {guideRevu ? "Le guide reviendra au prochain duel." : "Revoir le guide"}
          </button>
        </p>
      </div>

      {defis}
      {salles}
      {tableau}
      <button type="button" class="jeu-panneau jeu-n9 dl-p dl-p-lien dl-p-defense" data-testid="duel-ouvrir-defense" onClick={onDefense}>
        <span class="dl-p-tete">
          <IconeDuDuel url={ICONES.defense()} />
          <Px t="Ma défense" couleur="texte" classe="dl-mot-long" />
          <Px t="Défense" couleur="texte" classe="dl-mot-court" />
        </span>
        <span class="dl-mini-main" aria-hidden="true">
          {(defense ?? main).map((id) => (
            <PetiteCarte key={id} m={m} id={id} />
          ))}
        </span>
        <BilanDeLaDefense serveur={serveur} />
        {!defense && <span class="dl-p-mot">Pas encore enregistrée.</span>}
        {defense && serveur && !serveur.defenseValide && <span class="dl-p-mot">Une de ses cartes a quitté ta garde-robe : personne ne peut te défier.</span>}
        <span class="sr-only">Ouvrir ma main de défense</span>
      </button>

      <button type="button" class="jeu-panneau jeu-n9 dl-p dl-p-lien dl-p-collection" data-testid="duel-ouvrir-collection" onClick={onCollection}>
        <span class="dl-p-tete">
          <IconeDuDuel url={ICONES.collection()} />
          <Px t="Ma collection" couleur="texte" classe="dl-mot-long" />
          <Px t="Collection" couleur="texte" classe="dl-mot-court" />
          <Px t={`${a} SUR ${total}`} couleur="or" classe="dl-p-droite" dit={`${a} cartes sur ${total}`} />
        </span>
        <span class="dl-collection-bas">
          <span class="jeu-tube jeu-n9 dl-tube" aria-hidden="true">
            <span class="jeu-plein jeu-n9 jeu-plein-or" style={`--part:${(a / Math.max(1, total)).toFixed(3)}`} />
          </span>
          <span class="dl-eventail" aria-hidden="true">
            {eventail.map((id) => (
              <PetiteCarte key={id} m={m} id={id} />
            ))}
          </span>
        </span>
        <span class="sr-only">Ouvrir ma collection</span>
      </button>
    </section>
  );
}

/* ---------- L'arène ---------- */

/**
 * Contre qui se joue un duel : la machine à un niveau (l'entraînement), et le boss du jour ou un défi quand leur contenu
 * est là. La rencontre donne le camp d'en face, le lieu (une bannière), qui choisit sa carte (la machine du navigateur, ou
 * le serveur), et ce qu'on écrit à la fin.
 */
export interface Rencontre {
  titre: string;
  icone: string;
  /** Le nom de l'arène pour un lecteur d'écran. */
  dit: string;
  /** La bannière du lieu ; `null` : un pré sous le ciel, sans effet. */
  banniere: string | null;
  /** Le camp d'en face, une fois le lieu connu (`idDuLieu` : sa famille, l'effet du lieu). */
  lui: (idDuLieu: string | null) => CampAPoser;
  /** Une main imposée (un défi) : elle ne se change pas, et la mienne reste celle d'avant. */
  mainImposee?: readonly string[];
  /** Le lieu que donne le serveur (la famille de la bannière du boss), quand les bannières ne se chargent pas. */
  lieuDuServeur?: string;
  /** Les manches déjà jouées d'une partie reprise au serveur. */
  reprise?: readonly (readonly [number, number])[];
  /** Un défi : sa consigne s'écrit à la place du lieu, et le familier n'y donne rien (le défi pose les deux camps). */
  consigne?: { titre: string; phrase: string };
  choisir?: OptionsDeLaScene["choisir"];
  jouer?: OptionsDeLaScene["jouer"];
  defi?: OptionsDeLaScene["defi"];
  motDeFin: (f: FinDuDuel) => string | null;
  onFin?: (f: FinDuDuel) => void;
}

/** La rencontre d'entraînement contre la machine, à un niveau. */
function rencontreDEntrainement(niveau: NiveauDEntrainement): Rencontre {
  const adv = ADVERSAIRES_D_ENTRAINEMENT[niveau];
  const famLui = familierDe(adv.familier) ?? null;
  return {
    titre: `Contre ${NIVEAUX_AVEC_ARTICLE[niveau]}`,
    icone: ICONE_DU_NIVEAU[niveau](),
    dit: `Duel d'entraînement contre ${NIVEAUX_AVEC_ARTICLE[niveau]}`,
    banniere: adv.banniere,
    lui: (idDuLieu) => ({
      ruban: NOMS_DES_NIVEAUX[niveau].toUpperCase(),
      bleu: false,
      dit: `Le Gaulois de la machine, niveau ${NOMS_DES_NIVEAUX[niveau].toLowerCase()}`,
      main: adv.main,
      tenue: { ...TENUE_DE_DEPART, ...adv.allure },
      familier: famLui,
      options: { compagnon: compagnonDe(famLui), lieu: idDuLieu },
    }),
    choisir: (b, a, manche) => choisirAuNiveau(b, a, manche, niveau),
    motDeFin: () => "Duel d'entraînement : rien n'est gagné ni perdu.",
  };
}

/**
 * La rencontre contre le boss du jour : au serveur quand il a le duel, sinon un essai dans la page. Une partie que le
 * serveur garde ouverte contre ce boss se reprend : sa main et ses manches jouées.
 */
function rencontreDuBoss(boss: Boss, auServeur: boolean, main: () => readonly string[], enCours: PartieEnCours | null, onFin: () => void): Rencontre {
  const reprise = enCours && enCours.contre === "boss" && enCours.boss === boss.id ? enCours : null;
  const serveur = auServeur ? partieContreLeBoss(main, reprise?.id ?? null) : null;
  return {
    ...(reprise ? { mainImposee: reprise.main, reprise: reprise.coups } : {}),
    titre: boss.titre,
    icone: ICONE_DU_BOSS(),
    dit: `Duel contre le boss du jour : ${boss.titre}`,
    banniere: boss.lieu.banniere,
    lui: () => ({
      ruban: "BOSS",
      bleu: false,
      dit: `Le boss du jour, ${boss.titre}`,
      main: boss.main,
      tenue: tenueDuBoss(boss),
      familier: null,
      options: optionsDuBossDuJour(boss),
      plus: [{ gras: `Pouvoir du boss : ${boss.pouvoir.nom}.`, texte: boss.pouvoir.phrase }],
    }),
    lieuDuServeur: boss.lieu.famille,
    ...(serveur ? { jouer: serveur.jouer } : { choisir: choisirLeBoss }),
    motDeFin: motDeFinDuBoss(boss, auServeur, () => serveur?.pas() ?? null),
    onFin,
  };
}

/** La rencontre d'un défi : sa main, son adversaire, son issue. */
function rencontreDuDefi(d: Defi, onReussi: () => void): Rencontre {
  const sd = sceneDuDefi(d);
  return {
    titre: d.titre,
    icone: ICONE_DES_DEFIS(),
    dit: `Défi : ${d.titre}. ${d.consigne}`,
    banniere: null,
    lui: () => ({ ruban: "DÉFI", bleu: false, dit: "Le Gaulois du défi", main: d.lui.main, tenue: TENUE_DE_DEPART, familier: null, options: { lieu: d.lieu } }),
    mainImposee: d.toi.main,
    consigne: { titre: d.titre, phrase: `${d.consigne}${d.lieu && MOTEUR.lieux[d.lieu] ? ` ${MOTEUR.lieux[d.lieu]!.phrase}` : ""}` },
    choisir: sd.choisir,
    defi: { depart: sd.depart, annonce: sd.annonce, issue: sd.issue },
    motDeFin: (f) => (f.verdict > 0 ? "Défi réussi." : `Défi raté. Un indice : ${d.indice}`),
    onFin: (f) => {
      if (f.verdict > 0) onReussi();
    },
  };
}

function Arene({
  m,
  lib,
  gaulois,
  main,
  aMoi,
  rencontre,
  onMain,
  onRejouer,
  onQuitter,
}: {
  m: MoteurDuDuel;
  lib: LibDesBannieres | false | null;
  gaulois: MonGaulois;
  main: readonly string[];
  aMoi: ReadonlySet<string>;
  rencontre: Rencontre;
  onMain: (x: string[]) => void;
  onRejouer: () => void;
  onQuitter: () => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneDuDuel | null>(null);
  const [tiroir, setTiroir] = useState<{ i: number; main: readonly string[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const pret = lib !== null;
  const r = rencontre;
  useEffect(() => {
    if (!pret || !racine.current) return;
    const { lieu, idDuLieu: lieuDeLaBanniere } = lieuDe(lib, r.banniere, m);
    const idDuLieu = lieuDeLaBanniere ?? r.lieuDuServeur ?? null;
    let guide = true;
    try {
      guide = localStorage.getItem(CLE_DU_GUIDE) !== "vu";
    } catch {
      guide = true;
    }
    const imposee = r.mainImposee ?? null;
    const moi: CampAPoser = { ruban: "TOI", bleu: true, dit: "Ton Gaulois", main: imposee ?? main, tenue: gaulois.tenue, familier: r.consigne ? null : gaulois.familier, options: { compagnon: r.consigne ? null : compagnonDe(gaulois.familier), lieu: idDuLieu } };
    const lieuMontre = r.consigne ? { ...lieu, nom: r.consigne.titre, phrase: r.consigne.phrase } : lieu;
    scene.current = lancerLeDuel(racine.current, {
      moteur: m,
      moi,
      lui: r.lui(idDuLieu),
      lieu: lieuMontre,
      choisir: r.choisir,
      jouer: r.jouer,
      defi: r.defi,
      reprise: r.reprise,
      changerUneCarte: imposee ? null : (i, mainActuelle) => setTiroir({ i, main: mainActuelle }),
      guide,
      motDeFin: r.motDeFin,
      onDebut: () => {
        if (!imposee) onMain([...(scene.current?.main() ?? main)]);
      },
      onFin: (f) => r.onFin?.(f),
      onErreur: (e) => setErreur(messageOf(e)),
      onRejouer,
      onQuitter,
    });
    return () => {
      scene.current?.arreter();
      scene.current = null;
    };
  }, [pret]);

  return (
    <section class="dl-ecran dl-arene" aria-label={r.dit}>
      <TeteDEcran titre={r.titre} icone={r.icone} retour={onQuitter} />
      <div class="dl-arene-cadre">
        <div ref={racine} class="dl-racine" />
        {!pret && <p class="dl-attente">Préparation de l'arène…</p>}
      </div>
      {erreur && (
        <p class="dl-attente" role="alert">
          {erreur}
        </p>
      )}
      {tiroir && (
        <FenetreDuBooster titre={`Changer : ${NOMS_DES_EMPLACEMENTS[EMPLACEMENTS_DE_LA_MAIN[tiroir.i]!]}`} etape="choix" occupe={false} onFermer={() => setTiroir(null)} testid="duel-tiroir">
          <Recueil
            m={m}
            aMoi={aMoi}
            choix={{
              emplacement: EMPLACEMENTS_DE_LA_MAIN[tiroir.i]!,
              actuelle: tiroir.main[tiroir.i]!,
              reste: resteDeLaBourse(tiroir.main, tiroir.i, m.prix, m.P.BOURSE),
              onPrendre: (id) => {
                const i = tiroir.i;
                setTiroir(null);
                scene.current?.changerCarte(i, id);
                onMain([...(scene.current?.main() ?? main)]);
              },
            }}
          />
        </FenetreDuBooster>
      )}
    </section>
  );
}

/* ---------- Ma main de défense ---------- */

function MainDeDefense({
  m,
  lib,
  gaulois,
  aMoi,
  serveur,
  depart,
  onEnregistree,
  retour,
}: {
  m: MoteurDuDuel;
  lib: LibDesBannieres | false | null;
  gaulois: MonGaulois;
  aMoi: ReadonlySet<string>;
  serveur: EtatLuDuServeur | null;
  depart: readonly string[];
  onEnregistree: (main: string[]) => void;
  retour: () => void;
}) {
  const [main, setMain] = useState<string[]>([...depart]);
  const [tiroir, setTiroir] = useState<number | null>(null);
  // Au téléphone, la main et l'historique se montrent l'un après l'autre, par deux boutons dans l'en-tête.
  const [volet, setVolet] = useState<"main" | "historique">("main");
  const [envoi, setEnvoi] = useState<{ kind: "rien" } | { kind: "envoi" } | { kind: "fait" } | { kind: "erreur"; message: string }>({ kind: "rien" });
  const cartes = main.map((id) => m.carte(id));
  const { lieu, idDuLieu } = lieuDe(lib, gaulois.banniere, m);
  const opts = { compagnon: compagnonDe(gaulois.familier), lieu: idDuLieu };
  const pris = m.prixDeLaMain(cartes);
  const garde = m.P.BOURSE - pris;
  const vie = m.vieDeLaMain(cartes, opts);
  const refus = refusDeLaMain(main, m.catalogue, aMoi, m.prix, m.P.BOURSE);
  const tenue = main.reduce((t, id, i) => changerObjet(t, EMPLACEMENTS_DE_LA_MAIN[i]!, id), gaulois.tenue);
  const decor = useMemo(() => {
    const v = gaulois.banniere && lib ? lib.vignetteDeLaBanniere(gaulois.banniere) : null;
    return v ? sansCadre(v) : null;
  }, [lib, gaulois.banniere]);
  const enregistrer = async (): Promise<void> => {
    if (refus || envoi.kind === "envoi") return;
    setEnvoi({ kind: "envoi" });
    try {
      await duel.enregistrerMain(Object.fromEntries(EMPLACEMENTS_DE_LA_MAIN.map((e, i) => [e, main[i]!])) as Parameters<typeof duel.enregistrerMain>[0]);
      onEnregistree(main);
      setEnvoi({ kind: "fait" });
      SON.enfile();
    } catch (e) {
      setEnvoi({ kind: "erreur", message: messageOf(e) });
    }
  };
  const pions = urlDeLaPlanche(`duel-bourse|${pris}`, () => {
    const g = new Planche(m.P.BOURSE * 9 - 1, 10);
    for (let i = 0; i < m.P.BOURSE; i++) {
      const plein = i < pris;
      const x = i * 9;
      R(g, x + 1, 0, 6, 10, plein ? "#070b1f" : "#a8101f");
      R(g, x, 1, 8, 8, plein ? "#070b1f" : "#a8101f");
      R(g, x + 1, 1, 6, 8, plein ? "#ffc61a" : "#ffd9de");
      if (plein) R(g, x + 2, 1, 4, 1, "#fff2a8");
    }
    return g;
  });
  return (
    <section class="dl-ecran dl-defense" aria-label="Ma main de défense" data-volet={volet}>
      <TeteDEcran
        titre="Ma défense"
        icone={ICONES.defense()}
        retour={retour}
        droite={
          <span class="dl-volets" role="group" aria-label="Montrer">
            {(
              [
                ["main", "Ma main", ICONES.defense],
                ["historique", "L'historique", ICONES.historique],
              ] as const
            ).map(([cle, mot, icone]) => (
              <button
                key={cle}
                type="button"
                class="jeu-btn jeu-btn-bleu jeu-n9 jeu-btn-ic dl-btn dl-volet"
                aria-pressed={volet === cle}
                aria-label={mot}
                data-mot={mot}
                onClick={() => {
                  SON.clic();
                  setVolet(cle);
                }}
              >
                <IconeDuDuel url={icone()} />
              </button>
            ))}
          </span>
        }
      />
      <div class="jeu-panneau jeu-n9 dl-p dl-defense-p">
        <div class="dl-defense-gaulois">
          <ApercuGaulois tenue={tenue} familier={gaulois.familier} decor={decor} class="dl-apercu-gaulois" />
          <p class="dl-p-mot">
            <b>On te défie chez toi.</b> {lieu.nom ? `${lieu.nom}${lieu.phrase ? ` : ${lieu.phrase.charAt(0).toLowerCase()}${lieu.phrase.slice(1)}` : "."}` : lib === null ? "" : "Sans bannière, le duel n'a pas de lieu."}
          </p>
          {m.panopliesDe(cartes).map((id) => (
            <p key={id} class="dl-p-mot">
              <b>Panoplie « {m.panoplies[id]?.nom} ».</b> {m.panoplies[id]?.phrase}
            </p>
          ))}
        </div>
        <div class="dl-defense-main">
          <div class="dl-defense-cartes" role="group" aria-label="Les cinq cartes de ta défense">
            {main.map((id, i) => {
              const e = EMPLACEMENTS_DE_LA_MAIN[i]!;
              return (
                <div key={e} class="dl-defense-place">
                  <Px t={NOMS_DES_EMPLACEMENTS[e]} couleur="texte" muet />
                  <button
                    type="button"
                    class="dl-defense-carte"
                    data-testid={`duel-defense-${e}`}
                    aria-label={`${NOMS_DES_EMPLACEMENTS[e].charAt(0)}${NOMS_DES_EMPLACEMENTS[e].slice(1).toLowerCase()} : ${nomDeLObjet(e, id)}. Changer cette carte`}
                    onClick={() => {
                      SON.clic();
                      setTiroir(i);
                    }}
                  >
                    <PetiteCarte m={m} id={id} classe="dl-grande-petite" />
                  </button>
                </div>
              );
            })}
          </div>
          <div class="dl-defense-bas">
            <span class="dl-defense-vie">
              <Px t={`${vie} DE VIE`} couleur="texte" dit={`${vie} de vie`} />
            </span>
            <span class="dl-defense-bourse">
              <i class="dl-etq" style={{ "--i": pions, "--w": m.P.BOURSE * 9 - 1, "--h": 10 } as JSX.CSSProperties} aria-hidden="true" />
              <Px t={`BOURSE ${pris} SUR ${m.P.BOURSE}`} couleur="texte" />
              <Px t={garde ? `${garde} GARDÉ${garde > 1 ? "S" : ""} : ${Math.floor((garde * m.P.VIE_PAR_POINT) / m.P.POINTS_POUR_UNE_VIE)} DE VIE EN PLUS` : "TOUT EST DÉPENSÉ"} couleur="doux" />
            </span>
            <button type="button" class="jeu-btn jeu-n9 dl-enregistrer" disabled={!!refus || envoi.kind === "envoi"} data-testid="duel-enregistrer" onClick={() => void enregistrer()}>
              <Px t={envoi.kind === "envoi" ? "Envoi…" : "Enregistrer"} couleur="encre" />
            </button>
          </div>
          <p class="dl-p-mot" role="status">
            {envoi.kind === "fait" && "Ta main de défense est enregistrée."}
            {envoi.kind === "erreur" && (serveur ? envoi.message : "Le serveur n'a pas encore le duel : ta main de défense ne peut pas encore s'enregistrer.")}
            {refus === "bourse" && "Cette main dépasse la bourse."}
            {refus === "pas-a-moi" && "Une de ces cartes n'est plus dans ta garde-robe : change-la."}
            {refus === "emplacement" && "Une carte n'est pas à sa place : change-la."}
          </p>
        </div>
      </div>
      <div class="jeu-panneau jeu-n9 dl-p dl-historique">
        <h4 class="dl-p-tete">
          <IconeDuDuel url={ICONES.historique()} />
          <Px t="Historique" couleur="texte" />
          <BilanDeLaDefense serveur={serveur} classe="dl-p-droite" />
        </h4>
        {serveur && serveur.defenses.length > 0 ? (
          <ul class="dl-historique-liste">
            {serveur.defenses.map((l, i) => (
              <li key={i} class={`dl-h-${l.issue}`}>
                <span class="dl-h-nom">{l.nom ?? "Un Gaulois"}</span>
                <span class="dl-h-date">{new Date(l.le).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })}</span>
                {l.issue === "repousse" ? <Mot t="Repoussé" {...VERT} /> : l.issue === "battu" ? <Mot t="T'a battu" {...ROUGE} /> : <Px t="Égalité" couleur="doux" />}
              </li>
            ))}
          </ul>
        ) : (
          <p class="dl-p-mot">{serveur ? "Personne ne t'a encore défié." : "L'historique paraîtra quand le serveur aura le duel."}</p>
        )}
      </div>
      {tiroir !== null && (
        <FenetreDuBooster titre={`Changer : ${NOMS_DES_EMPLACEMENTS[EMPLACEMENTS_DE_LA_MAIN[tiroir]!]}`} etape="choix" occupe={false} onFermer={() => setTiroir(null)} testid="duel-tiroir">
          <Recueil
            m={m}
            aMoi={aMoi}
            choix={{
              emplacement: EMPLACEMENTS_DE_LA_MAIN[tiroir]!,
              actuelle: main[tiroir]!,
              reste: resteDeLaBourse(main, tiroir, m.prix, m.P.BOURSE),
              onPrendre: (id) => {
                const x = [...main];
                x[tiroir] = id;
                setMain(x);
                setTiroir(null);
                setEnvoi({ kind: "rien" });
                SON.enfile();
              },
            }}
          />
        </FenetreDuBooster>
      )}
    </section>
  );
}
