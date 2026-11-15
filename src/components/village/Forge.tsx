import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { AUTH_ENABLED, ServerError, basePath, call } from "../../lib/compte/api";
import { clicSurBoutonArme, desarmerALaPerte } from "../../lib/compte/discord-etat";
import { errorMessage } from "../../lib/compte/errors";
import { RETOUR_VILLAGE_KEY, vignetteDeLObjet } from "../../lib/gaulois";
import { ADRESSE_BOUTIQUE } from "../../lib/village/boutique-rayons";
import { PLAQUE_GRANDE } from "../../lib/village/plaque";
import type { MaForge, ObjetGravable, PartieGravable } from "../../lib/village/contrat";
import { motStatere, nombre, stateres } from "../../lib/village/ecran-boutique";
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
import { MESSAGES_DE_LA_FORGE, lireMaForge, messageDeLaForge } from "../../lib/village/forge";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { CodeLogin, DiscordButton, Loading, Problem, codeLoginShown, useMe } from "../compte/common";
import { MarqueDeRarete, PetitePlaque, Piece, Pixels } from "./BoutiquePixels";

/**
 * La forge, onglet de la page « Mon Gaulois » : la forge aux souvenirs (idée du pilote, 14 novembre 2026 : « On paie des
 * statères pour graver une vraie partie sur son épée »). Le membre choisit un de ses objets, puis une de ses parties qui
 * ont rapporté des points au clan, voit la plaque avant de payer, confirme, et la plaque est gravée. Effacer une plaque
 * est gratuit, mais ne se rattrape pas : à part, sous un filet, au second clic.
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
      <span class="case-image">{vignette && <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelleEntiere(vignette.largeur, vignette.hauteur, 80, 3)} class="case-dessin" />}</span>
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
 * La confirmation, comme à la boutique : un vrai `<dialog>` modal qui dit la plaque, l'objet, le prix et ce qu'il restera,
 * puis demande au serveur. Après la gravure, la plaque gravée et le solde. Après un refus, les chiffres de l'ouverture ne
 * valent plus : il ne reste que les mots du refus et « Fermer ».
 */
