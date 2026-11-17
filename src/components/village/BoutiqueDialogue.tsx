import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { OBJETS, RARETES_DES_OBJETS, vignetteDeLObjet, type Objet, type RareteDObjet as Rarete, type Vignette } from "../../lib/gaulois";
import type { PochetteReponse, RefObjet } from "../../lib/village/contrat";
import { stateres } from "../../lib/village/ecran-boutique";
import { bandeDeLaPochette, type Rangee } from "../../lib/village/tambour";
import { MarqueDeRarete, Pixels, Prix } from "./BoutiquePixels";
import { DessinPochette } from "./Pochette";
import { feterLObjet } from "./Cases";
import { BoutonSon, Tambour, carillonSiVoulu, preparerLeSon, preparerLeSonSiVoulu, useSonDuTambour, type RangeeVue } from "./Tambour";

/** Ce que rend un achat : le résultat du serveur, ou les mots de son refus. */
export type Issue<T> = { ok: true; valeur: T } | { ok: false; message: string };

/**
 * Une fenêtre de confirmation : un vrai `<dialog>` ouvert en modal, qui garde le focus, se ferme par Échap ou par un clic
 * à côté, et rend le focus au bouton qui l'a ouverte. Pendant un envoi (`occupe`), elle ne se ferme pas. À chaque étape
 * (`etape`), le focus va au titre : un lecteur d'écran lit ce qui vient de changer.
 */
export function Dialogue({ titre, etape, occupe, onFermer, testid, children }: { titre: string; etape: string; occupe: boolean; onFermer: () => void; testid: string; children: ComponentChildren }) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const tete = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const d = fenetre.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => tete.current?.focus(), [etape]);
  return (
    <dialog
      ref={fenetre}
      class="boutique-dialogue"
      aria-labelledby={`${testid}-titre`}
      data-testid={testid}
      data-etape={etape}
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) onFermer();
      }}
      onClick={(e) => {
        if (e.target === fenetre.current && !occupe) onFermer();
      }}
    >
      <div class="boutique-dialogue-corps">
        <h2 id={`${testid}-titre`} ref={tete} tabIndex={-1} class="boutique-dialogue-titre">
          {titre}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

