import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { RARETES_DES_OBJETS, type Objet, type RareteDObjet as Rarete, type Vignette } from "../../lib/gaulois";
import { stateres } from "../../lib/village/ecran-boutique";
import { MarqueDeRarete, Prix } from "./BoutiquePixels";
import { carillonSiVoulu, preparerLeSonSiVoulu } from "./Carillon";
import { FicheDesEffets, HabitDeCarte, RangDuDuel, RefletDeCarte, suivreLePointeur, useBulleDesEffets, variablesDeLaCarte } from "./CarteDObjet";
import { faconDeLaCarte, styleDeCarte } from "../../lib/jeu/cartes-d-objets";
import { PetiteDeborde, PetitePleine } from "./CartesRares";
import { feterLObjet } from "./Cases";
import { DessinSurFond } from "./DessinSurFond";
import type { PoseDeLaChose } from "../../lib/village/fonds-objets";
import { useEffetsDeLaChose } from "./effets-des-cartes";

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

/**
 * Une case montrée dans une fenêtre : la même que celles du vestiaire, sans être un bouton. Posée sur son fond, c'est une
 * carte (22 novembre 2026) ; `grande` : la carte en grand d'une fenêtre (achat, objet reçu), qui s'incline vers le pointeur
 * et porte, pour qui voit le duel, toutes les phrases de ses effets.
 */
export function CaseMontree({
  objet,
  rarete,
  vignette,
  fond = null,
  grande = false,
  pose = "centre",
  sous = null,
  testid,
}: {
  objet: Objet;
  rarete: Rarete;
  vignette: Vignette | null;
  fond?: string | null;
  grande?: boolean;
  /** Où poser la chose sur son fond : au milieu (un objet), au sol (un familier), contre le bas (un Gaulois unique). */
  pose?: PoseDeLaChose;
  /** Quelques mots de plus sous la rareté, dans la carte (la taille d'un familier). */
  sous?: string | null;
  testid?: string;
}) {
  const carte = !!fond && !!vignette;
  const effets = useEffetsDeLaChose(carte ? fond : null);
  const bulle = useBulleDesEffets(objet.nom, grande ? null : effets);
  if (carte && vignette) {
    const style = styleDeCarte(rarete);
    const suivre = grande || style !== "lisse" ? suivreLePointeur(grande ? 12 : 0) : null;
    const facon = faconDeLaCarte(rarete);
    const rare = facon !== "simple";
    const CorpsRare = facon === "pleine" ? PetitePleine : PetiteDeborde;
    return (
      <div
        class={`case case-montree case-carte co-carte${grande ? " co-grande" : rare ? ` co-${facon}` : ""}`}
        data-carte={style}
        data-rarete={rarete}
        data-testid={testid}
        style={variablesDeLaCarte(rarete)}
        onPointerMove={suivre?.onPointerMove}
        onPointerLeave={(e) => {
          suivre?.onPointerLeave(e);
          bulle.onPointerLeave();
        }}
        onPointerCancel={suivre?.onPointerCancel}
        onPointerEnter={bulle.onPointerEnter}
      >
        {rare && !grande ? (
          <CorpsRare nom={objet.nom} rarete={rarete} cle={fond} dessin={vignette} effets={effets} pied={sous ? <span class="co-sous">{sous}</span> : null} pose={pose} />
        ) : (
          <>
            <HabitDeCarte rarete={rarete} />
            <span class="case-nom co-nom">{objet.nom}</span>
            <span class="case-image" data-fond="">
              <DessinSurFond dessin={vignette} fond={fond} rarete={rarete} place={grande ? 168 : 80} maximum={grande ? 4 : 3} pose={pose} class="case-dessin" />
              <RefletDeCarte rarete={rarete} />
            </span>
            <MarqueDeRarete rarete={rarete} />
            {sous && <span class="co-sous">{sous}</span>}
            {effets?.duel && <RangDuDuel duel={effets.duel} />}
            {grande && effets && <FicheDesEffets effets={effets} />}
          </>
        )}
      </div>
    );
  }
  return (
    <div class="case case-montree" data-rarete={rarete} data-testid={testid}>
      <span class="case-image" data-fond={vignette && fond ? "" : undefined}>
        {vignette && <DessinSurFond dessin={vignette} fond={fond} rarete={rarete} class="case-dessin" />}
      </span>
      <span class="case-nom">{objet.nom}</span>
      <MarqueDeRarete rarete={rarete} />
      {sous && <span class="co-sous">{sous}</span>}
    </div>
  );
}

/**
 * L'objet qu'on vient de recevoir (17 novembre 2026) : la même case, posée devant des rayons de la couleur de sa rareté,
 * avec la note du carillon pour sa rareté si le son n'est pas coupé. La même scène pour un achat à la boutique et pour un
 * palier du sentier ; les boosters ont leur ouverture, la fusion son moule. Les rayons tournent très lentement, et pas du
 * tout quand les animations sont coupées. Décoratifs : le nom et la rareté sont écrits dans la case.
 */
export function ObjetRecu({ objet, rarete, vignette, fond = null, palier = false }: { objet: Objet; rarete: Rarete; vignette: Vignette | null; fond?: string | null; palier?: boolean }) {
  useEffect(() => carillonSiVoulu(RARETES_DES_OBJETS[rarete].rang), [rarete]);
  // Quand la fenêtre se ferme, le Gaulois de la page saute de joie : pour un objet épique ou plus, ou un palier du sentier.
  useEffect(() => () => feterLObjet(rarete, palier), [rarete, palier]);
  return (
    <div class="objet-recu" data-rarete={rarete} data-testid="objet-recu">
      <span class="objet-recu-rayons" aria-hidden="true" />
      <CaseMontree objet={objet} rarete={rarete} vignette={vignette} fond={fond} grande />
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
export function DialogueAchat({ objet, rarete, vignette, fond = null, prix, solde, acheter, onPorter, onFermer }: { objet: Objet; rarete: Rarete; vignette: Vignette | null; fond?: string | null; prix: number; solde: number; acheter: () => Promise<Issue<number>>; onPorter: () => void; onFermer: () => void }) {
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
      {etape === "fait" ? <ObjetRecu objet={objet} rarete={rarete} vignette={vignette} fond={fond} /> : <CaseMontree objet={objet} rarete={rarete} vignette={vignette} fond={fond} grande />}
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
