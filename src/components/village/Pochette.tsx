import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Objet, RareteDObjet as Rarete, Vignette } from "../../lib/gaulois";
import { carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { cleDeLObjet } from "../../lib/village/fonds-objets";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import { albumDeLaPochetteSurprise, nombreDansLaPochetteSurprise } from "../../lib/village/album-pochette";
import type { MaBoutique, PochetteReponse } from "../../lib/village/contrat";
import { chancesDeLaPochette, manque, pourcent, stateres } from "../../lib/village/ecran-boutique";
import type { Issue } from "./BoutiqueDialogue";
import { feterLObjet } from "./Cases";
import { BoutonDesBoosters, ConfirmerLeBooster, FenetreDuBooster, FicheDuBooster, ResteEnPixels } from "./KitDesBoosters";
import { OuvertureDuBooster } from "./OuvertureDuBooster";
import { CarteDeCosmetique } from "./CarteDeCosmetique";

/**
 * Le booster surprise, sous l'étal (fiche du kit, `FicheDuBooster`) : son paquet, qui ouvre l'album des objets qu'il peut
 * donner (`AlbumPochette.tsx`), son prix, et ses chances par rareté, toujours écrites avant d'ouvrir, telles que le serveur
 * les donne. `fermee` : pourquoi ce compte ne peut pas encore acheter, s'il ne le peut pas. `gagnees` : les boosters
 * surprises gagnés à la loterie, qui s'ouvrent sans payer.
 */
export function Pochette({ boutique, solde, fermee, gagnees = 0, onOuvrir }: { boutique: MaBoutique; solde: number; fermee: string | null; gagnees?: number; onOuvrir: () => void }) {
  const { prix, chances } = boutique.pochette;
  const il_manque = manque(solde, prix);
  const raison = fermee ?? (il_manque > 0 ? `Il vous manque ${stateres(il_manque)}.` : null);
  const lireAlbum = useCallback(() => albumDeLaPochetteSurprise(chances, boutique.inventaire), [chances, boutique.inventaire]);
  const nombre = nombreDansLaPochetteSurprise(chances);
  return (
    <FicheDuBooster
      sorte="surprise"
      nom="Booster surprise"
      testid="pochette"
      album={{ lireAlbum, nombre, nom: "Voir ce que contient le booster surprise" }}
      contenu={`${nombre} objets`}
      prix={prix}
      gagnees={gagnees}
      raison={raison}
      onOuvrir={onOuvrir}
      lignes={chancesDeLaPochette(chances).map(({ rarete, chance }) => ({ kind: "rarete" as const, rarete, chance: pourcent(chance) }))}
      regle={<p>Un objet déjà possédé peut sortir : un double se vend au marché, à une demande ou au jeu.</p>}
    />
  );
}

/**
 * Ouvrir un booster surprise : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis le joueur ouvre le
 * paquet et retourne la carte de l'objet que le serveur a tiré (`OuvertureDuBooster.tsx`, l'animation validée par le pilote
 * le 21 novembre 2026, qui remplace le tambour des pochettes). Une fois la carte retournée et sa fête passée, la grande
 * carte de l'objet, avec tout ce qu'il dit (22 novembre 2026), prend la place de la scène ; dessous, la bourse, le choix
 * d'un double et « Le porter ». L'animation ne fait que montrer ce que le serveur a déjà tiré.
 */
export function DialoguePochette({
  prix,
  solde,
  ouvrir,
  objetDe,
  vignetteDe,
  dejaPorte,
  onPorter,
  suiteDuDouble,
  onFermer,
}: {
  prix: number;
  solde: number;
  ouvrir: () => Promise<Issue<PochetteReponse>>;
  objetDe: (tire: PochetteReponse["objet"]) => Objet | undefined;
  vignetteDe: (tire: PochetteReponse["objet"]) => Vignette | null;
  dejaPorte: (tire: PochetteReponse["objet"]) => boolean;
  onPorter: (tire: PochetteReponse["objet"]) => void;
  /** Ce qu'un double peut devenir (19 novembre 2026) : le vendre à une demande, au marché, ou au jeu. Sans elle, une phrase. */
  suiteDuDouble?: (tire: PochetteReponse["objet"]) => ComponentChildren;
  onFermer: () => void;
}) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "ouvre" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteReponse | null>(null);
  const [carte, setCarte] = useState<CarteDeScene | null>(null);
  const [depart] = useState(solde);
  const envoyer = async () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    if (issue.ok) {
      const tire = issue.valeur.objet;
      setCarte(carteDeRarete(objetDe(tire)?.nom ?? "Objet", tire.rarete, vignetteDe(tire), { cle: cleDeLObjet(tire.emplacement, tire.objet) }));
      setTirage(issue.valeur);
      setEtape("ouvre");
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
  const ouverte = etape === "ouvre" || etape === "revele";
  const titre = etape === "revele" && tire ? (tire.double ? "Un double" : "Nouvel objet") : refus ? "Le booster reste fermé" : "Booster surprise";
  return (
    <FenetreDuBooster titre={titre} etape={ouverte ? "ouvre" : "confirmer"} occupe={etape === "envoi" || etape === "ouvre"} scene={ouverte} onFermer={onFermer} testid="dialogue-pochette">
      {ouverte && tirage && tire && objet && carte ? (
        <OuvertureDuBooster
          sorte="surprise"
          carte={carte}
          revelee={etape === "revele"}
          onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}
          carteFinale={<CarteDeCosmetique nom={objet.nom} rarete={tire.rarete} dessin={vignetteDe(tire)} cle={cleDeLObjet(tire.emplacement, tire.objet)} grande testid="pochette-tirage" />}
        >
          {/* La carte dit tout (nom, rareté, effets) : dessous, la bourse et les boutons seulement. */}
          <span hidden data-objet={`${tire.emplacement}/${tire.objet}`} />
          <ResteEnPixels solde={tirage.solde} />
          {tire.double &&
            (suiteDuDouble ? (
              suiteDuDouble(tire)
            ) : (
              <p class="bst-mot" data-testid="pochette-double">
                Vous l'aviez déjà : ce double se vend au marché.
              </p>
            ))}
          <div class="bst-actions">
            {!dejaPorte(tire) && <BoutonDesBoosters t="Le porter" or onClick={() => onPorter(tire)} testid="pochette-porter" />}
            <BoutonDesBoosters t={tire.double ? "Le garder" : "Fermer"} dit={tire.double ? "Le garder et fermer" : "Fermer"} onClick={onFermer} testid="pochette-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : (
        <ConfirmerLeBooster sorte="surprise" prix={prix} solde={depart} refus={refus} envoi={etape === "envoi"} onOuvrir={() => void envoyer()} onFermer={onFermer} testid="pochette" />
      )}
    </FenetreDuBooster>
  );
}