function DialogueGravure({ objet, partie, prix, solde, graver, onFermer }: { objet: ObjetGravable; partie: PartieGravable; prix: number; solde: number; graver: () => Promise<Issue>; onFermer: () => void }) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const tete = useRef<HTMLHeadingElement>(null);
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "fait">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Ce que la fenêtre montre est ce qu'elle a vu en s'ouvrant : rien ne bouge quand la forge se relit derrière.
  const [depart] = useState({ solde, texte: partie.texte, ancienne: objet.gravure?.texte ?? null, nom: nomDeLObjet(objet) });
  const occupe = etape === "envoi";
  useEffect(() => {
    const d = fenetre.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => tete.current?.focus(), [etape === "fait", refus !== null]);
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    const issue = await graver();
    if (issue.ok) {
      setReste(issue.forge.solde);
      setEtape("fait");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const titre = etape === "fait" ? "C'est gravé" : refus ? "Gravure impossible" : `Graver pour ${stateres(prix)} ?`;
  return (
    <dialog
      ref={fenetre}
      class="boutique-dialogue forge-dialogue"
      aria-labelledby="forge-dialogue-titre"
      data-testid="forge-dialogue"
      data-etape={etape === "fait" ? "fait" : "confirmer"}
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) onFermer();
      }}
      onClick={(e) => {
        if (e.target === fenetre.current && !occupe) onFermer();
      }}
    >
      <div class="boutique-dialogue-corps">
        <h2 id="forge-dialogue-titre" ref={tete} tabIndex={-1} class="boutique-dialogue-titre">
          {titre}
        </h2>
        <GrandePlaque texte={depart.texte} legende={depart.nom} echelle={7} testid="forge-dialogue-plaque" />
        {etape === "fait" ? (
          <>
            {reste !== null && (
              <p class="boutique-dialogue-texte" data-testid="forge-reste">
                Il vous reste {stateres(reste)}.
              </p>
            )}
            <div class="boutique-dialogue-actions">
              <button type="button" class="btn btn-primary" onClick={onFermer} data-testid="forge-fermer">
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            {!refus && depart.ancienne && (
              <p class="boutique-dialogue-texte" data-testid="forge-remplace">
                Elle remplace la plaque « {depart.ancienne} ».
              </p>
            )}
            {!refus && (
              <dl class="boutique-compte">
                <div>
                  <dt>Prix</dt>
                  <dd>{stateres(prix)}</dd>
                </div>
                <div>
                  <dt>Votre bourse</dt>
                  <dd>{stateres(depart.solde)}</dd>
                </div>
                <div class="boutique-compte-reste">
                  <dt>Il vous restera</dt>
                  <dd data-testid="forge-restera">{stateres(depart.solde - prix)}</dd>
                </div>
              </dl>
            )}
            {refus && (
              <p class="form-problem" role="alert" data-testid="forge-refus">
                {refus}
              </p>
            )}
            <div class="boutique-dialogue-actions">
              {!refus && (
                <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void envoyer()} data-testid="forge-confirmer">
                  {occupe ? "Gravure…" : "Graver"}
                </button>
              )}
              <button type="button" class="btn btn-ghost" disabled={occupe} onClick={onFermer} data-testid="forge-annuler">
                {refus ? "Fermer" : "Annuler"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
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
  return (
    <div class="forge-effacer">
      <button
        ref={bouton}
        type="button"
        class="btn btn-ghost forge-effacer-bouton"
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
        {occupe ? "Effacement…" : arme ? "Confirmer : effacer la plaque" : "Effacer la plaque"}
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
    <p class="forge-phrase forge-ferme" data-testid={testid}>
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

  // La forge se lit quand sa fenêtre s'ouvre, et se relit à chaque retour : la bourse, la tenue et l'inventaire ont pu
  // changer au vestiaire ou à la boutique (les onglets voisins).
  const connecte = me?.signed_in === true;
  useEffect(() => {
    if (connecte) void lire(lecture.kind === "prete");
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

  let corps: ComponentChildren;
  if (me === null) corps = <Loading label="Lecture de votre compte…" />;
  else if (!me.signed_in) {
    corps = (
      <div class="forge-porte" data-testid="forge-porte">
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
      <div class="forge-tete" data-testid="forge-tete">
        <p class="forge-bourse" data-testid="forge-solde">
          <Piece taille={24} />
          <span class="forge-solde tnum">{nombre(forge.solde)}</span> {motStatere(forge.solde)}
        </p>
        <p class="forge-prix" data-testid="forge-prix">
          Une gravure : <strong>{stateres(forge.prix)}</strong>
        </p>
      </div>
    );
    if (!forge.peut_graver) {
      corps = (
        <>
          {me.status === "validated" ? (
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
          )}
        </>
      );
    } else if (!objet) {
      const objets = rangerLesObjets(forge.objets);
      corps = (
        <>
          {tete}
          <h3 id="forge-objets" class="forge-etape">
            Choisissez un objet
          </h3>
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
          <p class="info-discrete" data-testid="forge-vues">
            {phraseDesPlaquesVues(forge.plaques_vues)}
          </p>
        </>
      );
    } else {
      const bouton = etatDuBouton(forge, objet, choisie);
      // Sans aucune partie, la phrase de la liste dit déjà ce qui manque : le bouton ne le redit pas.
      const raison = forge.parties.length === 0 && forge.solde >= forge.prix ? null : bouton.raison;
      const parties = toutes ? forge.parties : forge.parties.slice(0, PARTIES_MONTREES);
      const montree = choisie?.texte ?? objet.gravure?.texte ?? null;
      const legende = choisie ? (objet.gravure ? "Aperçu de la nouvelle plaque" : "Aperçu de la plaque") : objet.gravure ? "Plaque gravée" : null;
      corps = (
        <>
          {tete}
          <div class="forge-etabli" data-testid="forge-etabli">
            <div class="forge-etabli-tete">
              <h3 ref={etabli} tabIndex={-1} class="forge-objet-nom" data-testid="forge-objet-nom">
                {nomDeLObjet(objet)}
                {objet.porte && <span class="forge-porte-mot"> (porté)</span>}
              </h3>
              <button type="button" class="forge-lien" onClick={() => choisir(null)} data-testid="forge-changer">
                Changer d'objet
              </button>
            </div>
            <GrandePlaque texte={montree} legende={legende} testid="forge-plaque" />
          </div>
          <fieldset class="forge-parties" data-testid="forge-parties">
            <legend class="forge-etape">Choisissez une partie</legend>
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
                        <label class="forge-partie">
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
                {!toutes && forge.parties.length > PARTIES_MONTREES && (
                  <button type="button" class="forge-lien forge-plus" onClick={() => setToutes(true)} data-testid="forge-plus">
                    Voir les parties plus anciennes
                  </button>
                )}
              </>
            )}
          </fieldset>
          <div class="forge-action">
            <button type="button" class="btn btn-primary" disabled={bouton.raison !== null || occupe} aria-describedby={raison ? "forge-raison" : undefined} onClick={() => choisie && setDialogue({ prix: forge.prix, objet, partie: choisie })} data-testid="forge-graver">
              {bouton.libelle}
            </button>
            {raison && (
              <p id="forge-raison" class="forge-raison" data-testid="forge-raison">
                {raison}
              </p>
            )}
          </div>
          <Problem message={probleme} />
          {objet.gravure && (
            // Effacer ne se rattrape pas : à part, sous un filet, au second clic.
            <EffacerLaPlaque key={cleDeLObjet(objet)} occupe={occupe} onConfirmer={() => void effacer(objet)} />
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

  return (
    <div ref={racine} class="forge" data-testid="forge">
      {corps}
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
 * La forge, onglet de la page « Mon Gaulois » (`VillageApp.tsx`) depuis le retrait du monde du village (15 novembre
 * 2026). Sans connexion ouverte sur le site (`AUTH_ENABLED`), elle le dit : graver demande un compte.
 */
export default function AtelierDeLaForge() {
  if (AUTH_ENABLED) return <Atelier />;
  return (
    <div class="forge" data-testid="forge">
      <p class="forge-phrase">La forge grave les parties des membres : la connexion au site n'est pas ouverte.</p>
    </div>
  );
}
