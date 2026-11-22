import type { JSX } from "preact";
import { useMemo } from "preact/hooks";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import {
  FILET_DES_STATERES,
  LOTS_DESSINES,
  SCENE_HAUTEUR,
  SCENE_LARGEUR,
  cadreDesStateres,
  coinDOr,
  eclatDOr,
  ecrireEnChiffres,
  ecussonDesStateres,
  estEnCases,
  etoilesDuTresor,
  jaugeDuRendu,
  largeurDeLEcusson,
  largeurDesPions,
  motifDesStateres,
  motsDeLaCarteDeStateres,
  nombreEnCases,
  petitePiece,
  pionsDuLot,
  rangDeStateres,
  sceneDesStateres,
} from "../../lib/jeu/cartes-de-stateres";
import { Planche } from "../../lib/jeu/planche";
import { suivreLePointeur, useCaseQuiTient } from "./CarteDObjet";

/**
 * La carte spéciale statères, en grand à la fin d'un booster (22 novembre 2026, dessins de Claude Fable 5.2) : les statères
 * rendus par un booster des bannières ou des Gaulois uniques (`rang` 0, avec la part du prix), ou un lot du booster de
 * statères (`rang` 1 à 6, parmi `total` lots). Le montant, la part et le nombre de lots sont ceux de la réponse du serveur,
 * écrits en grand dans la carte ; la carte se lit d'un seul nom pour les lecteurs d'écran (« 960 statères rendus, 60 % du
 * prix »), son dessin est décoratif. À quatre pixels la case, moins sur un écran petit ou bas, pour que la bourse et les
 * boutons restent dans l'écran. Classes `cs-…` (24-cartes.css).
 */

/** La hauteur de la carte, en cases : celle d'un lot, celle d'un rendu (sa part et sa jauge en plus). */
const CASES_D_UN_LOT = 90;
const CASES_D_UN_RENDU = 104;

/** Une planche en image de la page, gardée sous sa clé. */
const url = (cle: string, faire: () => Planche): string => urlDeLaPlanche(`stateres|${cle}`, faire);

/** Une planche posée telle quelle, en image, à `e` pixels la case (sa largeur et sa hauteur en variables). */
function Image({ cle, faire, classe, largeur, hauteur }: { cle: string; faire: () => Planche; classe: string; largeur: number; hauteur: number }) {
  return <i class={classe} style={{ backgroundImage: url(cle, faire), "--l": String(largeur), "--h": String(hauteur) }} aria-hidden="true" />;
}

