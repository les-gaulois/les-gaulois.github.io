import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { carteDUnRendu, carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import type { PochetteBannieresReponse } from "../../lib/village/contrat";
import { idsDesBannieres } from "../../lib/village/ecran-bannieres";
import { nombre, pourcent } from "../../lib/village/ecran-boutique";
import { Px } from "../jeu/Pixels";
import { SceneDeLaBanniere as Scene, plusTard, type ProprietesDeLaFicheDesBannieres, type ProprietesDuBoosterDesBannieres } from "./Bannieres";
import { BoutonDesBoosters, ConfirmerLeBooster, FenetreDuBooster, FicheDuBooster, RareteEnPixels, RefusDuBooster, ResteEnPixels, ResultatDuBooster, type LigneDeChance } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";

/**
 * Ouvrir un booster des bannières : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis le joueur ouvre le
 * paquet et retourne la carte de ce que le serveur a tiré (`OuvertureDuBooster.tsx`, qui remplace le tambour depuis le 21
 * novembre 2026) : un trésor, ou des statères rendus (une carte sans rareté, à la lumière neutre). Dessous, le trésor en
 * grand derrière le Gaulois du membre, et de quoi le mettre sur /gaulois ; ou ce qui est rendu, et quelle part du prix. Si
 * le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les mots du refus et « Fermer ».
 */
export function DialoguePochetteBannieres({ lib, prix, solde, tenue, familier, ouvrir, montrer, dejaMontree, onFermer }: ProprietesDuBoosterDesBannieres) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "ouvre" | "revele" | "pose">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteBannieresReponse | null>(null);
  const [carte, setCarte] = useState<CarteDeScene | null>(null);
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  const envoyer = async () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    const recue = issue.ok && issue.valeur.banniere ? lib.banniereParId(issue.valeur.banniere.banniere) : null;
    if (issue.ok && recue) {
      setCarte(carteDeRarete(recue.nom, recue.rarete, lib.vignetteDeLaBanniere(recue.id)));
      setTirage(issue.valeur);
      setEtape("ouvre");
    } else if (issue.ok && issue.valeur.remboursement) {
      setCarte(carteDUnRendu(issue.valeur.remboursement.rendu, issue.valeur.remboursement.pourcent));
      setTirage(issue.valeur);
      setEtape("ouvre");
    } else {
      setRefus(issue.ok ? "Cette bannière n'existe pas. Rechargez la page." : issue.message);
      setEtape("confirmer");
    }
  };
  const recue = tirage?.banniere ? lib.banniereParId(tirage.banniere.banniere) : null;
  const rendu = tirage?.remboursement ?? null;
  const ouverte = etape === "ouvre" || etape === "revele" || etape === "pose";
  const revelee = etape === "revele" || etape === "pose";
  const fermer = () => onFermer(recue?.id ?? null);
  const poser = async () => {
    if (!recue) return;
    setEtape("pose");
    setRefus(null);
    const issue = await montrer(recue.id);
    if (issue.ok) fermer();
    else {
      setRefus(issue.message);
      setEtape("revele");
    }
  };
  return (
    <FenetreDuBooster titre={recue && revelee ? "Nouveau trésor" : rendu && revelee ? "Statères rendus" : refus ? "Le booster reste fermé" : "Booster des bannières"} etape={ouverte ? "ouvre" : "confirmer"} occupe={etape === "envoi" || etape === "pose" || etape === "ouvre"} scene={ouverte} onFermer={fermer} testid="dialogue-pochette-bannieres">
      {ouverte && tirage && carte && (recue || rendu) ? (
        <OuvertureDuBooster sorte="bannieres" carte={carte} revelee={revelee} onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}>
          {recue ? (
            <>
              <ResultatDuBooster nom={recue.nom} detail={<RareteEnPixels rarete={recue.rarete} />} testid="bannieres-pochette-tirage">
                <span hidden data-banniere={recue.id} />
              </ResultatDuBooster>
              <div class="banniere-fenetre bst-apercu-banniere" data-rarete={recue.rarete}>
                <Scene lib={lib} banniere={recue} tenue={tenue} familier={familier} class="banniere-scene-fenetre" />
              </div>
              <ResteEnPixels solde={tirage.solde} />
              <p class="bst-mot">{tirage.reste > 0 ? `Encore ${tirage.reste} ${tirage.reste > 1 ? "trésors" : "trésor"} à gagner.` : "Vous les avez tous."}</p>
              <div class="bst-actions">
                {!dejaMontree(recue.id) && <BoutonDesBoosters t={etape === "pose" ? "Enregistrement" : "Mettre sur /gaulois"} dit={etape === "pose" ? "Enregistrement en cours" : "Mettre sur /gaulois"} or disabled={etape === "pose"} onClick={() => void poser()} testid="bannieres-pochette-poser" />}
                <BoutonDesBoosters t="Fermer" disabled={etape === "pose"} onClick={fermer} testid="bannieres-pochette-fermer" />
              </div>
              <RefusDuBooster message={refus} />
            </>
          ) : rendu ? (
            <>
              <ResultatDuBooster
                nom={`+${nombre(rendu.rendu)} ${rendu.rendu > 1 ? "statères rendus" : "statère rendu"}`}
                detail={<Px t={`${pourcent(rendu.pourcent)} du prix`} couleur="doux" dit={`${pourcent(rendu.pourcent)} du prix du booster`} />}
                testid="bannieres-pochette-rendu-recu"
              />
              <ResteEnPixels solde={tirage.solde} />
              <p class="bst-mot">Pas de trésor cette fois.</p>
              <div class="bst-actions">
                <BoutonDesBoosters t="Fermer" onClick={fermer} testid="bannieres-pochette-fermer" />
              </div>
            </>
          ) : null}
        </OuvertureDuBooster>
      ) : (
        <ConfirmerLeBooster sorte="bannieres" prix={prix} solde={depart} refus={refus} envoi={etape === "envoi"} onOuvrir={() => void envoyer()} onFermer={fermer} testid="bannieres-pochette" />
      )}
    </FenetreDuBooster>
  );
}

