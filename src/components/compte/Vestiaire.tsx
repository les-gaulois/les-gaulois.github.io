import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import {
  EMPLACEMENTS_OBJETS,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  PEAUX,
  POILS,
  RETOUR_VILLAGE_KEY,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  decrireGaulois,
  memeTenue,
  tenueAuHasard,
  tenueDuServeur,
  vignetteDeLObjet,
  type Emplacement,
  type Objet,
  type Tenue,
  type Vignette,
} from "../../lib/gaulois";
import type { MesStateres } from "../../lib/stateres";
import type { MaBoutique, PochetteReponse } from "../../lib/village/contrat";
import {
  avecUnExemplaire,
  lireAchat,
  lireBoutique,
  lirePochette,
  lireStateres,
  manque,
  messageDuRefus,
  objetPayant,
  prixDeLObjet,
  quantitePossedee,
  raisonBoutiqueFermee,
  stateres,
} from "../../lib/village/ecran-boutique";
import { Bourse } from "../village/Bourse";
import { DialogueAchat, DialoguePochette, type Issue } from "../village/BoutiqueDialogue";
import { MarqueDeRarete, Pixels, Prix, peindre } from "../village/BoutiquePixels";
import { Pochette } from "../village/Pochette";
import { CodeLogin, DiscordButton, Loading, Problem, Success, codeLoginShown, messageOf, useMe } from "./common";

/** Le Gaulois dessiné case par case, agrandi sans flou par la feuille de style. Son texte de remplacement le décrit. */
export function ApercuGaulois({ tenue, class: classe = "" }: { tenue: Tenue; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, casesDuGaulois(tenue)), [tenue]);
  return <canvas ref={toile} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} class={`gaulois-apercu ${classe}`} role="img" aria-label={decrireGaulois(tenue)} data-testid="gaulois-apercu" />;
}

/** Le côté, en pixels, de la place réservée à l'image dans une case : la vignette s'y agrandit d'un nombre entier de fois. */
const COTE_IMAGE = 80;

/** L'image d'une case : décorative, le nom de la case est écrit dessous. Une case du dessin vaut 1, 2 ou 3 pixels. */
function ImageDeCase({ vignette }: { vignette: Vignette }) {
  const echelle = Math.max(1, Math.min(3, Math.floor(COTE_IMAGE / Math.max(vignette.largeur, vignette.hauteur))));
  return <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="case-dessin" />;
}

/** Le visage du Gaulois, pour les cases des cheveux et de la barbe : un carré de 40 cases pris dans le dessin entier. */
function portrait(tenue: Tenue, haut: number): Vignette {
  const cote = 40;
  const gauche = (GAULOIS_LARGEUR - cote) / 2;
  const entier = casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" });
  const cases: (string | null)[] = [];
  for (let y = haut; y < haut + cote; y++) for (let x = gauche; x < gauche + cote; x++) cases.push(entier[y * GAULOIS_LARGEUR + x] ?? null);
  return { largeur: cote, hauteur: cote, cases };
}

/** Noté juste avant de partir vers Discord : la page de compte, où Discord ramène, renvoie alors au village. */
function noterLeRetour(): void {
  try {
    sessionStorage.setItem(RETOUR_VILLAGE_KEY, String(Date.now()));
  } catch {
    // Stockage refusé : la connexion se fait quand même, le joueur revient au village par le menu.
  }
}

/** Le cadenas d'une case de la boutique, tant que ses prix ne sont pas connus. */
function Cadenas() {
  return (
    <svg class="case-cadenas" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0z" fill="currentColor" />
    </svg>
  );
}

/** Ce que la boutique dit d'une case : son prix (`null` tant que les prix manquent), ou le nombre d'exemplaires possédés. */
type Vente = { possede: number } | { prix: number | null };

/**
 * Une case : l'image de l'objet, son nom, sa rareté écrite et comptée en losanges (la couleur du cadre n'est jamais le seul
 * repère). Une case de la boutique porte son prix : elle s'essaie sur le Gaulois, elle ne se porte qu'une fois achetée.
 * Une case achetée porte la marque « à vous ». `portee` et `essayee` se disent à part : pendant un essayage, l'objet
 * réellement porté garde sa coche.
 */
