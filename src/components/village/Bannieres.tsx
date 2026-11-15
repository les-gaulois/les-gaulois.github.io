import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { ORDRE_RARETES, RARETES, type Rarete, type Tenue } from "../../lib/gaulois";
import type { Banniere, EtatDeLaBanniere, FamilleDeBanniere } from "../../lib/village/bannieres";
import { adresseDansLaBoutique } from "../../lib/village/boutique-rayons";
import type { MesBannieres } from "../../lib/village/contrat";
import { ANCRE_BANNIERES, BANNIERE_HAUTEUR, BANNIERE_LARGEUR, apresLAchat, banniereDOuverture, demandeLesBannieres, idsDesBannieres, messageDuRefusDAchat, raisonDeLaBanniere, sansBanniere, surCombien } from "../../lib/village/ecran-bannieres";
import { manque, stateres } from "../../lib/village/ecran-boutique";
import type { Familier } from "../../lib/village/familiers";
import { Problem, Success, messageOf } from "../compte/common";
import { Compte, Dialogue, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix, peindre } from "./BoutiquePixels";

/**
 * Les bannières du Gaulois à l'écran (15 novembre 2026, demande du pilote : « un lot de bannières », « achetables par
 * statères », « il pourra choisir la bannière qui s'affichera en faisant /gaulois ») : la section « Les bannières » de
 * « La boutique » (`SectionDesBannieres`) et le choix de la bannière de /gaulois dans « Mon Gaulois » (`MaBanniere`).
 * Le serveur décide de tout par `get_mes_bannieres`, `acheter_banniere` et `choisir_banniere` ; l'écran ne montre que ce
 * qu'il a reçu.
 *
 * La liste et les dessins des bannières pèsent lourd : `src/lib/village/bannieres.ts` n'est chargé qu'ici, par un
 * `import()`, quand l'un des deux écrans s'affiche. Rien d'autre de ce fichier ne l'importe, sauf ses types.
 */
type Lib = typeof import("../../lib/village/bannieres");

let chargement: Promise<Lib> | null = null;
/** Le code des bannières, chargé une seule fois pour la page ; un échec se retente à la lecture suivante. */
function charger(): Promise<Lib> {
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

  const choisir = useCallback(async (id: string | null): Promise<Issue<string | null>> => {
    const lib = await charger().catch(() => null);
    if (!lib) return { ok: false, message: ILLISIBLE };
    try {
      const choix = lib.lireChoixBanniere(await call<unknown>("choisir_banniere", { p_banniere: id }));
      if (!choix) return { ok: false, message: ILLISIBLE };
      setEtat((e) => (e.kind === "pret" ? { ...e, mes: { ...e.mes, porte: choix.porte } } : e));
      return { ok: true, valeur: choix.porte };
    } catch (e) {
      return { ok: false, message: e instanceof ServerError ? lib.messageDesBannieres(e.code) : messageOf(e) };
    }
  }, []);

  return { etat, lire, acheter, choisir };
}

/*
 * Les vignettes se dessinent une à une, chacune dans son propre tour de la boucle du navigateur, et seulement quand elles
 * approchent de l'écran : peindre quarante bannières d'un coup figerait la page une bonne demi-seconde.
 */
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

/** La bannière seule, cadre de sa rareté compris, décorative : son nom est toujours écrit à côté. */
function Vignette({ lib, id }: { lib: Lib; id: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const [peinte, setPeinte] = useState(false);
  useEffect(() => {
    const element = toile.current;
    if (!element) return;
    let vivante = true;
    const dessiner = () =>
      plusTard(() => {
        const vignette = vivante ? lib.vignetteDeLaBanniere(id) : null;
        if (!vignette) return;
        peindre(element, vignette.largeur, vignette.hauteur, vignette.cases);
        setPeinte(true);
      });
    if (typeof IntersectionObserver !== "function") {
      dessiner();
      return () => {
        vivante = false;
      };
    }
    const guetteur = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((entree) => entree.isIntersecting)) return;
        guetteur.disconnect();
        dessiner();
      },
      { rootMargin: "400px" },
    );
    guetteur.observe(element);
    return () => {
      vivante = false;
      guetteur.disconnect();
    };
  }, [lib, id]);
  return <canvas ref={toile} width={BANNIERE_LARGEUR} height={BANNIERE_HAUTEUR} class="pixels banniere-vignette" data-peinte={peinte ? "" : undefined} aria-hidden="true" />;
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

