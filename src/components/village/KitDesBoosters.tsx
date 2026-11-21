import type { ComponentChildren } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { NOMS_DES_RARETES, paquet, rareteDeCarte, type SorteDeBooster } from "../../lib/jeu/boosters";
import { urlDeLaPlanche, type CouleurDEcriture } from "../../lib/jeu/dans-la-page";
import { nombreEcrit } from "../../lib/jeu/ecriture";
import { grille } from "../../lib/jeu/planche";
import { stateres } from "../../lib/village/ecran-boutique";
import { Etiquette, Px } from "../jeu/Pixels";
import type { Album } from "../../lib/village/album-pochette";
import { AlbumDePochette } from "./AlbumPochette";
import { IconeDeRarete, rareteDuRang } from "./IconeDeRarete";
import { PochetteGagneeIci } from "./BoutiqueDialogue";

/**
 * Les pièces de « Les boosters » habillées du kit du jeu (21 novembre 2026, dessin et mise en page de Claude Fable 5.2) :
 * le paquet en image, la fiche du booster choisi, la fenêtre d'ouverture, son compte, ses boutons, l'icône de la rareté et la
 * rareté en pixels. Tout ce qui s'y lit en pixels a son texte pour les lecteurs d'écran (`Px`, `dit`).
 */

/** Le paquet d'un booster en image, à l'échelle que lui donne la feuille ; décoratif. */
export function PaquetEnImage({ sorte, classe = "" }: { sorte: SorteDeBooster; classe?: string }) {
  return <i class={`bst-paquet-img ${classe}`} style={`--i:${urlDeLaPlanche(`booster|${sorte}`, () => paquet(sorte))}`} aria-hidden="true" />;
}

/** La petite pièce du kit, devant un nombre de statères ; décorative. */
export const PieceDuJeu = () => <i class="bst-piece" aria-hidden="true" />;

/** Un nombre de statères en pixels : la pièce, puis le nombre ; le lecteur d'écran entend « 200 statères ». */
export function StateresEnPixels({ n, couleur = "texte", relief = "plat", signe = "" }: { n: number; couleur?: CouleurDEcriture; relief?: "plat" | "cerne"; signe?: string }) {
  return (
    <span class="bst-stateres">
      <PieceDuJeu />
      <Px t={`${signe}${nombreEcrit(n)}`} couleur={couleur} relief={relief} dit={`${signe}${stateres(n)}`} />
    </span>
  );
}

/**
 * L'icône d'une rareté (21 novembre 2026, à la place des losanges qui comptaient le rang), décorative : `rarete` la nomme,
 * sinon `rang`, de 1 (commun) à 6 (divin), la donne (les lots de la pochette de statères n'ont qu'un rang).
 */
export function RangEnIcone({ rang, rarete }: { rang: number; rarete?: string }) {
  return (
    <span class="bst-losanges" aria-hidden="true">
      <IconeDeRarete rarete={rarete ?? rareteDuRang(rang)} />
    </span>
  );
}

/** Une rareté en pixels : son icône et son nom, dans sa couleur. */
export function RareteEnPixels({ rarete }: { rarete: string }) {
  const r = rareteDeCarte(rarete);
  const nom = NOMS_DES_RARETES[r];
  return (
    <span class="bst-rarete-px">
      <RangEnIcone rang={["commun", "peu-commun", "epique", "mystique", "legendaire", "divin"].indexOf(r) + 1} rarete={r} />
      <Px t={nom} couleur={r} dit={nom} />
    </span>
  );
}

/** Un bouton du jeu : or pour l'action, bleu pour le reste ; `t` est écrit en pixels, `dit` est son nom entier. */
export function BoutonDesBoosters({ t, dit, or = false, disabled = false, onClick, testid, classe = "", apres }: { t: string; dit?: string; or?: boolean; disabled?: boolean; onClick: () => void; testid?: string; classe?: string; apres?: ComponentChildren }) {
  return (
    <button type="button" class={`jeu-btn ${or ? "" : "jeu-btn-bleu"} jeu-n9 ${classe}`} disabled={disabled} onClick={onClick} data-testid={testid}>
      <Px t={t} couleur={or ? "encre" : "creme"} relief={or ? "plat" : "cerne"} dit={dit ?? t} />
      {apres}
    </button>
  );
}

