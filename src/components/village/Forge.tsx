import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { AUTH_ENABLED, ServerError, basePath, call } from "../../lib/compte/api";
import { clicSurBoutonArme, desarmerALaPerte } from "../../lib/compte/discord-etat";
import { errorMessage } from "../../lib/compte/errors";
import { RETOUR_VILLAGE_KEY, changerObjet, tenueDuServeur, vignetteDeLObjet, type Tenue } from "../../lib/gaulois";
import { sonDeLaGravure } from "../../lib/jeu/sons-de-la-forge";
import { ADRESSE_BOUTIQUE } from "../../lib/village/boutique-rayons";
import { PLAQUE_GRANDE } from "../../lib/village/plaque";
import type { MaForge, ObjetGravable, PartieGravable } from "../../lib/village/contrat";
import {
  PARTIES_MONTREES,
  PLAQUES_CHANGEES,
  cleDeLObjet,
  etatDuBouton,
  ficheDeLObjet,
  heureDeLaPartie,
  lignesDeLaPlaque,
  motsDeLaPlaque,
  nomDeLObjet,
  objetChoisi,
  partieChoisie,
  phraseDesPlaquesVues,
  rangerLesObjets,
} from "../../lib/village/ecran-forge";
import { stateres } from "../../lib/village/ecran-boutique";
import { cleDeLObjet as fondDeLObjet } from "../../lib/village/fonds-objets";
import { MESSAGES_DE_LA_FORGE, lireMaForge, messageDeLaForge } from "../../lib/village/forge";
import { CodeLogin, DiscordButton, Loading, Problem, codeLoginShown, useMe } from "../compte/common";
import { Etiquette, Icone, Px } from "../jeu/Pixels";
import { MarqueDeRarete, PetitePlaque, Pixels } from "./BoutiquePixels";
import { BoutonDuJeu, PrixDuJeu, Ruban, SousTitre } from "./BoutiqueDuJeu";
import { useDecorDuGaulois } from "./Bannieres";
import { ApercuGaulois } from "./Cases";
import { DessinSurFond } from "./DessinSurFond";
import { Fusion } from "./Fusion";
import { BoutonDesBoosters, CompteDuBooster, FenetreDuBooster, RefusDuBooster, ResteEnPixels } from "./KitDesBoosters";

/**
 * La forge, partie « La forge » de « Mon Gaulois » (`#forge`), habillée avec le kit du jeu le 21 novembre 2026 (feuille
 * `20-jeu-pass-forge.css`, tout sous `.forge-jeu`). Deux ateliers, au choix en haut : « Fondre » (`Fusion.tsx`, demande du
 * pilote du 16 novembre 2026 : trois objets d'une rareté en donnent un de la suivante, dans le moule à la forme de l'objet
 * reçu), ouvert d'abord, et « Graver », la forge aux souvenirs (idée du pilote, 14 novembre 2026 : « On paie des statères
 * pour graver une vraie partie sur son épée »). Le membre choisit un de ses objets, puis une de ses parties qui ont rapporté
 * des points au clan, voit la plaque avant de payer, confirme, et la plaque est gravée. Effacer une plaque est gratuit, mais
 * ne se rattrape pas : à part, sous un filet, au second clic.
 *
 * Le serveur décide de tout (`get_ma_forge`, `graver_objet`, `effacer_gravure`) : le prix, le solde, les parties, les
 * objets et le texte de chaque plaque viennent de lui. L'écran ne montre jamais l'identifiant d'une partie.
 */

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

const refusDe = (e: unknown): string => {
  const code = e instanceof ServerError ? e.code : "network";
  return messageDeLaForge(code) ?? errorMessage(code);
};

/**
 * La grande plaque dorée, son texte écrit par-dessus, une ligne par fait. `texte` nul : la plaque est vierge. Le dessin est
 * décoratif ; le texte est du vrai texte, lisible et sélectionnable.
 */