function Case({ objet, vignette, portee, essayee = false, vente, onClick }: { objet: Objet; vignette: Vignette | null; portee: boolean; essayee?: boolean; vente?: Vente | undefined; onClick: () => void }) {
  const aVendre = vente && "prix" in vente ? vente : null;
  const possede = vente && "possede" in vente ? vente.possede : 0;
  return (
    <button type="button" class="case" data-rarete={objet.rarete ?? "aucune"} data-boutique={aVendre ? "" : undefined} data-etat={essayee ? "essayee" : portee ? "portee" : "libre"} aria-pressed={portee || essayee} onClick={onClick}>
      <span class="case-image">{vignette ? <ImageDeCase vignette={vignette} /> : <span class="case-rien" aria-hidden="true" />}</span>
      <span class="case-nom">{objet.nom}</span>
      {objet.rarete && <MarqueDeRarete rarete={objet.rarete} />}
      {possede > 0 && (
        <span class="case-marque" data-testid="case-a-vous">
          <span class="sr-only">, </span>à vous{possede > 1 && <span aria-hidden="true"> × {possede}</span>}
          {possede > 1 && <span class="sr-only">, {possede} exemplaires</span>}
        </span>
      )}
      {aVendre && (
        <>
          <span class="sr-only">, à la boutique, </span>
          {aVendre.prix === null ? <Cadenas /> : <Prix montant={aVendre.prix} class="case-prix" />}
          <span class="sr-only">, à essayer</span>
        </>
      )}
      {essayee && (
        <span class="case-essai">
          <span class="sr-only">, en </span>essai
        </span>
      )}
    </button>
  );
}

/** Une pastille de couleur, son nom à côté : la couleur n'est jamais le seul repère. */
function Pastille({ nom, couleur, choisie, onClick }: { nom: string; couleur: string; choisie: boolean; onClick: () => void }) {
  return (
    <button type="button" class="vestiaire-teinte" aria-pressed={choisie} onClick={onClick}>
      <span class="vestiaire-teinte-rond" style={{ background: couleur }} aria-hidden="true" />
      {nom}
    </button>
  );
}

/** Un objet essayé : il se voit sur le Gaulois, il n'entre pas dans la tenue. */
interface Essai {
  emplacement: Emplacement;
  id: string;
}

interface Choix {
  tenue: Tenue;
  essai: Essai | null;
  boutique: MaBoutique | null;
  onChange: (tenue: Tenue) => void;
  onEssai: (essai: Essai | null) => void;
}

/** Le titre d'une partie du vestiaire et son contenu. */
function Partie({ emplacement, children }: { emplacement: Emplacement; children: ComponentChildren }) {
  return (
    <div class="vestiaire-emplacement" data-testid={`vestiaire-${emplacement}`}>
      <p id={`vestiaire-${emplacement}`} class="nom-champ vestiaire-titre">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      {children}
    </div>
  );
}

/** La peau : une pastille par couleur. */
function Peau({ tenue, onChange }: Choix) {
  return (
    <Partie emplacement="peau">
      <div class="vestiaire-pastilles" role="group" aria-labelledby="vestiaire-peau">
        {Object.entries(PEAUX).map(([id, peau]) => (
          <Pastille key={id} nom={peau.nom} couleur={peau.couleurs.s} choisie={tenue["peau"] === id} onClick={() => onChange(changerObjet(tenue, "peau", id))} />
        ))}
      </div>
    </Partie>
  );
}

/** Les cheveux ou la barbe : une case par coupe, avec le visage du Gaulois ; pour les cheveux, leur couleur dessous. */
function Poils({ emplacement, tenue, onChange }: Choix & { emplacement: "cheveux" | "barbe" }) {
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={portrait(changerObjet(tenue, emplacement, id), emplacement === "cheveux" ? 2 : 8)} portee={tenue[emplacement] === id} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
      {emplacement === "cheveux" && (
        <div class="vestiaire-pastilles" role="group" aria-label="Couleur des cheveux et de la barbe">
          {Object.entries(POILS).map(([id, poils]) => (
            <Pastille key={id} nom={poils.nom} couleur={poils.couleurs.h} choisie={tenue[TEINTE_CHEVEUX] === id} onClick={() => onChange({ ...tenue, [TEINTE_CHEVEUX]: id })} />
          ))}
        </div>
      )}
    </Partie>
  );
}