const CROIX = ["................", "................", "................", "....ww....ww....", "....www..www....", ".....wwwwww.....", "......wwww......", "......wwww......", ".....wwwwww.....", "....www..www....", "....ww....ww....", "................", "................", "................", "................", "................"];

/**
 * La fenêtre d'un booster : un vrai `<dialog>` modal habillé en panneau du jeu, son titre en ruban, et « Fermer » en coin
 * (absent pendant un envoi ou une ouverture). Elle garde le focus, se ferme par Échap ou par un clic à côté, et rend le focus
 * au bouton qui l'a ouverte. À chaque étape (`etape`), le focus va au titre : un lecteur d'écran lit ce qui a changé.
 * `scene` : la fenêtre s'élargit pour la scène d'ouverture. `dit` : le titre entier pour les lecteurs d'écran, quand le
 * titre écrit en pixels n'en est qu'une forme courte (le nom d'un membre que l'écriture en pixels ne sait pas tracer).
 */
export function FenetreDuBooster({ titre, dit, etape, occupe, scene = false, onFermer, testid, children }: { titre: string; dit?: string; etape: string; occupe: boolean; scene?: boolean; onFermer: () => void; testid: string; children: ComponentChildren }) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const tete = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const d = fenetre.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => tete.current?.focus({ preventScroll: true }), [etape]);
  const croix = urlDeLaPlanche("croix", () => grille(CROIX, { w: "#fffdf5" }));
  return (
    <dialog
      ref={fenetre}
      class="bst-fenetre"
      aria-labelledby={`${testid}-titre`}
      data-testid={testid}
      data-etape={etape}
      data-scene={scene ? "" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!occupe) onFermer();
      }}
      onClick={(e) => {
        if (e.target === fenetre.current && !occupe) onFermer();
      }}
    >
      <div class="bst-fenetre-panneau jeu-panneau jeu-n9">
        <h2 id={`${testid}-titre`} ref={tete} tabIndex={-1} class="bst-fenetre-titre jeu-ruban jeu-n9">
          <Px t={titre} couleur="creme" relief="ombre" dit={dit ?? titre} />
        </h2>
        {!occupe && (
          <button type="button" class="jeu-btn jeu-btn-bleu jeu-btn-ic jeu-n9 bst-fermer" aria-label="Fermer" title="Fermer" onClick={onFermer} data-testid={`${testid}-croix`}>
            <i class="bst-croix" style={`--i:${croix}`} aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}

/**
 * Le compte d'une ouverture, en pixels : le prix, la bourse, ce qu'il restera (`auMoins` : un booster qui rend toujours
 * quelque chose ; ce qu'il restera est un minimum). Un booster offert (loterie, palier de victoires) ne coûte rien : la fenêtre ne promet
 * alors ni prix ni reste.
 */
export function CompteDuBooster({ prix, solde, auMoins = false }: { prix: number; solde: number; auMoins?: boolean }) {
  if (useContext(PochetteGagneeIci)) {
    return (
      <div class="bst-offert">
        <Etiquette t="Offert" ton="or" dit="Booster offert, par la loterie ou un palier de victoires" />
        <span data-testid="boutique-gagnee">
          <Px t="Rien à payer" dit="Rien à payer" />
        </span>
      </div>
    );
  }
  return (
    <dl class="bst-compte">
      <div>
        <dt>
          <Px t="Prix" couleur="doux" dit="Prix" />
        </dt>
        <dd>
          <StateresEnPixels n={prix} />
        </dd>
      </div>
      <div>
        <dt>
          <Px t="Votre bourse" couleur="doux" dit="Votre bourse" />
        </dt>
        <dd>
          <StateresEnPixels n={solde} />
        </dd>
      </div>
      <div>
        <dt>
          <Px t={auMoins ? "Il restera au moins" : "Il restera"} couleur="doux" dit={auMoins ? "Il vous restera au moins" : "Il vous restera"} />
        </dt>
        <dd data-testid="boutique-reste">
          <StateresEnPixels n={solde - prix} couleur="or" />
        </dd>
      </div>
    </dl>
  );
}

/** Le refus du serveur, dans une bulle, en lettres du site. */
export function RefusDuBooster({ message }: { message: string | null }) {
  return message ? (
    <p class="bst-refus jeu-bulle jeu-n9" role="alert" data-testid="boutique-refus">
      {message}
    </p>
  ) : null;
}

/**
 * L'étape « confirmer » d'une fenêtre d'ouverture : le paquet (qui se secoue pendant que le serveur tire), le compte, puis
 * « Ouvrir » et « Annuler ». Après un refus, il ne reste que les mots du refus et « Fermer ».
 */
export function ConfirmerLeBooster({ sorte, prix, solde, auMoins = false, refus, envoi, onOuvrir, onFermer, testid }: { sorte: SorteDeBooster; prix: number; solde: number; auMoins?: boolean; refus: string | null; envoi: boolean; onOuvrir: () => void; onFermer: () => void; testid: string }) {
  return (
    <div class="bst-confirmer">
      <div class="bst-attente" data-envoi={envoi ? "" : undefined}>
        <PaquetEnImage sorte={sorte} classe="bst-attente-paquet" />
      </div>
      <div class="bst-confirmer-compte">
        {!refus && <CompteDuBooster prix={prix} solde={solde} auMoins={auMoins} />}
        <RefusDuBooster message={refus} />
        <div class="bst-actions">
          {!refus && <BoutonDesBoosters t={envoi ? "Ouverture" : "Ouvrir"} dit={envoi ? "Ouverture en cours" : "Ouvrir"} or disabled={envoi} onClick={onOuvrir} testid={`${testid}-confirmer`} />}
          <BoutonDesBoosters t={refus ? "Fermer" : "Annuler"} disabled={envoi} onClick={onFermer} testid={`${testid}-annuler`} />
        </div>
      </div>
    </div>
  );
}

/**
 * Le résultat d'une ouverture, écrit sous la scène : ce que la carte montre en pixels, pour tous (et pour les lecteurs
 * d'écran, qui l'entendent dès qu'elle est retournée) ; « Double » pour un objet déjà possédé.
 */
export function ResultatDuBooster({ nom, detail, testid, double = false, children }: { nom: string; detail: ComponentChildren; testid: string; double?: boolean; children?: ComponentChildren }) {
  return (
    <div class="bst-trouve-ecrit" data-testid={testid}>
      <p class="bst-trouve-ligne">
        <Px t={nom} plie dit={nom} />
        <span class="bst-trouve-detail">{detail}</span>
        {double && <Etiquette t="Double" ton="rouge" dit="Un double : vous l'aviez déjà" />}
      </p>
      {children}
    </div>
  );
}

/** Ce qu'il reste dans la bourse après une ouverture. */
export function ResteEnPixels({ solde, testid }: { solde: number; testid?: string }) {
  return (
    <p class="bst-reste" data-testid={testid}>
      <Px t="Il vous reste" couleur="doux" dit="Il vous reste" />
      <StateresEnPixels n={solde} />
    </p>
  );
}

/** Une ligne des chances d'un booster : une rareté, les statères rendus, ou un lot de statères. */
export type LigneDeChance =
  | { kind: "rarete"; rarete: string; chance: string | null; touteA?: string }
  | { kind: "rendu"; etendue: string; chance: string }
  | { kind: "lot"; rang: number; gain: number; chance: string };

/**
 * La fiche du booster choisi (sous l'étal) : un panneau du jeu, son nom en ruban ; à gauche le paquet, qui ouvre l'album de
 * ce qu'il contient (au survol, au clic, au clavier) ; à droite son prix, le compte du joueur, le bouton (ou, à sa place, la
 * raison pour laquelle il ne peut pas ouvrir), puis les chances, toujours écrites avant d'ouvrir, et la règle.
 */
export function FicheDuBooster({
  sorte,
  nom,
  testid,
  album,
  contenu,
  prix,
  compte,
  gagnees = 0,
  raison,
  onOuvrir,
  lignes,
  regle,
}: {
  sorte: SorteDeBooster;
  nom: string;
  testid: string;
  album: { lireAlbum: () => Album; nombre: number; nom: string; entete?: ComponentChildren } | null;
  /** L'étiquette du paquet : « 245 objets », « 100 familiers ». */
  contenu: string;
  prix: number;
  compte?: string | null;
  gagnees?: number;
  raison: string | null;
  onOuvrir: () => void;
  lignes: readonly LigneDeChance[] | null;
  regle: ComponentChildren;
}) {
  const dessin = (
    <span class="bst-fiche-dessin">
      <Etiquette t={contenu} ton="bleu" dit={contenu} />
      <PaquetEnImage sorte={sorte} classe="bst-fiche-paquet" />
      {album && <Px t="Voir le contenu" couleur="doux" plie muet />}
    </span>
  );
  return (
    <section class="bst-fiche jeu-panneau jeu-n9" aria-labelledby={`${testid}-titre`} data-testid={testid} data-sorte={sorte}>
      <h4 id={`${testid}-titre`} class="bst-fiche-titre jeu-ruban jeu-n9">
        <Px t={nom} couleur="creme" relief="ombre" dit={nom} />
      </h4>
      <div class="bst-fiche-corps">
        {album ? (
          <AlbumDePochette lireAlbum={album.lireAlbum} nombre={album.nombre} nom={album.nom} testid={testid} entete={album.entete}>
            {dessin}
          </AlbumDePochette>
        ) : (
          dessin
        )}
        <div class="bst-fiche-infos">
          <p class="bst-prix">
            <PieceDuJeu />
            <Px t={nombreEcrit(prix)} classe="bst-grand" dit={stateres(prix)} />
            <span class="bst-unite" aria-hidden="true">
              <Px t="statères" couleur="doux" muet />
            </span>
          </p>
          {compte && (
            <p class="bst-compte-du-joueur" data-testid={`${testid}-compte`}>
              <Px t={compte} couleur="or" plie dit={compte} />
            </p>
          )}
        </div>
        <div class="bst-actions bst-fiche-action">
          {raison ? (
            <p class="bst-raison jeu-bulle jeu-n9" data-testid={`${testid}-raison`}>
              {raison}
            </p>
          ) : (
            <>
              <button type="button" class="jeu-btn jeu-n9" onClick={onOuvrir} data-testid={`${testid}-ouvrir`}>
                <Px t={gagnees > 0 ? "Ouvrir sans payer" : "Ouvrir"} couleur="encre" dit={gagnees > 0 ? "Ouvrir sans payer : booster offert" : "Ouvrir un booster"} />
              </button>
              {gagnees > 0 && <Etiquette t={`${gagnees} ${gagnees > 1 ? "offerts" : "offert"}`} ton="or" />}
            </>
          )}
        </div>
        <div class="bst-fiche-infos bst-fiche-suite">
          {lignes && (
            <ul class="bst-chances" aria-label="Chances à chaque booster" data-testid={`${testid}-chances`}>
              {lignes.map((l, i) => (
                <li key={i} data-kind={l.kind}>
                  {l.kind === "rarete" ? (
                    <>
                      <RangEnIcone rang={0} rarete={rareteDeCarte(l.rarete)} />
                      <Px t={NOMS_DES_RARETES[rareteDeCarte(l.rarete)]} couleur={rareteDeCarte(l.rarete)} dit={NOMS_DES_RARETES[rareteDeCarte(l.rarete)]} />
                      {l.chance !== null ? <Px t={l.chance} dit={l.chance} /> : <Px t={l.touteA ?? "toutes à vous"} couleur="doux" dit={l.touteA ?? "toutes à vous"} />}
                    </>
                  ) : l.kind === "rendu" ? (
                    <>
                      <PieceDuJeu />
                      <span class="bst-chance-rendu">
                        <Px t="Statères rendus" couleur="rendu" plie dit="Statères rendus" />
                        <Px t={l.etendue} couleur="doux" classe="bst-etendue" dit={l.etendue} />
                      </span>
                      <Px t={l.chance} dit={l.chance} />
                    </>
                  ) : (
                    <>
                      <RangEnIcone rang={l.rang} />
                      <Px t={`${nombreEcrit(l.gain)} statères`} dit={stateres(l.gain)} />
                      <Px t={l.chance} dit={l.chance} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div class="bst-regle">{regle}</div>
        </div>
      </div>
    </section>
  );
}
