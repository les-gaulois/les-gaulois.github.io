import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { fmtInt } from "../../lib/format";
import { NOMS_EMPLACEMENTS } from "../../lib/gaulois";
import {
  emplacementsEnVente,
  finDeLOffre,
  lireBoutique,
  lireMarche,
  mesOffres,
  messageDuMarche,
  offresAAcheter,
  type BoutiqueLue,
  type FiltreDuMarche,
  type MarcheLu,
  type OffreLisible,
  type PossedeLisible,
} from "../../lib/village/ecran-marche";
import { Loading, Problem, Success, messageOf, useNow } from "../compte/common";
import { CaseObjet, Piece, Prix } from "./MarcheCase";
import { DialogueAchat, DialogueVente } from "./MarcheDialogues";

/** Le refus du serveur, dans les mots du marché quand il en a. */
const mots = (e: unknown): string => (e instanceof ServerError ? (messageDuMarche(e.code) ?? e.message) : messageOf(e));

/** Une offre : la case de l'objet, son prix, son vendeur, sa fin, et le bouton pour l'acheter ou la retirer. */
function Offre({ offre, maintenant, occupe, onAction }: { offre: OffreLisible; maintenant: Date; occupe: boolean; onAction: () => void }) {
  return (
    <li class="marche-offre" data-testid={offre.a_moi ? "marche-mon-offre" : "marche-offre"}>
      <CaseObjet objet={offre} />
      <Prix valeur={offre.prix} class="marche-offre-prix" />
      {!offre.a_moi && <span class="marche-offre-vendeur">Vendu par {offre.vendeur}</span>}
      <span class="marche-offre-fin">{finDeLOffre(offre.expire_le, maintenant)}</span>
      <button type="button" class="btn btn-ghost marche-offre-bouton" disabled={occupe} onClick={onAction} aria-label={`${offre.a_moi ? "Retirer" : "Acheter"} « ${offre.nom} », ${fmtInt(offre.prix)} statères`}>
        {offre.a_moi ? "Retirer" : "Acheter"}
      </button>
    </li>
  );
}

type Etat = { kind: "lecture" } | { kind: "ferme"; message: string } | { kind: "erreur"; message: string } | { kind: "pret"; marche: MarcheLu };

/**
 * Le marché du village : les membres validés s'y vendent les objets de leur inventaire, en statères. Le serveur décide de
 * tout (`get_marche`, `mettre_en_vente`, `retirer_offre`, `acheter_offre`, qui répondent le marché à jour) ; l'inventaire
 * et les prix de la boutique viennent de `get_ma_boutique`. `actif` : l'onglet est ouvert ; le marché se relit à chaque
 * ouverture.
 */