/** Ce qu'une bannière est pour ce compte, en deux mots : rien pour une bannière à acheter (son prix le dit). */
function MotsDeLEtat({ etat }: { etat: EtatDeLaBanniere }) {
  if (etat === "a-acheter") return null;
  return (
    <span class="banniere-etat" data-etat={etat}>
      {etat === "montree" ? "Sur /gaulois" : "À vous"}
    </span>
  );
}

/**
 * Une case de la vitrine : la bannière seule, son nom, sa rareté, puis son prix, « À vous » ou « Sur /gaulois ». Un bouton :
 * il la montre en grand, avec son Gaulois devant.
 */
function CaseDeBanniere({ lib, banniere, etat, prix, choisie, onClick }: { lib: Lib; banniere: Banniere; etat: EtatDeLaBanniere; prix: number; choisie: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" class="banniere-case" data-rarete={banniere.rarete} data-etat={etat} aria-pressed={choisie} onClick={onClick} data-testid="banniere-case" data-banniere={banniere.id}>
        <span class="banniere-case-image">
          <Vignette lib={lib} id={banniere.id} />
        </span>
        <span class="banniere-case-nom">{banniere.nom}</span>
        <MarqueDeRarete rarete={banniere.rarete} />
        <span class="sr-only">, </span>
        {etat === "a-acheter" ? <Prix montant={prix} class="case-prix" /> : <MotsDeLEtat etat={etat} />}
      </button>
    </li>
  );
}

/** « Toutes les familles », dans le filtre. */
const TOUTES = "toutes";
type ChoixDeFamille = FamilleDeBanniere | typeof TOUTES;

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
 * « Les bannières », sur « La boutique » : l'objet le plus cher de la boutique (le triple d'un objet de la même rareté).
 * En tête, la vitrine : la bannière choisie en grand, avec le Gaulois du membre devant, sa description, son prix, et de
 * quoi l'acheter ou la mettre sur /gaulois. Dessous, les quarante bannières, une famille à la fois (ou toutes), réduites à
 * une rareté si on le veut. `tenue` et `familier` : la tenue enregistrée et le familier montré. `solde` : le dernier que
 * le serveur a donné à la page ; `onSolde` le lui rend après un achat, `onRefus` après un refus (la bourse se relit).
 */