/**
 * Le booster des bannières, sous l'étal (fiche du kit, `FicheDuBooster`) : la seule façon d'avoir un trésor du booster. Son
 * paquet, son prix (celui du serveur), combien de trésors le compte a, le bouton ou la raison, puis ses chances, toujours
 * écrites avant d'ouvrir (la part des boosters qui rendent des statères, puis chaque rareté, 100 en tout). Le paquet ouvre
 * l'album de ses trésors (`AlbumPochette.tsx`), chacun avec sa chance.
 */
export function FicheDesBannieres({ lib, mes, possedees, raison, gagnees, onOuvrir }: ProprietesDeLaFicheDesBannieres) {
  const pochette = mes.pochette;
  // Les chances à chaque booster : celles du serveur, ramenées à la part des boosters qui donnent un trésor.
  const chances = useMemo(() => lib.chancesDUnTresor(pochette), [lib, pochette]);
  const lignes = lib.lignesDesChancesDesTresors(chances, possedees);
  const aMoi = lib.TRESORS.filter((b) => possedees.has(b.id)).length;
  const rendus = lib.rendusDesPaliers(pochette.prix, pochette.paliers);
  // La part des statères rendus pour ce compte : celle du serveur, plus les chances des raretés où il a tout.
  const chanceRendus = lib.chanceDesStateresRendus(pochette, possedees) ?? 0;
  const rembourse = chanceRendus > 1e-9 && rendus.length > 0;
  // L'album se calcule sur les bannières reçues du serveur (un nouvel ensemble à chaque rendu ne le recalculerait pas).
  const lireAlbum = useCallback(() => lib.albumDesTresors(chances, idsDesBannieres(mes)), [lib, chances, mes]);
  // Les trésors se peignent en arrière-plan, un par tour de la boucle : au premier survol, l'album les trouve prêts.
  useEffect(() => {
    for (const tresor of lib.TRESORS) plusTard(() => void lib.dessinDeLaBanniere(tresor.id));
  }, [lib]);
  const lignesDuKit: LigneDeChance[] | null = lignes
    ? [...(rembourse ? [{ kind: "rendu" as const, etendue: `de ${nombre(Math.min(...rendus))} à ${nombre(Math.max(...rendus))}`, chance: pourcent(chanceRendus) }] : []), ...lignes.map(({ rarete, chance, reste }) => ({ kind: "rarete" as const, rarete, chance: reste > 0 ? pourcent(chance) : null, touteA: "toutes à vous" }))]
    : null;
  return (
    <FicheDuBooster
      sorte="bannieres"
      nom="Booster des bannières"
      testid="bannieres-pochette"
      album={{ lireAlbum, nombre: lib.TRESORS.length, nom: "Voir les trésors du booster des bannières" }}
      contenu={`${lib.TRESORS.length} trésors`}
      prix={pochette.prix}
      compte={`${aMoi} sur ${lib.TRESORS.length} trésors à vous`}
      gagnees={gagnees}
      raison={raison}
      onOuvrir={onOuvrir}
      lignes={lignesDuKit}
      regle={<p>Les trésors du booster ne s'obtiennent qu'ici, jamais à la boutique. Le booster ne donne jamais une bannière que vous avez déjà.</p>}
    />
  );
}