function GrandePlaque({ texte, legende, echelle = 8, testid }: { texte: string | null; legende?: string | null; echelle?: number; testid?: string }) {
  return (
    <figure class="forge-plaque" data-vierge={texte ? undefined : ""} data-testid={testid}>
      <div class="forge-plaque-cadre" style={{ "--forge-case": `${echelle}px` }}>
        <Pixels largeur={PLAQUE_GRANDE.largeur} hauteur={PLAQUE_GRANDE.hauteur} cases={PLAQUE_GRANDE.cases} echelle={echelle} class="forge-plaque-dessin" />
        <p class="forge-plaque-texte" data-testid={testid ? `${testid}-texte` : undefined}>
          {texte ? (
            lignesDeLaPlaque(texte).map((ligne, i) => (
              <span key={i}>
                {ligne}{" "}
              </span>
            ))
          ) : (
            <span class="sr-only">Plaque vierge</span>
          )}
        </p>
      </div>
      {legende && <figcaption class="forge-plaque-legende">{legende}</figcaption>}
    </figure>
  );
}

/** La case d'un objet de la forge : la même qu'au vestiaire, avec « porté » et la petite plaque s'il est gravé. */
function CaseDeLaForge({ objet, onChoisir }: { objet: ObjetGravable; onChoisir: () => void }) {
  const fiche = ficheDeLObjet(objet);
  const vignette = vignetteDeLObjet(objet.emplacement, objet.objet);
  const plaque = objet.gravure?.texte ?? null;
  return (
    <button type="button" class="case forge-case" data-rarete={fiche?.rarete ?? "aucune"} data-cle={cleDeLObjet(objet)} data-grave={plaque ? "" : undefined} title={plaque ? motsDeLaPlaque(plaque) : undefined} onClick={onChoisir} data-testid="forge-objet">
      <span class="case-image" data-fond={vignette ? "" : undefined}>{vignette && <DessinSurFond dessin={vignette} fond={fondDeLObjet(objet.emplacement, objet.objet)} rarete={fiche?.rarete ?? null} class="case-dessin" />}</span>
      <span class="case-nom">{nomDeLObjet(objet)}</span>
      {fiche?.rarete && <MarqueDeRarete rarete={fiche.rarete} />}
      {objet.porte && (
        <span class="case-marque">
          <span class="sr-only">, </span>porté
        </span>
      )}
      {plaque && (
        <>
          <PetitePlaque />
          <span class="sr-only">. {motsDeLaPlaque(plaque)}</span>
        </>
      )}
    </button>
  );
}

/** Ce que rend une gravure : la forge à jour, ou les mots du refus. */
type Issue = { ok: true; forge: MaForge } | { ok: false; message: string };

/**
 * La confirmation, dans une fenêtre du jeu : la plaque, l'objet, le prix et ce qu'il restera, puis la demande au serveur.
 * Après la gravure, la plaque gravée, trois coups de ciseau et le solde. Après un refus, les chiffres de l'ouverture ne
 * valent plus : il ne reste que les mots du refus et « Fermer ».
 */