/**
 * Les objets d'un emplacement : ceux qui se portent (les gratuits et ceux que le membre possède), puis ceux de la boutique,
 * de la rareté la plus courante à la plus rare, chacun à son prix.
 */
function Objets({ emplacement, tenue, essai, boutique, onChange, onEssai }: Choix & { emplacement: Emplacement }) {
  const objets = Object.entries(OBJETS[emplacement]);
  const essaye = essai?.emplacement === emplacement ? essai.id : null;
  const possede = (id: string): number => (boutique ? quantitePossedee(boutique.inventaire, emplacement, id) : 0);
  const aMoi = ([id, objet]: [string, Objet]): boolean => objet.gratuit || possede(id) > 0;
  const cases = (liste: [string, Objet][]) =>
    liste.map(([id, objet]) => {
      const libre = aMoi([id, objet]);
      const porte = tenue[emplacement] === id;
      return (
        <Case
          key={id}
          objet={objet}
          vignette={vignetteDeLObjet(emplacement, id, tenue)}
          portee={porte}
          essayee={essaye === id}
          vente={objet.gratuit ? undefined : libre ? { possede: possede(id) } : { prix: prixDeLObjet(boutique?.prix, emplacement, id) }}
          onClick={() => {
            if (libre) onChange(changerObjet(tenue, emplacement, id));
            else if (!porte) onEssai(essaye === id ? null : { emplacement, id });
          }}
        />
      );
    });
  const aVendre = objets.filter((entree) => !aMoi(entree));
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {cases(objets.filter(aMoi))}
      </div>
      {aVendre.length > 0 && (
        <>
          <p id={`boutique-${emplacement}`} class="vestiaire-boutique">
            Boutique
          </p>
          <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement} boutique-${emplacement}`}>
            {cases(aVendre)}
          </div>
        </>
      )}
    </Partie>
  );
}

type Etat = { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "pret"; enregistree: Tenue | null };
type Fenetre = { kind: "achat"; emplacement: Emplacement; id: string; prix: number } | { kind: "pochette" } | null;

const refusDe = (e: unknown): string => (e instanceof ServerError ? e.code : "network");
const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/**
 * « Mon Gaulois », sur `/village` : le visiteur voit le Gaulois de départ et la porte ; un compte lié à Discord habille le
 * sien, lit sa bourse de statères, achète à la boutique et ouvre une pochette surprise. Le serveur décide de tout (tenue,
 * prix, solde, tirage) : l'écran ne fait que proposer et montrer ce qu'il a reçu. Sans réponse de la boutique, le
 * vestiaire reste entier, avec ses cases verrouillées.
 */
export default function Vestiaire() {
  const { me, refresh } = useMe();
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [essai, setEssai] = useState<Essai | null>(null);
  const [bourse, setBourse] = useState<MesStateres | null>(null);
  const [boutique, setBoutique] = useState<MaBoutique | null>(null);
  const [panne, setPanne] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [annonce, setAnnonce] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);

  /** La bourse et la boutique, relues ensemble : l'une sans l'autre ne bloque rien, le vestiaire reste. */
  const lireLaBoutique = async (): Promise<MaBoutique | null> => {
    const [b, s] = await Promise.all([
      call<unknown>("get_ma_boutique").then(lireBoutique, () => null),
      call<unknown>("get_mes_stateres").then(lireStateres, () => null),
    ]);
    setBoutique(b);
    setBourse(s);
    setPanne(!b || !s);
    return b;
  };

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const [reponse] = await Promise.all([call<unknown>("get_mon_gaulois"), lireLaBoutique()]);
      const enregistree = tenueDuServeur(reponse);
      setEtat({ kind: "pret", enregistree });
      if (enregistree) setTenue(enregistree);
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (me?.signed_in) void lire();
  }, [me?.signed_in]);

  const changer = (suite: Tenue) => {
    setTenue(suite);
    setEssai(null);
    setReussite(null);
    setProbleme(null);
  };

  const enregistrer = async () => {
    const creation = etat.kind === "pret" && !etat.enregistree;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: tenue }));
      setEtat({ kind: "pret", enregistree });
      setReussite("Votre Gaulois est enregistré. Tapez /gaulois dans le Discord du clan pour le montrer.");
      // Un Gaulois tout juste créé reçoit ses statères du mois et ouvre la boutique : on relit.
      if (creation) await lireLaBoutique();
    } catch (e) {
      setProbleme(messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  /** Après un refus, la boutique est relue : le message dit ce qui manque d'après le solde du serveur, pas d'après l'écran. */
  const refuser = async (e: unknown, prix: number): Promise<Issue<never>> => {
    const fraiche = await call<unknown>("get_ma_boutique").then(lireBoutique, () => null);
    if (fraiche) setBoutique(fraiche);
    return { ok: false, message: messageDuRefus(refusDe(e), { manque: fraiche ? manque(fraiche.solde, prix) : null }) };
  };

  const acheter = async (emplacement: Emplacement, id: string, prix: number): Promise<Issue<number>> => {
    try {
      const achat = lireAchat(await call<unknown>("acheter_objet", { p_emplacement: emplacement, p_objet: id }));
      if (!achat) return { ok: false, message: ILLISIBLE };
      setBoutique((b) => b && { ...b, solde: achat.solde, inventaire: avecUnExemplaire(b.inventaire, achat.objet, "achat", new Date().toISOString()) });
      setEssai(null);
      setAnnonce(`${OBJETS[emplacement][id]?.nom ?? "Objet"} acheté. Il vous reste ${stateres(achat.solde)}.`);
      return { ok: true, valeur: achat.solde };
    } catch (e) {
      return refuser(e, prix);
    }
  };

  const ouvrirPochette = async (prix: number): Promise<Issue<PochetteReponse>> => {
    try {
      const tirage = lirePochette(await call<unknown>("ouvrir_pochette"));
      if (!tirage) return { ok: false, message: ILLISIBLE };
      setBoutique((b) => b && { ...b, solde: tirage.solde, inventaire: avecUnExemplaire(b.inventaire, tirage.objet, "pochette", new Date().toISOString()) });
      setAnnonce(`Pochette ouverte. Il vous reste ${stateres(tirage.solde)}.`);
      return { ok: true, valeur: tirage };
    } catch (e) {
      return refuser(e, prix);
    }
  };

  const porter = (emplacement: Emplacement, id: string) => {
    changer(changerObjet(tenue, emplacement, id));
    setFenetre(null);
  };

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <div class="vestiaire" data-testid="vestiaire-porte">
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
        <div class="vestiaire-porte">
          <p class="text-lg">Connectez-vous pour habiller votre Gaulois.</p>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" avant={noterLeRetour} />
          </div>
          {codeLoginShown() && (
            <div class="mt-6">
              <CodeLogin connecte={() => void refresh()} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (etat.kind === "lecture") return <Loading label="Lecture de votre Gaulois…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire()} />;

  const change = !memeTenue(tenue, etat.enregistree);
  const essaye = essai ? OBJETS[essai.emplacement][essai.id] : undefined;
  const prixEssai = essai ? prixDeLObjet(boutique?.prix, essai.emplacement, essai.id) : null;
  const fermee = boutique && !boutique.peut_acheter ? raisonBoutiqueFermee(etat.enregistree !== null) : null;
  const manqueEssai = boutique && prixEssai !== null ? manque(boutique.solde, prixEssai) : 0;
  const raisonEssai = fermee ?? (manqueEssai > 0 ? `Il vous manque ${stateres(manqueEssai)}.` : null);
  const choix: Choix = { tenue, essai, boutique, onChange: changer, onEssai: setEssai };
  const achat = fenetre?.kind === "achat" ? objetPayant(fenetre.emplacement, fenetre.id) : null;
  return (
    <div class="vestiaire" data-testid="vestiaire">
      <div class="vestiaire-scene">
        <ApercuGaulois tenue={essai ? changerObjet(tenue, essai.emplacement, essai.id) : tenue} />
        <div class="vestiaire-scene-actions">
          <button type="button" class="btn btn-ghost" onClick={() => changer(tenueAuHasard(Math.random))}>
            Au hasard
          </button>
          <div class="vestiaire-essai" role="status" data-testid="vestiaire-essai">
            {essai && essaye && (
              <>
                <span>
                  Essayage : <strong>{essaye.nom}</strong>
                </span>
                {prixEssai !== null && <Prix montant={prixEssai} class="vestiaire-essai-prix" />}
                {raisonEssai && (
                  <span class="vestiaire-essai-raison" data-testid="boutique-raison">
                    {raisonEssai}
                  </span>
                )}
                <span class="vestiaire-essai-actions">
                  {boutique && prixEssai !== null && !raisonEssai && (
                    <button type="button" class="chip chip-fort" onClick={() => setFenetre({ kind: "achat", emplacement: essai.emplacement, id: essai.id, prix: prixEssai })} data-testid="boutique-acheter">
                      Acheter
                    </button>
                  )}
                  <button type="button" class="chip" onClick={() => setEssai(null)}>
                    Retirer
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div class="vestiaire-colonne">
        {(bourse || boutique) && (
          <div class="boutique-tete">
            {bourse && <Bourse bourse={bourse} solde={boutique?.solde ?? null} />}
            {boutique && <Pochette boutique={boutique} solde={boutique.solde} fermee={fermee} onOuvrir={() => setFenetre({ kind: "pochette" })} />}
          </div>
        )}
        {panne && (
          <div data-testid="boutique-panne">
            <Problem message={bourse || boutique ? "Une partie de la boutique ne répond pas pour l'instant." : "La bourse et la boutique ne répondent pas pour l'instant."} onRetry={() => void lireLaBoutique()} />
          </div>
        )}
        <form
          class="vestiaire-choix"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <Peau {...choix} />
          <Poils emplacement="cheveux" {...choix} />
          <Poils emplacement="barbe" {...choix} />
          {EMPLACEMENTS_OBJETS.map((emplacement) => (
            <Objets key={emplacement} emplacement={emplacement} {...choix} />
          ))}
          <div class="vestiaire-envoi" data-colle={change ? "" : undefined}>
            {change && essaye && (
              <p class="vestiaire-bloque" data-testid="vestiaire-bloque">
                Vous essayez {essaye.nom}, qui n'est pas à vous : achetez-le ou retirez-le pour enregistrer.
              </p>
            )}
            <div class="vestiaire-envoi-boutons">
              <button type="submit" class="btn btn-primary btn-lg" disabled={occupe || !change || essai !== null} data-testid="vestiaire-enregistrer">
                {occupe ? "Enregistrement…" : etat.enregistree ? "Enregistrer ma tenue" : "Créer mon Gaulois"}
              </button>
              {change && etat.enregistree && (
                <button type="button" class="btn btn-ghost" onClick={() => changer(etat.enregistree ?? TENUE_DE_DEPART)}>
                  Annuler les changements
                </button>
              )}
            </div>
            <Problem message={probleme} />
            <Success message={reussite} />
            {!etat.enregistree && !reussite && <p class="text-sm text-muted">Votre Gaulois n'existe qu'une fois enregistré.</p>}
          </div>
        </form>
      </div>
      <p class="sr-only" role="status" data-testid="boutique-annonce">
        {annonce}
      </p>
      {fenetre?.kind === "achat" && achat && boutique && (
        <DialogueAchat
          objet={achat.fiche}
          rarete={achat.fiche.rarete}
          vignette={vignetteDeLObjet(achat.emplacement, achat.objet, tenue)}
          prix={fenetre.prix}
          solde={boutique.solde}
          acheter={() => acheter(achat.emplacement, achat.objet, fenetre.prix)}
          onPorter={() => porter(achat.emplacement, achat.objet)}
          onFermer={() => setFenetre(null)}
        />
      )}
      {fenetre?.kind === "pochette" && boutique && (
        <DialoguePochette
          prix={boutique.pochette.prix}
          solde={boutique.solde}
          ouvrir={() => ouvrirPochette(boutique.pochette.prix)}
          objetDe={(tire) => OBJETS[tire.emplacement][tire.objet]}
          vignetteDe={(tire) => vignetteDeLObjet(tire.emplacement, tire.objet, tenue)}
          dejaPorte={(tire) => tenue[tire.emplacement] === tire.objet}
          onPorter={(tire) => porter(tire.emplacement, tire.objet)}
          onFermer={() => setFenetre(null)}
        />
      )}
    </div>
  );
}
