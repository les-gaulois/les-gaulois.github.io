import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Objet, Rarete, Vignette } from "../../lib/gaulois";
import type { PochetteReponse } from "../../lib/village/contrat";
import { stateres } from "../../lib/village/ecran-boutique";
import { MarqueDeRarete, Pixels, Prix } from "./BoutiquePixels";
import { DessinPochette } from "./Pochette";

/** Ce que rend un achat : le résultat du serveur, ou les mots de son refus. */
export type Issue<T> = { ok: true; valeur: T } | { ok: false; message: string };

/**
 * Une fenêtre de confirmation : un vrai `<dialog>` ouvert en modal, qui garde le focus, se ferme par Échap ou par un clic
 * à côté, et rend le focus au bouton qui l'a ouverte. Pendant un envoi (`occupe`), elle ne se ferme pas. À chaque étape
 * (`etape`), le focus va au titre : un lecteur d'écran lit ce qui vient de changer.
 */
function Dialogue({ titre, etape, occupe, onFermer, testid, children }: { titre: string; etape: string; occupe: boolean; onFermer: () => void; testid: string; children: ComponentChildren }) {
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
function CaseMontree({ objet, rarete, vignette, double = false }: { objet: Objet; rarete: Rarete; vignette: Vignette | null; double?: boolean }) {
  const echelle = vignette ? Math.max(1, Math.min(3, Math.floor(80 / Math.max(vignette.largeur, vignette.hauteur)))) : 1;
  return (
    <div class="case case-montree" data-rarete={rarete}>
      <span class="case-image">{vignette && <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" />}</span>
      <span class="case-nom">{objet.nom}</span>
      <MarqueDeRarete rarete={rarete} />
      {double && <span class="case-marque">Double</span>}
    </div>
  );
}

/** Le compte d'un achat : le prix, la bourse, ce qu'il restera. */
function Compte({ prix, solde }: { prix: number; solde: number }) {
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
        <dt>Il vous restera</dt>
        <dd data-testid="boutique-reste">
          <Prix montant={solde - prix} />
        </dd>
      </div>
    </dl>
  );
}

function Refus({ message }: { message: string | null }) {
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
      <CaseMontree objet={objet} rarete={rarete} vignette={vignette} />
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
 * Ouvrir une pochette surprise : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis montre l'objet tiré,
 * sa rareté, et « Double » s'il était déjà possédé. La révélation est un fondu lent, coupé quand les animations le sont :
 * elle ne fait que montrer ce que le serveur a déjà tiré.
 */
export function DialoguePochette({ prix, solde, ouvrir, objetDe, vignetteDe, dejaPorte, onPorter, onFermer }: { prix: number; solde: number; ouvrir: () => Promise<Issue<PochetteReponse>>; objetDe: (tire: PochetteReponse["objet"]) => Objet | undefined; vignetteDe: (tire: PochetteReponse["objet"]) => Vignette | null; dejaPorte: (tire: PochetteReponse["objet"]) => boolean; onPorter: (tire: PochetteReponse["objet"]) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteReponse | null>(null);
  const [depart] = useState(solde);
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    if (issue.ok) {
      setTirage(issue.valeur);
      setEtape("revele");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const tire = tirage?.objet;
  const objet = tire ? objetDe(tire) : undefined;
  return (
    <Dialogue titre={tire && objet ? "Dans votre pochette" : refus ? "La pochette reste fermée" : "Ouvrir une pochette surprise ?"} etape={etape === "revele" ? "revele" : "confirmer"} occupe={etape === "envoi"} onFermer={onFermer} testid="dialogue-pochette">
      {tirage && tire && objet ? (
        <>
          <div class="pochette-revelation" data-rarete={tire.rarete} data-testid="pochette-tirage" data-objet={`${tire.emplacement}/${tire.objet}`}>
            <CaseMontree objet={objet} rarete={tire.rarete} vignette={vignetteDe(tire)} double={tire.double} />
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