export function SectionDesBannieres({ tenue, familier, solde, onSolde, onRefus }: { tenue: Tenue; familier: Familier | null; solde: number | null; onSolde: (solde: number) => void; onRefus: () => void }) {
  const { etat, lire, acheter, choisir } = useBannieres();
  const [famille, setFamille] = useState<ChoixDeFamille | null>(null);
  const [rarete, setRarete] = useState<Rarete | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const racine = useRef<HTMLElement>(null);
  const vitrine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void lire();
  }, [lire]);

  // Arrivé par l'adresse des bannières (`#bannieres`, le lien de « Mon Gaulois ») : la page y descend une fois la section
  // dessinée, et de nouveau si le lien est suivi dans la page.
  const dessinee = etat.kind !== "lecture";
  useEffect(() => {
    if (!dessinee) return;
    const descendre = () => {
      if (demandeLesBannieres(location.hash)) racine.current?.scrollIntoView({ behavior: "instant", block: "start" });
    };
    descendre();
    window.addEventListener("hashchange", descendre);
    return () => window.removeEventListener("hashchange", descendre);
  }, [dessinee]);

  if (etat.kind !== "pret") {
    return (
      <section ref={racine} id={ANCRE_BANNIERES} class="bannieres" aria-labelledby="bannieres-titre" data-testid="bannieres" data-etat={etat.kind}>
        <h3 id="bannieres-titre" class="nom-champ bannieres-titre">
          Les bannières
        </h3>
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
  const possedees = idsDesBannieres(mes);
  const montree = lib.banniereParId(mes.porte);
  const vue = lib.banniereParId(choisie ?? banniereDOuverture(mes, lib.BANNIERES.map((b) => b.id)));
  // La famille ouverte à l'arrivée : celle de la bannière que la vitrine montre.
  const familleRetenue: ChoixDeFamille = famille ?? vue?.famille ?? lib.FAMILLES[0] ?? TOUTES;
  const filtreFamille = familleRetenue === TOUTES ? null : familleRetenue;
  const comptes = lib.comptesParRarete(filtreFamille);
  const rareteRetenue = rarete && comptes[rarete] > 0 ? rarete : null;
  const rangees = lib.rangerLesBannieres({ famille: filtreFamille, rarete: rareteRetenue }, possedees);
  const total = ORDRE_RARETES.reduce((somme, r) => somme + comptes[r], 0);
  const soldeConnu = solde ?? mes.solde;

  const voir = (id: string) => {
    setChoisie(id);
    setProbleme(null);
    setReussite(null);
    // La vitrine est au-dessus des cases : si elle n'est pas toute à l'écran, sous ce qui est collé en haut (l'en-tête, et
    // le Gaulois sur téléphone : la marge de défilement de la feuille de style), la page y revient.
    const cadre = vitrine.current;
    if (!cadre) return;
    const { top, bottom } = cadre.getBoundingClientRect();
    const marge = parseFloat(getComputedStyle(cadre).scrollMarginTop) || 0;
    if (top >= marge - 1 && bottom <= window.innerHeight) return;
    cadre.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("fx-off") ? "instant" : "smooth", block: "start" });
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

  const etatVu = vue ? lib.etatDeLaBanniere(vue.id, mes) : null;
  const prixVu = vue ? mes.prix[vue.rarete] : 0;
  const raison = vue && etatVu === "a-acheter" ? raisonDeLaBanniere(mes, soldeConnu, prixVu) : null;
  const aAcheter = fenetre ? lib.banniereParId(fenetre) : null;

  return (
    <section ref={racine} id={ANCRE_BANNIERES} class="bannieres" aria-labelledby="bannieres-titre" data-testid="bannieres" data-etat="pret">
      <div class="bannieres-tete">
        <h3 id="bannieres-titre" class="nom-champ bannieres-titre">
          Les bannières
        </h3>
        <p class="bannieres-compte" data-testid="bannieres-compte">
          <strong class="tnum">{possedees.size}</strong> sur {lib.BANNIERES.length} à vous
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

      {vue && etatVu && (
        <div ref={vitrine} class="banniere-vitrine" data-rarete={vue.rarete} data-testid="banniere-vitrine" data-banniere={vue.id} data-etat={etatVu}>
          <figure class="banniere-vue">
            <Scene lib={lib} banniere={vue} tenue={tenue} familier={familier} />
            <figcaption>Comme sur /gaulois, sans le logo du clan ni vos insignes.</figcaption>
          </figure>
          <div class="banniere-fiche">
            <p class="banniere-famille">{lib.FAMILLES_DES_BANNIERES[vue.famille]}</p>
            <h4 class="banniere-nom" data-testid="banniere-nom">
              {vue.nom}
            </h4>
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

      <div class="bannieres-filtres">
        <div class="vestiaire-filtre" role="group" aria-label="Montrer une famille" data-testid="bannieres-familles">
          {lib.FAMILLES.map((id) => (
            <button key={id} type="button" class="chip filtre" aria-pressed={familleRetenue === id} onClick={() => setFamille(id)} data-testid={`bannieres-famille-${id}`}>
              {lib.FAMILLES_DES_BANNIERES[id]}
            </button>
          ))}
          <button type="button" class="chip filtre" aria-pressed={familleRetenue === TOUTES} onClick={() => setFamille(TOUTES)} data-testid="bannieres-famille-toutes">
            Toutes
            <span class="filtre-nombre tnum">{lib.BANNIERES.length}</span>
            <span class="sr-only"> bannières</span>
          </button>
        </div>
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
      </div>

      {rangees.map((rangee) => (
        <section key={rangee.famille} class="bannieres-famille" aria-labelledby={`bannieres-famille-${rangee.famille}`} data-testid="bannieres-famille">
          {/* Une seule famille : son nom est déjà celui du choix retenu, juste au-dessus. */}
          <h4 id={`bannieres-famille-${rangee.famille}`} class={filtreFamille ? "sr-only" : "vestiaire-boutique"}>
            {rangee.nom} <span class="tnum bannieres-famille-compte">{surCombien(rangee.possedees, rangee.total)}</span>
            <span class="sr-only"> à vous</span>
          </h4>
          <ul class="banniere-cases">
            {rangee.bannieres.map((banniere) => (
              <CaseDeBanniere key={banniere.id} lib={lib} banniere={banniere} etat={lib.etatDeLaBanniere(banniere.id, mes)} prix={mes.prix[banniere.rarete]} choisie={vue?.id === banniere.id} onClick={() => voir(banniere.id)} />
            ))}
          </ul>
        </section>
      ))}

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
    </section>
  );
}

/**
 * « Ma bannière », dans « Mon Gaulois » : la bannière montrée sur /gaulois, à choisir parmi celles qu'on a, ou le décor de
 * son lieu. Le choix part tout de suite au serveur (`choisir_banniere`) : il ne passe pas par l'enregistrement de la
 * tenue. Sans bannière, une ligne mène aux bannières de « La boutique », sans charger leurs dessins. En panne, le
 * vestiaire reste. `actif` : l'onglet est ouvert ; au retour de la boutique, les bannières se relisent.
 */
export function MaBanniere({ actif }: { actif?: boolean | undefined }) {
  const { etat, lire, choisir } = useBannieres({ leger: true });
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);

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
  const miennes = mes.bannieres.flatMap((ligne) => lib.banniereParId(ligne.banniere) ?? []);
  const poser = async (id: string | null) => {
    if (occupe || id === (montree?.id ?? null)) return;
    setOccupe(true);
    setProbleme(null);
    setAnnonce(null);
    const issue = await choisir(id);
    if (issue.ok) setAnnonce(issue.valeur ? `« ${lib.banniereParId(issue.valeur)?.nom ?? "Cette bannière"} » est sur /gaulois.` : "Sur /gaulois, votre Gaulois retrouve le décor de son lieu.");
    else setProbleme(issue.message);
    setOccupe(false);
  };
  return (
    <details class="fold banniere-choix" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} data-testid="banniere-choix">
      <summary>
        <span id="banniere-choix-titre">Ma bannière sur /gaulois</span> <span class="info-discrete">{montree ? montree.nom : "le décor de mon lieu"}</span>
      </summary>
      {/* Les vignettes ne se dessinent qu'une fois le pli ouvert. */}
      {ouvert && (
        <div class="banniere-cases" role="group" aria-labelledby="banniere-choix-titre" aria-busy={occupe}>
          <button type="button" class="banniere-case" data-rarete="aucune" data-etat={montree ? "a-moi" : "montree"} aria-pressed={montree === null} onClick={() => void poser(null)} data-testid="banniere-choix-decor">
            <span class="banniere-case-image">
              <span class="banniere-lieu" aria-hidden="true" />
            </span>
            <span class="banniere-case-nom">Le décor de mon lieu</span>
          </button>
          {miennes.map((banniere) => (
            <button key={banniere.id} type="button" class="banniere-case" data-rarete={banniere.rarete} data-etat={montree?.id === banniere.id ? "montree" : "a-moi"} aria-pressed={montree?.id === banniere.id} onClick={() => void poser(banniere.id)} data-testid="banniere-choix-case" data-banniere={banniere.id}>
              <span class="banniere-case-image">
                <Vignette lib={lib} id={banniere.id} />
              </span>
              <span class="banniere-case-nom">{banniere.nom}</span>
              <MarqueDeRarete rarete={banniere.rarete} />
            </button>
          ))}
        </div>
      )}
      <Problem message={probleme} />
      <p class="sr-only" role="status" data-testid="banniere-annonce">
        {annonce}
      </p>
    </details>
  );
}