/** Une case montrée dans une fenêtre : la même que celles du vestiaire, sans être un bouton. */
export function CaseMontree({ objet, rarete, vignette }: { objet: Objet; rarete: Rarete; vignette: Vignette | null }) {
  const echelle = vignette ? Math.max(1, Math.min(3, Math.floor(80 / Math.max(vignette.largeur, vignette.hauteur)))) : 1;
  return (
    <div class="case case-montree" data-rarete={rarete}>
      <span class="case-image">{vignette && <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" />}</span>
      <span class="case-nom">{objet.nom}</span>
      <MarqueDeRarete rarete={rarete} />
    </div>
  );
}

/**
 * L'objet qu'on vient de recevoir (17 novembre 2026) : la même case, posée devant des rayons de la couleur de sa rareté,
 * avec la note du tambour pour sa rareté si le son n'est pas coupé. La même scène pour un achat à la boutique et pour un
 * palier du sentier ; les pochettes ont leur tambour, la fusion son moule. Les rayons tournent très lentement, et pas du
 * tout quand les animations sont coupées. Décoratifs : le nom et la rareté sont écrits dans la case.
 */
export function ObjetRecu({ objet, rarete, vignette, palier = false }: { objet: Objet; rarete: Rarete; vignette: Vignette | null; palier?: boolean }) {
  useEffect(() => carillonSiVoulu(RARETES_DES_OBJETS[rarete].rang), [rarete]);
  // Quand la fenêtre se ferme, le Gaulois de la page saute de joie : pour un objet épique ou plus, ou un palier du sentier.
  useEffect(() => () => feterLObjet(rarete, palier), [rarete, palier]);
  return (
    <div class="objet-recu" data-rarete={rarete} data-testid="objet-recu">
      <span class="objet-recu-rayons" aria-hidden="true" />
      <CaseMontree objet={objet} rarete={rarete} vignette={vignette} />
    </div>
  );
}

/**
 * La fenêtre ouvre-t-elle une pochette gagnée à la loterie du mardi, qui reste à ouvrir ? Posé par l'écran des pochettes
 * autour de chaque fenêtre d'ouverture ; faux partout ailleurs (un achat se paie toujours).
 */
export const PochetteGagneeIci = createContext(false);

/**
 * Le compte d'un achat : le prix, la bourse, ce qu'il restera. `auMoins` : la dépense peut rendre une part du prix (la
 * pochette des Gaulois uniques) ; ce qu'il restera est alors un minimum.
 */
export function Compte({ prix, solde, auMoins = false }: { prix: number; solde: number; auMoins?: boolean }) {
  // Une pochette gagnée à la loterie du mardi : le serveur ne retire rien, la fenêtre ne promet donc ni prix ni reste.
  if (useContext(PochetteGagneeIci)) {
    return (
      <dl class="boutique-compte">
        <div>
          <dt>Gagnée à la loterie</dt>
          <dd data-testid="boutique-gagnee">Rien à payer</dd>
        </div>
        <div>
          <dt>Votre bourse</dt>
          <dd>
            <Prix montant={solde} />
          </dd>
        </div>
      </dl>
    );
  }
  return (
    <dl class="boutique-compte">
      <div>
        <dt>Prix</dt>
        <dd>
          <Prix montant={prix} />
        </dd>
      </div>
      <div>
        <dt>Votre bourse</dt>
        <dd>
          <Prix montant={solde} />
        </dd>
      </div>
      <div class="boutique-compte-reste">
        <dt>{auMoins ? "Il vous restera au moins" : "Il vous restera"}</dt>
        <dd data-testid="boutique-reste">
          <Prix montant={solde - prix} />
        </dd>
      </div>
    </dl>
  );
}

export function Refus({ message }: { message: string | null }) {
  return message ? (
    <p class="form-problem" role="alert" data-testid="boutique-refus">
      {message}
    </p>
  ) : null;
}

/**
 * Acheter un objet : la fenêtre dit l'objet, le prix et ce qu'il restera, puis demande au serveur. Après l'achat, l'objet
 * se porte tout de suite si le membre le veut. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que
 * l'objet, les mots du refus et « Fermer ».
 */
export function DialogueAchat({ objet, rarete, vignette, prix, solde, acheter, onPorter, onFermer }: { objet: Objet; rarete: Rarete; vignette: Vignette | null; prix: number; solde: number; acheter: () => Promise<Issue<number>>; onPorter: () => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "fait">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    // Dans le clic : sinon certains navigateurs gardent muette la note de l'objet reçu.
    preparerLeSonSiVoulu();
    const issue = await acheter();
    if (issue.ok) {
      setReste(issue.valeur);
      setEtape("fait");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  return (
    <Dialogue titre={etape === "fait" ? `${objet.nom} est à vous` : refus ? "Achat impossible" : `Acheter ${objet.nom} ?`} etape={etape === "fait" ? "fait" : "confirmer"} occupe={etape === "envoi"} onFermer={onFermer} testid="dialogue-achat">
      {etape === "fait" ? <ObjetRecu objet={objet} rarete={rarete} vignette={vignette} /> : <CaseMontree objet={objet} rarete={rarete} vignette={vignette} />}
      {etape === "fait" ? (
        <>
          {reste !== null && <p class="boutique-dialogue-texte">Il vous reste {stateres(reste)}.</p>}
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-primary" onClick={onPorter} data-testid="achat-porter">
              Le porter
            </button>
            <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="achat-fermer">
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
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="achat-confirmer">
                {etape === "envoi" ? "Achat…" : "Acheter"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="achat-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/**
 * Ouvrir une pochette surprise : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis fait tourner le
 * tambour (`Tambour.tsx`, choix du pilote du 15 novembre 2026) jusqu'à l'objet tiré, et écrit dessous son nom, sa rareté,
 * et que c'est un double s'il était déjà possédé. Le tambour ne fait que montrer ce que le serveur a déjà tiré : les autres
 * rangées sont tirées aux chances de la pochette (`bandeDeLaPochette`). « Passer » l'arrête tout de suite ; il ne tourne pas
 * quand les animations sont coupées.
 */
export function DialoguePochette({ prix, chances, solde, ouvrir, objetDe, vignetteDe, dejaPorte, onPorter, onFermer }: { prix: number; chances: Readonly<Record<Rarete, number>>; solde: number; ouvrir: () => Promise<Issue<PochetteReponse>>; objetDe: (tire: PochetteReponse["objet"]) => Objet | undefined; vignetteDe: (tire: PochetteReponse["objet"]) => Vignette | null; dejaPorte: (tire: PochetteReponse["objet"]) => boolean; onPorter: (tire: PochetteReponse["objet"]) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteReponse | null>(null);
  const [bande, setBande] = useState<BandeVue | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  const [depart] = useState(solde);
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    if (issue.ok) {
      const tire = issue.valeur.objet;
      const tour = bandeDeLaPochette(tire, chances);
      setBande({ depart: tour.depart, cible: tour.cible, rangees: tour.rangees.map((rangee, i) => (i === tour.cible ? { nom: objetDe(tire)?.nom ?? "", rarete: tire.rarete, dessin: vignetteDe(tire) } : vueDeLObjet(rangee))) });
      setTirage(issue.valeur);
      setEtape("tourne");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const tire = tirage?.objet;
  // L'objet tiré, une fois la fenêtre fermée : le Gaulois de la page saute de joie s'il est épique ou plus.
  const tireVu = useRef<Rarete | null>(null);
  tireVu.current = etape === "revele" && tire ? tire.rarete : null;
  useEffect(
    () => () => {
      if (tireVu.current) feterLObjet(tireVu.current);
    },
    [],
  );
  const objet = tire ? objetDe(tire) : undefined;
  const ouverte = etape === "tourne" || etape === "revele";
  return (
    <Dialogue titre={ouverte && tire && objet ? (etape === "revele" ? "Dans votre pochette" : "La pochette s'ouvre…") : refus ? "La pochette reste fermée" : "Ouvrir une pochette surprise ?"} etape={ouverte ? etape : "confirmer"} occupe={etape === "envoi" || etape === "tourne"} onFermer={onFermer} testid="dialogue-pochette">
      {ouverte && tirage && tire && objet && bande ? (
        <>
          <Tambour rangees={bande.rangees} depart={bande.depart} cible={bande.cible} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "revele" : e))} />
          {etape === "tourne" ? (
            <div class="boutique-dialogue-actions">
              {/* « Passer » montre le résultat tout de suite, sans attendre la toile : la fenêtre ne reste jamais bloquée. */}
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  setPasser(true);
                  setEtape("revele");
                }}
                data-testid="pochette-passer"
              >
                Passer
              </button>
              <BoutonSon son={son} onBasculer={basculerSon} testid="pochette-son" />
            </div>
          ) : (
            <>
              <div class="tambour-sortie" data-rarete={tire.rarete} data-testid="pochette-tirage" data-objet={`${tire.emplacement}/${tire.objet}`}>
                <p class="tambour-nom">{objet.nom}</p>
                <MarqueDeRarete rarete={tire.rarete} />
              </div>
              {tire.double && (
                <p class="boutique-dialogue-texte" data-testid="pochette-double">
                  Vous l'aviez déjà : ce double se vend au marché.
                </p>
              )}
              <p class="boutique-dialogue-texte">Il vous reste {stateres(tirage.solde)}.</p>
              <div class="boutique-dialogue-actions">
                {!dejaPorte(tire) && (
                  <button type="button" class="btn btn-primary" onClick={() => onPorter(tire)} data-testid="pochette-porter">
                    Le porter
                  </button>
                )}
                <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="pochette-fermer">
                  Fermer
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div class="pochette-attente" data-envoi={etape === "envoi" ? "" : undefined}>
            <DessinPochette echelle={4} />
          </div>
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="pochette-confirmer">
                {etape === "envoi" ? "Ouverture…" : "Ouvrir"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="pochette-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/** Les rangées d'un tour de tambour, prêtes à dessiner. */
export interface BandeVue {
  rangees: RangeeVue[];
  depart: number;
  cible: number;
}

/** Une rangée du tambour de la pochette surprise : le nom et le dessin d'un objet du catalogue. */
function vueDeLObjet(rangee: Rangee<RefObjet>): RangeeVue {
  const { emplacement, objet } = rangee.valeur;
  return { nom: OBJETS[emplacement][objet]?.nom ?? "", rarete: rangee.rarete, dessin: vignetteDeLObjet(emplacement, objet) };
}