function DialogueGravure({ objet, partie, prix, solde, graver, onFermer }: { objet: ObjetGravable; partie: PartieGravable; prix: number; solde: number; graver: () => Promise<Issue>; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "fait">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Ce que la fenêtre montre est ce qu'elle a vu en s'ouvrant : rien ne bouge quand la forge se relit derrière.
  const [depart] = useState({ solde, texte: partie.texte, ancienne: objet.gravure?.texte ?? null, nom: nomDeLObjet(objet) });
  const occupe = etape === "envoi";
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    const issue = await graver();
    if (issue.ok) {
      setReste(issue.forge.solde);
      setEtape("fait");
      sonDeLaGravure();
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const titre = etape === "fait" ? "C'est gravé" : refus ? "Gravure impossible" : "Graver cette plaque ?";
  return (
    <FenetreDuBooster titre={titre} etape={etape === "fait" ? "fait" : refus ? "refus" : "confirmer"} occupe={occupe} onFermer={onFermer} testid="forge-dialogue">
      <div class="fj-fenetre" data-etape={etape === "fait" ? "fait" : "confirmer"}>
        <GrandePlaque texte={depart.texte} legende={depart.nom} echelle={6} testid="forge-dialogue-plaque" />
        {etape === "fait" ? (
          <>
            {reste !== null && <ResteEnPixels solde={reste} testid="forge-reste" />}
            <div class="bst-actions">
              <BoutonDesBoosters t="Fermer" or onClick={onFermer} testid="forge-fermer" />
            </div>
          </>
        ) : (
          <>
            {!refus && depart.ancienne && (
              <p class="bst-mot" data-testid="forge-remplace">
                Elle remplace la plaque « {depart.ancienne} ».
              </p>
            )}
            {!refus && <CompteDuBooster prix={prix} solde={depart.solde} />}
            <RefusDuBooster message={refus} />
            <div class="bst-actions">
              {!refus && <BoutonDesBoosters t={occupe ? "Gravure" : "Graver"} dit={occupe ? "Gravure en cours" : "Graver"} or disabled={occupe} onClick={() => void envoyer()} testid="forge-confirmer" />}
              <BoutonDesBoosters t={refus ? "Fermer" : "Annuler"} disabled={occupe} onClick={onFermer} testid="forge-annuler" />
            </div>
          </>
        )}
      </div>
    </FenetreDuBooster>
  );
}

/**
 * « Effacer la plaque » : au second clic seulement, avec ce qui sera perdu écrit dessous. Le second clic d'un double clic
 * ne confirme pas ; Échap, un clic ailleurs ou le focus qui part désarment (comme les autres boutons d'effacement du site).
 */
function EffacerLaPlaque({ occupe, onConfirmer }: { occupe: boolean; onConfirmer: () => void }) {
  const [arme, setArme] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!arme) return;
    const ailleurs = (e: PointerEvent) => {
      if (!bouton.current?.contains(e.target as Node)) setArme(false);
    };
    document.addEventListener("pointerdown", ailleurs);
    return () => document.removeEventListener("pointerdown", ailleurs);
  }, [arme]);
  // Sans « … » : l'écriture en pixels ne l'a pas.
  const mots = occupe ? "Effacement" : arme ? "Confirmer : effacer la plaque" : "Effacer la plaque";
  const dit = occupe ? "Effacement en cours" : mots;
  return (
    <div class="forge-effacer fj-effacer">
      <button
        ref={bouton}
        type="button"
        class="jeu-btn jeu-btn-bleu jeu-n9 forge-effacer-bouton"
        data-arme={arme ? "" : undefined}
        disabled={occupe}
        aria-describedby={arme ? "forge-effacer-note" : undefined}
        data-testid="forge-effacer"
        onClick={(e) => {
          const suite = clicSurBoutonArme(arme, e.detail);
          if (suite === "armer") setArme(true);
          if (suite !== "confirmer") return;
          setArme(false);
          onConfirmer();
        }}
        onBlur={(e) => {
          if (desarmerALaPerte(e.relatedTarget)) setArme(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !arme) return;
          // Échap désarme le bouton, sans fermer la fenêtre de la forge.
          e.preventDefault();
          e.stopPropagation();
          setArme(false);
        }}
      >
        <Px t={mots} couleur="creme" relief="cerne" plie dit={dit} />
      </button>
      {arme && (
        <p id="forge-effacer-note" class="forge-effacer-note" data-testid="forge-effacer-note">
          La plaque sera perdue, et ses statères ne reviennent pas.
        </p>
      )}
    </div>
  );
}

/** Un message de la forge fermée, et où aller. */
function Ferme({ testid, children }: { testid: string; children: ComponentChildren }) {
  return (
    <p class="forge-phrase forge-ferme fj-ferme jeu-bulle jeu-n9" data-testid={testid}>
      {children}
    </p>
  );
}

type Lecture = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "prete"; forge: MaForge };

