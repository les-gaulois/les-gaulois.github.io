import { useCallback, useState } from "preact/hooks";
import { carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { cleDuFamilier } from "../../lib/village/fonds-objets";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { albumDeLaMenagerie } from "../../lib/village/album-pochette";
import type { MesFamiliers, PochetteFamiliersReponse } from "../../lib/village/contrat";
import { pourcent } from "../../lib/village/ecran-boutique";
import { ANCRE_FAMILIERS, idsPossedes, lignesDesChances, raisonPochetteFermee, vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { FAMILIERS, familierDe, tailleDuFamilier, TAILLES, type Familier } from "../../lib/village/familiers";
import { Px } from "../jeu/Pixels";
import type { Issue } from "./BoutiqueDialogue";
import { BoutonDesBoosters, ConfirmerLeBooster, FenetreDuBooster, FicheDuBooster, RareteEnPixels, ResteEnPixels, ResultatDuBooster } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";

/** Le nom d'une taille : « Minuscule », « Géant »… */
const nomDeLaTaille = (familier: Familier): string => TAILLES.find((taille) => taille.id === tailleDuFamilier(familier).classe)?.nom ?? "";

/**
 * Le booster des familiers, sous l'étal (fiche du kit, `FicheDuBooster`) : la seule façon d'avoir un familier. Son paquet,
 * son prix (celui du serveur), combien de familiers le compte a, le bouton d'ouverture ou la raison pour laquelle il ne
 * peut pas ouvrir, et ses chances par rareté, toujours écrites avant d'ouvrir. Le paquet ouvre la ménagerie (l'album,
 * `AlbumPochette.tsx`) : les cent familiers, ceux du compte en couleur, les autres en silhouette avec leur chance.
 * `solde` : le dernier que le serveur a donné à la page ; `gagnees` : ceux gagnés à la loterie, qui s'ouvrent sans payer.
 */
export function PochetteFamiliers({ mes, solde, gagnees = 0, onOuvrir }: { mes: MesFamiliers; solde: number; gagnees?: number; onOuvrir: () => void }) {
  const possedes = idsPossedes(mes);
  const lignes = lignesDesChances(mes.pochette.chances, possedes);
  const raison = raisonPochetteFermee(mes, solde);
  const lireAlbum = useCallback(() => albumDeLaMenagerie(mes), [mes]);
  return (
    <div id={ANCRE_FAMILIERS}>
      <FicheDuBooster
        sorte="familiers"
        nom="Booster des familiers"
        testid="familiers"
        album={{ lireAlbum, nombre: FAMILIERS.length, nom: "Voir la ménagerie : les familiers de ce booster" }}
        contenu={`${FAMILIERS.length} familiers`}
        prix={mes.pochette.prix}
        compte={`${possedes.size} sur ${FAMILIERS.length} familiers à vous`}
        gagnees={gagnees}
        raison={raison}
        onOuvrir={onOuvrir}
        lignes={lignes ? lignes.map(({ rarete, chance, reste }) => ({ kind: "rarete" as const, rarete, chance: reste > 0 ? pourcent(chance) : null, touteA: "tous à vous" })) : null}
        regle={<p>Un familier ne s'obtient qu'ici, jamais à la boutique ni au marché. Le booster ne donne jamais un familier que vous avez déjà.</p>}
      />
    </div>
  );
}

/**
 * Ouvrir un booster des familiers : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis le joueur ouvre le
 * paquet et retourne la carte du familier que le serveur a tiré (`OuvertureDuBooster.tsx`, qui remplace le tambour depuis
 * le 21 novembre 2026) ; dessous, son nom, sa rareté, sa taille, ce qu'il reste à recevoir, et de quoi le montrer à côté
 * du Gaulois. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les mots du refus et « Fermer ».
 */
export function DialogueFamiliers({ prix, solde, village, ouvrir, dejaMontre, onMontrer, onFermer }: { prix: number; solde: number; village: string; ouvrir: () => Promise<Issue<PochetteFamiliersReponse>>; dejaMontre: (id: string) => boolean; onMontrer: (id: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "ouvre" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteFamiliersReponse | null>(null);
  const [carte, setCarte] = useState<CarteDeScene | null>(null);
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  const envoyer = async () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    const familier = issue.ok ? familierDe(issue.valeur.familier.familier) : null;
    if (issue.ok && familier) {
      setCarte(carteDeRarete(familier.nom, familier.rarete, vignetteDuFamilier(familier), { cle: cleDuFamilier(familier.id), pose: "sol" }));
      setTirage(issue.valeur);
      setEtape("ouvre");
    } else if (issue.ok) {
      // Un familier inconnu de ce code ne peut pas arriver ici (`lirePochetteFamiliers` l'écarte) : la page est à recharger.
      setRefus("Ce familier n'existe pas. Rechargez la page.");
      setEtape("confirmer");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const recu = tirage ? familierDe(tirage.familier.familier) : null;
  const ouverte = (etape === "ouvre" || etape === "revele") && recu !== null && carte !== null;
  return (
    <FenetreDuBooster titre={ouverte && etape === "revele" ? "Nouveau familier" : refus ? "Le booster reste fermé" : "Booster des familiers"} etape={ouverte ? "ouvre" : "confirmer"} occupe={etape === "envoi" || etape === "ouvre"} scene={ouverte} onFermer={onFermer} testid="dialogue-familiers">
      {ouverte && tirage && recu && carte ? (
        <OuvertureDuBooster sorte="familiers" carte={carte} revelee={etape === "revele"} onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}>
          <ResultatDuBooster
            nom={recu.nom}
            detail={
              <>
                <RareteEnPixels rarete={recu.rarete} />
                <Px t={nomDeLaTaille(recu)} couleur="doux" dit={nomDeLaTaille(recu)} />
              </>
            }
            testid="familiers-tirage"
          >
            <span hidden data-familier={recu.id} />
          </ResultatDuBooster>
          <ResteEnPixels solde={tirage.solde} />
          <p class="bst-mot">{tirage.reste > 0 ? `Encore ${tirage.reste} ${tirage.reste > 1 ? "familiers" : "familier"} à recevoir.` : "Vous les avez tous."}</p>
          <div class="bst-actions">
            {!dejaMontre(recu.id) && <BoutonDesBoosters t="Le montrer" dit="Le montrer à côté de mon Gaulois" or onClick={() => onMontrer(recu.id)} testid="familiers-montrer" />}
            <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="familiers-fermer" />
          </div>
          <a class="bst-lien" href={village} data-testid="familiers-vers-village">
            Voir au vestiaire
          </a>
        </OuvertureDuBooster>
      ) : (
        <ConfirmerLeBooster sorte="familiers" prix={prix} solde={depart} refus={refus} envoi={etape === "envoi"} onOuvrir={() => void envoyer()} onFermer={onFermer} testid="familiers" />
      )}
    </FenetreDuBooster>
  );
}