export default function MarcheDuVillage({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [boutique, setBoutique] = useState<BoutiqueLue | null>(null);
  const [filtre, setFiltre] = useState<FiltreDuMarche>("tout");
  const [achat, setAchat] = useState<OffreLisible | null>(null);
  const [vente, setVente] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [problemeFenetre, setProblemeFenetre] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const maintenant = useNow();

  const recevoir = (reponse: unknown) => {
    const marche = lireMarche(reponse);
    if (!marche) throw new ServerError("network");
    setEtat({ kind: "pret", marche });
  };
  // L'inventaire et les prix : sans eux, le marché se lit et s'achète quand même ; seule la vente attend.
  const lireInventaire = async () => {
    try {
      setBoutique(lireBoutique(await call<unknown>("get_ma_boutique")));
    } catch {
      setBoutique(null);
    }
  };
  const lire = async (discret: boolean) => {
    if (!discret) setEtat({ kind: "lecture" });
    try {
      recevoir(await call<unknown>("get_marche"));
      void lireInventaire();
    } catch (e) {
      if (e instanceof ServerError && e.code === "not_validated") setEtat({ kind: "ferme", message: mots(e) });
      else if (!discret) setEtat({ kind: "erreur", message: mots(e) });
    }
  };

  const dejaLu = useRef(false);
  useEffect(() => {
    if (!actif) return;
    void lire(dejaLu.current);
    dejaLu.current = true;
  }, [actif]);

  /** Une action du marché : le serveur répond le marché à jour. `dansFenetre` : le refus s'écrit dans la fenêtre ouverte. */
  const agir = async (fonction: string, args: Record<string, unknown>, fait: string, dansFenetre: boolean): Promise<void> => {
    setOccupe(true);
    setProbleme(null);
    setProblemeFenetre(null);
    setReussite(null);
    try {
      recevoir(await call<unknown>(fonction, args));
      setAchat(null);
      setVente(false);
      setReussite(fait);
      void lireInventaire();
    } catch (e) {
      (dansFenetre ? setProblemeFenetre : setProbleme)(mots(e));
      // L'offre a pu partir entre-temps : le marché se relit derrière le message.
      void lire(true);
    } finally {
      setOccupe(false);
    }
  };

  const fermer = () => {
    setAchat(null);
    setVente(false);
    setProblemeFenetre(null);
  };

  if (etat.kind === "lecture") return <Loading label="Lecture du marché…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire(false)} />;
  if (etat.kind === "ferme") {
    return (
      <p class="marche-mot" data-testid="marche-ferme">
        {etat.message}
      </p>
    );
  }

  const { marche } = etat;
  const miennes = mesOffres(marche.offres);
  const filtres = emplacementsEnVente(marche.offres);
  const choisi: FiltreDuMarche = filtre !== "tout" && filtres.includes(filtre) ? filtre : "tout";
  const offres = offresAAcheter(marche.offres, choisi);
  const vendre = (objet: PossedeLisible, prix: number) => void agir("mettre_en_vente", { p_emplacement: objet.emplacement, p_objet: objet.objet, p_prix: prix }, `« ${objet.nom} » est en vente.`, true);

  return (
    <div class="marche" data-testid="marche">
      <div class="marche-tete">
        <p class="marche-solde" data-testid="marche-solde">
          <span class="sr-only">Votre solde : </span>
          <Piece taille={24} />
          <strong class="tnum">{fmtInt(marche.solde)}</strong>{" "}
          {marche.solde > 1 ? "statères" : "statère"}
        </p>
        <div>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              setProblemeFenetre(null);
              setVente(true);
            }}
            data-testid="marche-vendre"
          >
            Vendre un objet
          </button>
        </div>
      </div>
      <Success message={reussite} />
      <Problem message={probleme} />

      {miennes.length > 0 && (
        <section class="marche-partie" aria-labelledby="marche-miennes">
          <h3 id="marche-miennes" class="marche-titre">
            Vos offres
            <span class="info-discrete">
              {fmtInt(miennes.length)} sur {fmtInt(marche.offresMax)}
            </span>
          </h3>
          <ul class="marche-offres" data-testid="marche-mes-offres">
            {miennes.map((offre) => (
              <Offre key={offre.id} offre={offre} maintenant={maintenant} occupe={occupe} onAction={() => void agir("retirer_offre", { p_id: offre.id }, `« ${offre.nom} » est revenu dans votre inventaire.`, false)} />
            ))}
          </ul>
        </section>
      )}

      <section class="marche-partie" aria-labelledby="marche-a-vendre">
        <h3 id="marche-a-vendre" class="marche-titre">
          À vendre
        </h3>
        {filtres.length > 1 && (
          <div class="marche-filtres" role="group" aria-label="Montrer">
            <button type="button" class="chip" aria-pressed={choisi === "tout"} onClick={() => setFiltre("tout")}>
              Tout
            </button>
            {filtres.map((emplacement) => (
              <button key={emplacement} type="button" class="chip" aria-pressed={choisi === emplacement} onClick={() => setFiltre(emplacement)}>
                {NOMS_EMPLACEMENTS[emplacement]}
              </button>
            ))}
          </div>
        )}
        {offres.length > 0 ? (
          <ul class="marche-offres" data-testid="marche-offres">
            {offres.map((offre) => (
              <Offre
                key={offre.id}
                offre={offre}
                maintenant={maintenant}
                occupe={occupe}
                onAction={() => {
                  setProblemeFenetre(null);
                  setAchat(offre);
                }}
              />
            ))}
          </ul>
        ) : (
          <p class="marche-mot" data-testid="marche-vide">
            Rien à vendre.
          </p>
        )}
      </section>

      {achat && (
        <DialogueAchat
          offre={achat}
          solde={marche.solde}
          boutique={boutique}
          occupe={occupe}
          probleme={problemeFenetre}
          onAcheter={() => void agir("acheter_offre", { p_id: achat.id }, `« ${achat.nom} » est dans votre inventaire.`, true)}
          onFermer={fermer}
        />
      )}
      {vente && <DialogueVente boutique={boutique} offresOuvertes={miennes.length} offresMax={marche.offresMax} occupe={occupe} probleme={problemeFenetre} onVendre={vendre} onFermer={fermer} />}
    </div>
  );
}