/** L'atelier, pour un site dont la connexion est ouverte. */
function Atelier() {
  const { me, refresh } = useMe();
  const racine = useRef<HTMLDivElement>(null);
  const [lecture, setLecture] = useState<Lecture>({ kind: "attente" });
  const [cle, setCle] = useState<string | null>(null);
  const [partie, setPartie] = useState<string | null>(null);
  const [toutes, setToutes] = useState(false);
  // L'atelier ouvert : la fusion d'abord. Un serveur qui ne la connaît pas encore ne montre que la gravure.
  const [atelier, setAtelier] = useState<"fusion" | "gravure">("fusion");
  // Ce que la confirmation a vu en s'ouvrant : l'objet, la partie et le prix. Elle reste ouverte après la gravure.
  const [dialogue, setDialogue] = useState<{ prix: number; objet: ObjetGravable; partie: PartieGravable } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState("");
  const etabli = useRef<HTMLHeadingElement>(null);
  const quitte = useRef<string | null>(null);

  const lire = async (discret: boolean) => {
    if (!discret) setLecture({ kind: "lecture" });
    try {
      const forge = lireMaForge(await call<unknown>("get_ma_forge"));
      if (forge) setLecture({ kind: "prete", forge });
      else if (!discret) setLecture({ kind: "erreur", message: ILLISIBLE });
    } catch (e) {
      // Une relecture discrète qui échoue garde la forge affichée : le serveur refusera ce qui ne vaut plus.
      if (!discret) setLecture({ kind: "erreur", message: refusDe(e) });
    }
  };

  // La forge se lit quand sa partie s'ouvre, et se relit à chaque retour : la bourse, la tenue et l'inventaire ont pu
  // changer au vestiaire ou à la boutique (les parties voisines).
  const connecte = me?.signed_in === true;
  useEffect(() => {
    if (connecte) void lire(lecture.kind === "prete");
  }, [connecte]);

  // Le Gaulois à sa forge (17 novembre 2026) : sa tenue enregistrée, devant la bannière qu'il montre sur /gaulois, comme
  // au vestiaire. De l'habillage : sans réponse, la forge reste comme avant, sans lui.
  const decor = useDecorDuGaulois(connecte);
  const [tenue, setTenue] = useState<Tenue | null>(null);
  useEffect(() => {
    if (!connecte) return;
    void call<unknown>("get_mon_gaulois").then(
      (reponse) => setTenue(tenueDuServeur(reponse)),
      () => undefined,
    );
    const change = (e: Event): void => {
      const nouvelle = (e as CustomEvent<{ tenue?: Tenue }>).detail?.tenue;
      if (nouvelle) setTenue(nouvelle);
    };
    window.addEventListener("gal:gaulois-enregistre", change);
    return () => window.removeEventListener("gal:gaulois-enregistre", change);
  }, [connecte]);

  // Le focus suit le parcours : au titre de l'établi quand un objet est choisi, à la case quittée quand on en change.
  const avant = useRef(cle);
  useEffect(() => {
    if (avant.current === cle) return;
    avant.current = cle;
    if (cle) etabli.current?.focus();
    else if (quitte.current) racine.current?.querySelector<HTMLElement>(`[data-cle="${CSS.escape(quitte.current)}"]`)?.focus();
  }, [cle]);

  const choisir = (suite: string | null) => {
    quitte.current = cle;
    setCle(suite);
    setPartie(null);
    setToutes(false);
    setProbleme(null);
  };

  const graver = async (objet: ObjetGravable, choisie: PartieGravable, prix: number): Promise<Issue> => {
    try {
      const forge = lireMaForge(await call<unknown>("graver_objet", { p_emplacement: objet.emplacement, p_objet: objet.objet, p_partie: choisie.partie, p_prix_vu: prix }));
      if (!forge) return { ok: false, message: ILLISIBLE };
      setLecture({ kind: "prete", forge });
      setPartie(null);
      setAnnonce(`${nomDeLObjet(objet)} est gravé : ${choisie.texte}. Il vous reste ${stateres(forge.solde)}.`);
      window.dispatchEvent(new CustomEvent(PLAQUES_CHANGEES));
      return { ok: true, forge };
    } catch (e) {
      // Après un refus, la forge est relue : le prix et le solde montrés sont ceux du serveur.
      const message = refusDe(e);
      await lire(true);
      return { ok: false, message };
    }
  };

  const effacer = async (objet: ObjetGravable) => {
    setOccupe(true);
    setProbleme(null);
    try {
      const forge = lireMaForge(await call<unknown>("effacer_gravure", { p_emplacement: objet.emplacement, p_objet: objet.objet }));
      if (!forge) throw new ServerError("network");
      setLecture({ kind: "prete", forge });
      setAnnonce(`La plaque de ${nomDeLObjet(objet)} est effacée.`);
      window.dispatchEvent(new CustomEvent(PLAQUES_CHANGEES));
    } catch (e) {
      setProbleme(refusDe(e));
      await lire(true);
    } finally {
      setOccupe(false);
      // Le bouton d'effacement a pu disparaître avec la plaque : le focus revient à l'établi.
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body || document.activeElement === null) etabli.current?.focus({ preventScroll: true });
      });
    }
  };

  // La gravure dans un panneau du jeu, comme la fusion : son ruban pour titre.
  const enPanneau = (contenu: ComponentChildren): ComponentChildren => (
    <section class="forge-gravure fj-panneau jeu-panneau jeu-n9" aria-labelledby="forge-gravure-titre" data-testid="forge-gravure">
      <Ruban t="La gravure" bleu id="forge-gravure-titre" />
      {contenu}
    </section>
  );

  let corps: ComponentChildren;
  if (me === null) corps = <Loading label="Lecture de votre compte…" />;
  else if (!me.signed_in) {
    corps = (
      <div class="forge-porte fj-porte jeu-panneau jeu-n9" data-testid="forge-porte">
        <GrandePlaque texte={null} echelle={6} />
        <p class="forge-phrase">Connectez-vous pour graver vos parties sur vos objets.</p>
        <div>
          <DiscordButton
            returnPath="/compte"
            avant={() => {
              try {
                sessionStorage.setItem(RETOUR_VILLAGE_KEY, String(Date.now()));
              } catch {
                // Stockage refusé : la connexion se fait quand même, le joueur revient au village par le menu.
              }
            }}
          />
        </div>
        {codeLoginShown() && <CodeLogin connecte={() => void refresh()} />}
      </div>
    );
  } else if (lecture.kind === "attente" || lecture.kind === "lecture") corps = <Loading label="Lecture de la forge…" />;
  else if (lecture.kind === "erreur") corps = <Problem message={lecture.message} onRetry={() => void lire(false)} />;
  else {
    const forge = lecture.forge;
    const objet = objetChoisi(forge, cle);
    const choisie = partieChoisie(forge, partie);
    const tete = (
      <div class="forge-tete fj-tete" data-testid="forge-tete">
        <p class="fj-compte" data-testid="forge-solde">
          <Px t="Votre bourse" couleur="doux" dit="Votre bourse :" />
          <PrixDuJeu valeur={forge.solde} />
        </p>
        <p class="fj-compte" data-testid="forge-prix">
          <Px t="Une gravure" couleur="doux" dit="Une gravure :" />
          <PrixDuJeu valeur={forge.prix} />
        </p>
      </div>
    );
    const ateliers = forge.fusion && (
      <div class="forge-ateliers fj-ateliers" role="group" aria-label="Atelier de la forge" data-testid="forge-ateliers">
        <button type="button" class={`jeu-btn ${atelier === "fusion" ? "" : "jeu-btn-bleu"} jeu-n9`} aria-pressed={atelier === "fusion"} onClick={() => setAtelier("fusion")} data-testid="forge-atelier-fusion">
          <Px t="Fondre" couleur={atelier === "fusion" ? "encre" : "creme"} relief={atelier === "fusion" ? "plat" : "cerne"} dit="Fondre" />
        </button>
        <button type="button" class={`jeu-btn ${atelier === "gravure" ? "" : "jeu-btn-bleu"} jeu-n9`} aria-pressed={atelier === "gravure"} onClick={() => setAtelier("gravure")} data-testid="forge-atelier-gravure">
          <Px t="Graver" couleur={atelier === "gravure" ? "encre" : "creme"} relief={atelier === "gravure" ? "plat" : "cerne"} dit="Graver" />
        </button>
      </div>
    );
    if (!forge.peut_graver) {
      corps =
        me.status === "validated" ? (
          <Ferme testid="forge-sans-gaulois">
            La forge grave les objets de votre Gaulois.{" "}
            <a class="forge-lien" href="#gaulois">
              Créez votre Gaulois
            </a>
          </Ferme>
        ) : (
          <Ferme testid="forge-attente">
            {MESSAGES_DE_LA_FORGE.not_validated}{" "}
            <a class="forge-lien" href={`${basePath()}/compte`}>
              Voir mon compte
            </a>
          </Ferme>
        );
    } else if (forge.fusion && atelier === "fusion") {
      corps = (
        <>
          {ateliers}
          <Fusion fusion={forge.fusion} onForge={(suite) => setLecture({ kind: "prete", forge: suite })} onRelire={() => lire(true)} />
        </>
      );
    } else if (!objet) {
      const objets = rangerLesObjets(forge.objets);
      corps = (
        <>
          {ateliers}
          {enPanneau(
            <>
              {tete}
              <SousTitre t="Choisissez un objet" id="forge-objets" />
              {objets.length > 0 ? (
                <div class="cases forge-cases" role="group" aria-labelledby="forge-objets" data-testid="forge-objets">
                  {objets.map((o) => (
                    <CaseDeLaForge key={cleDeLObjet(o)} objet={o} onChoisir={() => choisir(cleDeLObjet(o))} />
                  ))}
                </div>
              ) : (
                <p class="forge-mot" data-testid="forge-sans-objet">
                  Seuls les objets à rareté se gravent :{" "}
                  <a class="forge-lien" href={`${basePath()}${ADRESSE_BOUTIQUE}`}>
                    la boutique
                  </a>{" "}
                  en vend.
                </p>
              )}
              <p class="fj-note" data-testid="forge-vues">
                {phraseDesPlaquesVues(forge.plaques_vues)}
              </p>
            </>,
          )}
        </>
      );
    } else {
      const bouton = etatDuBouton(forge, objet, choisie);
      // Sans aucune partie, la phrase de la liste dit déjà ce qui manque : le bouton ne le redit pas.
      const raison = forge.parties.length === 0 && forge.solde >= forge.prix ? null : bouton.raison;
      const parties = toutes ? forge.parties : forge.parties.slice(0, PARTIES_MONTREES);
      const montree = choisie?.texte ?? objet.gravure?.texte ?? null;
      const legende = choisie ? (objet.gravure ? "Aperçu de la nouvelle plaque" : "Aperçu de la plaque") : objet.gravure ? "Plaque gravée" : null;
      const nom = nomDeLObjet(objet);
      corps = (
        <>
          {ateliers}
          {enPanneau(
            <>
              {tete}
              <div class="forge-etabli fj-etabli" data-testid="forge-etabli">
                <div class="forge-etabli-tete fj-etabli-tete">
                  <h4 ref={etabli} tabIndex={-1} class="forge-objet-nom fj-objet-nom" data-testid="forge-objet-nom">
                    <Px t={nom} plie dit={nom} />
                    {objet.porte && <Etiquette t="Porté" ton="bleu" dit=" (porté)" />}
                  </h4>
                  <BoutonDuJeu t="Changer d'objet" bleu onClick={() => choisir(null)} testid="forge-changer" classe="fj-petit" />
                </div>
                <GrandePlaque texte={montree} legende={legende} testid="forge-plaque" />
              </div>
              <fieldset class="forge-parties fj-parties" data-testid="forge-parties">
                <legend class="fj-legende">
                  <Px t="Choisissez une partie" couleur="doux" dit="Choisissez une partie" />
                </legend>
                {forge.parties.length === 0 ? (
                  <p class="forge-mot" data-testid="forge-sans-partie">
                    Vos parties qui rapportent des points au clan viendront ici, prêtes à graver.
                  </p>
                ) : (
                  <>
                    <ul>
                      {parties.map((p) => {
                        const heure = heureDeLaPartie(p.debut);
                        return (
                          <li key={p.partie}>
                            <label class="forge-partie fj-partie">
                              <input type="radio" name="forge-partie" checked={partie === p.partie} onChange={() => setPartie(p.partie)} />
                              <span class="forge-partie-texte">{p.texte}</span>
                              {heure && (
                                <span class="forge-partie-heure tnum">
                                  <span class="sr-only">, partie commencée à </span>
                                  {heure}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    {/* Un mot court, qui tient sur un téléphone de 360 px ; le nom entier est dit aux lecteurs d'écran. */}
                    {!toutes && forge.parties.length > PARTIES_MONTREES && <BoutonDuJeu t="Parties plus anciennes" dit="Voir les parties plus anciennes" bleu onClick={() => setToutes(true)} testid="forge-plus" classe="forge-plus" />}
                  </>
                )}
              </fieldset>
              <div class="forge-action fj-action">
                <button type="button" class="jeu-btn jeu-n9" disabled={bouton.raison !== null || occupe} aria-describedby={raison ? "forge-raison" : undefined} onClick={() => choisie && setDialogue({ prix: forge.prix, objet, partie: choisie })} data-testid="forge-graver">
                  <Icone nom="forge" classe="fj-bouton-icone" />
                  <Px t={bouton.libelle} couleur="encre" plie dit={bouton.libelle} />
                </button>
                {raison && (
                  <p id="forge-raison" class="forge-raison fj-raison" data-testid="forge-raison">
                    {raison}
                  </p>
                )}
              </div>
              <Problem message={probleme} />
              {objet.gravure && (
                // Effacer ne se rattrape pas : à part, sous un filet, au second clic.
                <EffacerLaPlaque key={cleDeLObjet(objet)} occupe={occupe} onConfirmer={() => void effacer(objet)} />
              )}
            </>,
          )}
        </>
      );
    }
  }

  const fermerLeDialogue = () => {
    setDialogue(null);
    // Le bouton « Graver » s'est éteint après la gravure : le focus revient à l'établi, où se lit la plaque gravée.
    window.requestAnimationFrame(() => {
      const actif = document.activeElement;
      if (actif === null || actif === document.body || (actif instanceof HTMLButtonElement && actif.disabled)) etabli.current?.focus({ preventScroll: true });
    });
  };

  // Le Gaulois porte l'objet qu'on est en train de graver, pour le voir sur lui.
  const forgePrete = lecture.kind === "prete" && lecture.forge.peut_graver ? lecture.forge : null;
  const aLEtabli = forgePrete && !(forgePrete.fusion && atelier === "fusion") ? objetChoisi(forgePrete, cle) : null;
  const tenueMontree = tenue && forgePrete ? (aLEtabli ? changerObjet(tenue, aLEtabli.emplacement, aLEtabli.objet) : tenue) : null;

  return (
    <div ref={racine} class="forge-jeu" data-scene={tenueMontree ? "" : undefined} data-testid="forge">
      {/* Le ruban du titre n'est qu'un dessin : la partie a déjà son titre caché, « La forge » (VillageApp.tsx). */}
      <div class="fj-titre" aria-hidden="true">
        <span class="boutique-jeu-ruban">
          <span class="jeu-ruban jeu-n9">
            <Px t="La forge" couleur="creme" relief="ombre" muet />
          </span>
        </span>
      </div>
      <div class="fj-corps">
        {tenueMontree && (
          <div class="forge-scene fj-scene jeu-panneau jeu-n9" data-testid="forge-scene">
            <ApercuGaulois tenue={tenueMontree} decor={decor} />
          </div>
        )}
        <div class="forge-colonne fj-colonne">{corps}</div>
      </div>
      {dialogue && lecture.kind === "prete" && (
        <DialogueGravure objet={dialogue.objet} partie={dialogue.partie} prix={dialogue.prix} solde={lecture.forge.solde} graver={() => graver(dialogue.objet, dialogue.partie, dialogue.prix)} onFermer={fermerLeDialogue} />
      )}
      <p class="sr-only" role="status" data-testid="forge-annonce">
        {annonce}
      </p>
    </div>
  );
}

/**
 * La forge, partie de « Mon Gaulois » (`VillageApp.tsx`) depuis le retrait du monde du village (15 novembre 2026). Sans
 * connexion ouverte sur le site (`AUTH_ENABLED`), elle le dit : graver demande un compte.
 */
export default function AtelierDeLaForge() {
  if (AUTH_ENABLED) return <Atelier />;
  return (
    <div class="forge-jeu" data-testid="forge">
      <p class="forge-phrase fj-ferme jeu-bulle jeu-n9">La forge grave les parties des membres : la connexion au site n'est pas ouverte.</p>
    </div>
  );
}