export function CarteDeStateres({ rang: rangLu, gain, pourcent = null, total = 6, testid }: { rang: number; gain: number; pourcent?: number | null; total?: number; testid?: string }) {
  const rang = rangDeStateres(rangLu);
  const lot = LOTS_DESSINES[rang];
  const rendu = rang === 0;
  const p = useCaseQuiTient(rendu ? CASES_D_UN_RENDU : CASES_D_UN_LOT);
  const dit = motsDeLaCarteDeStateres(rang, gain, pourcent, total);
  const somme = useMemo(() => ecrireEnChiffres(`+${nombreEnCases(gain)}`, lot.encre), [gain, lot.encre]);
  const part = useMemo(() => (rendu && pourcent !== null ? ecrireEnChiffres(`${pourcent} %`, "marine") : null), [rendu, pourcent]);
  const style: Record<string, string> = { "--p": `${p}px` };
  if (lot.carte === "entre") style["--coin"] = url("coin", coinDOr);
  if (estEnCases(rang)) {
    style["--cadre"] = url(`cadre-${rang}`, () => cadreDesStateres(rang));
    style["--filet-cadre"] = FILET_DES_STATERES;
    style["--motif"] = url(`motif-${rang}`, () => motifDesStateres(rang));
    style["--motif-n"] = rang === 4 ? "8" : "16";
    if (rang >= 5) {
      const r = rang as 5 | 6;
      style["--ecusson"] = url(`ecusson-${r}`, () => ecussonDesStateres(r));
      style["--ecusson-bas"] = url(`ecusson-bas-${r}`, () => ecussonDesStateres(r, true));
      style["--ecu-l"] = String(largeurDeLEcusson(r));
    }
    if (rang === 6) style["--etoiles"] = url("etoiles", etoilesDuTresor);
  }
  const eclats = rang === 6 ? [[8, 14], [80, 10], [46, 2], [90, 52], [24, 58], [62, 40]] : rang === 5 ? [[10, 10], [84, 18], [52, 4]] : [];
  return (
    <div class="cs-socle">
      <div class="cs-carte" data-rang={rang} data-carte={lot.carte} role="img" aria-label={dit} data-testid={testid} style={style as JSX.CSSProperties} {...suivreLePointeur(8)}>
        <span class="cs-cadre" aria-hidden="true" />
        {lot.carte === "entre" && ["hg", "hd", "bg", "bd"].map((q) => <span key={q} class="cs-coin" data-coin={q} aria-hidden="true" />)}
        {rang >= 5 && (
          <>
            <span class="cs-ecusson" data-bord="haut" aria-hidden="true" />
            <span class="cs-ecusson" data-bord="bas" aria-hidden="true" />
          </>
        )}
        {rang === 6 && <span class="cs-prisme" aria-hidden="true" />}
        {estEnCases(rang) && <span class="cs-feuille-cadre" aria-hidden="true" />}
        <span class="cs-nom" aria-hidden="true">
          {lot.nom}
        </span>
        <span class="cs-scene" aria-hidden="true">
          <Image cle={`scene-${rang}-${rendu ? Math.round((pourcent ?? 0) / 10) : 0}`} faire={() => sceneDesStateres(rang, pourcent ?? 0)} classe="cs-image" largeur={SCENE_LARGEUR} hauteur={SCENE_HAUTEUR} />
          {lot.carte === "entre" && <span class="cs-reflet" />}
          {estEnCases(rang) && (
            <>
              <span class="cs-holo" data-couche="a" />
              <span class="cs-holo" data-couche="b" />
              <span class="cs-lueur" />
            </>
          )}
          {eclats.map(([x, y], i) => (
            <span key={i} class="cs-eclat" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(-i * 1.9).toFixed(1)}s`, backgroundImage: url("eclat", eclatDOr) }} />
          ))}
        </span>
        <span class="cs-somme" style={{ "--l": String(somme.image.width), "--h": String(somme.image.height) }} aria-hidden="true">
          <i class="cs-chiffres" style={{ backgroundImage: url(`somme-${lot.encre}-${gain}`, () => somme.image) }} />
          {rang === 6 && <span class="cs-somme-feuille" style={{ "--plein": url(`somme-plein-${gain}`, () => somme.plein) }} />}
        </span>
        <span class="cs-mot" aria-hidden="true">
          <Image cle="piece" faire={petitePiece} classe="cs-piece" largeur={12} hauteur={12} />
          {rendu ? (gain > 1 ? "Statères rendus" : "Statère rendu") : "Statères"}
        </span>
        <span class="cs-pied" aria-hidden="true">
          {rendu ? (
            part && pourcent !== null && (
              <>
                <span class="cs-part">
                  <i class="cs-chiffres-part" style={{ backgroundImage: url(`part-${pourcent}`, () => part.image), "--l": String(part.image.width), "--h": String(part.image.height) }} />
                  <span>
                    du
                    <br />
                    prix
                  </span>
                </span>
                <Image cle={`jauge-${pourcent}`} faire={() => jaugeDuRendu(pourcent)} classe="cs-jauge" largeur={49} hauteur={5} />
              </>
            )
          ) : (
            <>
              <Image cle={`pions-${rang}-${total}`} faire={() => pionsDuLot(rang, total)} classe="cs-pions" largeur={largeurDesPions(total)} hauteur={5} />
              Lot {rang} sur {total}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
