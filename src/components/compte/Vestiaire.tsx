import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import {
  EMPLACEMENTS_VISAGE,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  ORDRE_RARETES,
  PEAUX,
  POILS,
  RARETES,
  RETOUR_VILLAGE_KEY,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  decrireGaulois,
  memeTenue,
  objetPorte,
  tenueAuHasard,
  tenueDuServeur,
  vignetteDeLObjet,
  type Emplacement,
  type EmplacementDuVisage,
  type Objet,
  type Tenue,
  type Vignette,
} from "../../lib/gaulois";
import { tabKeyTarget } from "../../lib/onglets";
import type { MesStateres } from "../../lib/stateres";
import type { MaBoutique, PochetteReponse, RefObjet } from "../../lib/village/contrat";
import {
  RAISON_EN_VENTE,
  avecUnExemplaire,
  estEnVente,
  exemplaires,
  lireAchat,
  lireBoutique,
  lirePochette,
  lireStateres,
  manque,
  messageDuRefus,
  objetPayant,
  objetsEnVente,
  prixDeLObjet,
  quantitePossedee,
  raisonBoutiqueFermee,
  stateres,
} from "../../lib/village/ecran-boutique";
import {
  NOMS_RAYONS,
  RAYONS,
  RAYON_CORPS,
  TOUT,
  cadreDuVisage,
  choisirFiltre,
  compterParRarete,
  echelleEntiere,
  filtreEffectif,
  filtrerParRarete,
  grosPlan,
  rangerLeRayon,
  rayonDe,
  visageNu,
  type Entree,
  type Filtre,
  type Filtres,
  type Rayon,
} from "../../lib/village/vestiaire-rayons";
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
/** La place d'un gros plan du visage : toute la largeur d'une case, pour que les yeux se lisent (4 pixels par case du dessin). */
const COTE_VISAGE = 88;
/** La place de l'image dans un onglet de la barre des rayons : sa hauteur, et sa largeur dans une barre serrée ou large. */
const RAYON_HAUTEUR = 44;
const RAYON_SERRE = 56;
const RAYON_LARGE = 96;

/**
 * L'image d'une case : décorative, le nom de la case est écrit dessous. Une case du dessin vaut 1, 2 ou 3 pixels dans
 * `place` ; un gros plan du visage, jusqu'à 4.
 */
function ImageDeCase({ vignette, place = COTE_IMAGE, maximum = 3 }: { vignette: Vignette; place?: number; maximum?: number }) {
  return <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelleEntiere(vignette.largeur, vignette.hauteur, place, maximum)} class="case-dessin" />;
}

/**
 * L'image d'un onglet de rayon, décorative : ce que le Gaulois y porte. Elle est agrandie une ou deux fois, selon la place
 * que l'onglet lui laisse : la feuille de style choisit entre les deux agrandissements d'après la largeur de l'écran.
 */
function ImageDeRayon({ vignette }: { vignette: Vignette }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, vignette.largeur, vignette.hauteur, vignette.cases), [vignette]);
  const echelle = (place: number): number => Math.min(echelleEntiere(vignette.largeur, 1, place, 2), echelleEntiere(1, vignette.hauteur, RAYON_HAUTEUR, 2));
  return <canvas ref={toile} width={vignette.largeur} height={vignette.hauteur} class="pixels rayon-dessin" style={`--l:${vignette.largeur};--h:${vignette.hauteur};--serre:${echelle(RAYON_SERRE)};--large:${echelle(RAYON_LARGE)}`} aria-hidden="true" />;
}

/** Le cadre des gros plans du visage, calculé une fois d'après les dessins du catalogue. */
const CADRE_VISAGE = cadreDuVisage();

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
function Case({
  objet,
  vignette,
  portee,
  essayee = false,
  vente,
  enVente = false,
  visage = false,
  onClick,
}: {
  objet: Objet;
  vignette: Vignette | null;
  portee: boolean;
  essayee?: boolean;
  vente?: Vente | undefined;
  enVente?: boolean;
  /** Un gros plan du visage : il prend toute la place de l'image. */
  visage?: boolean;
  onClick: () => void;
}) {
  const aVendre = vente && "prix" in vente ? vente : null;
  const possede = vente && "possede" in vente ? vente.possede : 0;
  return (
    <button type="button" class="case" data-rarete={objet.rarete ?? "aucune"} data-boutique={aVendre ? "" : undefined} data-etat={essayee ? "essayee" : portee ? "portee" : "libre"} aria-pressed={portee || essayee} onClick={onClick}>
      <span class="case-image">{vignette ? visage ? <ImageDeCase vignette={vignette} place={COTE_VISAGE} maximum={4} /> : <ImageDeCase vignette={vignette} /> : <span class="case-rien" aria-hidden="true" />}</span>
      <span class="case-nom">{objet.nom}</span>
      {objet.rarete && <MarqueDeRarete rarete={objet.rarete} />}
      {possede > 0 && (
        <span class="case-marque" data-testid="case-a-vous">
          {/* Des mots, pas de signe (règle du pilote) : « à vous, 2 exemplaires », le nombre collé à son mot. */}
          <span class="sr-only">, </span>à vous{possede > 1 && `, ${exemplaires(possede)}`}
        </span>
      )}
      {/* Mis en vente par le membre : il ne s'achète pas à la boutique tant que l'offre est ouverte. */}
      {enVente && (
        <span class="case-marque" data-testid="case-en-vente">
          <span class="sr-only">, </span>en vente
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
  /** Les objets que le membre a mis en vente au marché : sortis de son inventaire, ils ne s'achètent pas à la boutique. */
  enVente: readonly RefObjet[];
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
 * Les yeux, la bouche ou la cicatrice : une case par modèle, avec un gros plan du visage du Gaulois, sans barbe ni coiffe,
 * pour voir le trait qu'on choisit. Gratuits, sans rareté.
 */
function Visage({ emplacement, tenue, onChange }: Choix & { emplacement: EmplacementDuVisage }) {
  const nu = visageNu(tenue);
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={grosPlan(casesDuGaulois(changerObjet(nu, emplacement, id)), CADRE_VISAGE)} visage portee={objetPorte(tenue, emplacement) === id} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
    </Partie>
  );
}

/** Le repère de forme d'une rareté, de un à cinq losanges : le même que sur les cases. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="filtre-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** Un choix du filtre de la boutique : son nom, et le nombre d'objets qu'il montre. Sans objet, il ne se choisit pas. */
function ChoixDeFiltre({ filtre, nom, rang, nombre, choisi, onClick }: { filtre: Filtre; nom: string; rang: number; nombre: number; choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" class="chip filtre" data-rarete={filtre} aria-pressed={choisi} disabled={nombre === 0} onClick={onClick} data-testid={`filtre-${filtre}`}>
      {rang > 0 && <Losanges rang={rang} />}
      {nom}
      <span class="filtre-nombre tnum">{nombre}</span>
      <span class="sr-only"> {nombre > 1 ? "objets" : "objet"}</span>
    </button>
  );
}

/**
 * Le rayon d'un emplacement : ce qui se porte (les gratuits et ce que le membre possède), puis la boutique, de la rareté
 * la plus courante à la plus rare, chacun à son prix. La boutique se réduit à une rareté d'un clic : avec une soixantaine
 * d'objets, on va droit à ce qu'on cherche.
 */
function Objets({ emplacement, tenue, essai, boutique, enVente, onChange, onEssai, filtre, onFiltre }: Choix & { emplacement: Emplacement; filtre: Filtre | undefined; onFiltre: (filtre: Filtre) => void }) {
  const essaye = essai?.emplacement === emplacement ? essai.id : null;
  const possede = (id: string): number => (boutique ? quantitePossedee(boutique.inventaire, emplacement, id) : 0);
  const vendu = (id: string): boolean => estEnVente(enVente, emplacement, id);
  const rayon = rangerLeRayon(OBJETS[emplacement], possede);
  const comptes = compterParRarete(rayon.boutique);
  const retenu = filtreEffectif(filtre, comptes);
  const cases = (liste: readonly Entree[], libre: boolean) =>
    liste.map(([id, objet]) => {
      const porte = tenue[emplacement] === id;
      return (
        <Case
          key={id}
          objet={objet}
          vignette={vignetteDeLObjet(emplacement, id, tenue)}
          portee={porte}
          essayee={essaye === id}
          vente={objet.gratuit ? undefined : libre ? { possede: possede(id) } : { prix: prixDeLObjet(boutique?.prix, emplacement, id) }}
          enVente={!libre && vendu(id)}
          onClick={() => {
            if (libre) onChange(changerObjet(tenue, emplacement, id));
            else if (!porte) onEssai(essaye === id ? null : { emplacement, id });
          }}
        />
      );
    });
  return (
    <div class="vestiaire-rayon" data-testid={`vestiaire-${emplacement}`}>
      {/* Le nom du rayon est écrit dans son onglet : ici, il ne sert qu'à nommer les groupes de cases. */}
      <p id={`vestiaire-${emplacement}`} class="sr-only">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      <p id={`a-vous-${emplacement}`} class="vestiaire-boutique">
        À vous
      </p>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement} a-vous-${emplacement}`}>
        {cases(rayon.aMoi, true)}
      </div>
      {rayon.boutique.length > 0 && (
        <>
          <div class="vestiaire-boutique-tete">
            <p id={`boutique-${emplacement}`} class="vestiaire-boutique">
              Boutique
            </p>
            <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="vestiaire-filtre">
              <ChoixDeFiltre filtre={TOUT} nom="Tout" rang={0} nombre={rayon.boutique.length} choisi={retenu === TOUT} onClick={() => onFiltre(TOUT)} />
              {ORDRE_RARETES.map((rarete) => (
                <ChoixDeFiltre key={rarete} filtre={rarete} nom={RARETES[rarete].nom} rang={RARETES[rarete].rang} nombre={comptes[rarete]} choisi={retenu === rarete} onClick={() => onFiltre(rarete)} />
              ))}
            </div>
          </div>
          <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement} boutique-${emplacement}`} data-testid="vestiaire-boutique">
            {cases(filtrerParRarete(rayon.boutique, retenu), false)}
          </div>
        </>
      )}
    </div>
  );
}

/** Le visage du Gaulois dans l'onglet du corps : avec sa barbe, sans coiffe ni arme. */
function visageDuRayon(tenue: Tenue): Vignette {
  return grosPlan(casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" }), CADRE_VISAGE);
}

/**
 * La barre des rayons : un onglet par rayon, avec l'image de ce que le Gaulois y porte (son visage pour le corps). Au
 * clavier : flèches, Début et Fin, comme tout groupe d'onglets ; un seul onglet dans l'ordre de tabulation.
 */
function Rayons({ rayon, tenue, onChoisir }: { rayon: Rayon; tenue: Tenue; onChoisir: (rayon: Rayon) => void }) {
  const auClavier = (e: KeyboardEvent, index: number) => {
    const suivant = RAYONS[tabKeyTarget(e.key, index, RAYONS.length) ?? -1];
    if (!suivant) return;
    e.preventDefault();
    onChoisir(suivant);
    document.getElementById(`vestiaire-rayon-${suivant}`)?.focus();
  };
  return (
    <div class="vestiaire-rayons" role="tablist" aria-label="Les rayons du vestiaire" data-testid="vestiaire-rayons">
      {RAYONS.map((id, index) => {
        const vignette = id === RAYON_CORPS ? visageDuRayon(tenue) : vignetteDeLObjet(id, tenue[id] ?? "", tenue);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`vestiaire-rayon-${id}`}
            class="vestiaire-rayon-onglet"
            aria-selected={rayon === id}
            aria-controls="vestiaire-panneau"
            tabIndex={rayon === id ? 0 : -1}
            onClick={() => onChoisir(id)}
            onKeyDown={(e) => auClavier(e, index)}
            data-testid={`rayon-${id}`}
          >
            <span class="vestiaire-rayon-image">{vignette ? <ImageDeRayon vignette={vignette} /> : <span class="case-rien" aria-hidden="true" />}</span>
            {NOMS_RAYONS[id]}
          </button>
        );
      })}
    </div>
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
 *
 * Depuis le 14 novembre 2026, le vestiaire s'ouvre un rayon à la fois (`src/lib/village/vestiaire-rayons.ts`) : le corps
 * (peau, cheveux, barbe, et le visage au choix : yeux, bouche, cicatrice), puis la tête, le haut, le bas, les pieds et
 * l'arme, dont la boutique se réduit à une rareté. Seul le rayon ouvert est dessiné : une soixantaine de cases au plus.
 */
export default function Vestiaire({ actif }: { actif?: boolean } = {}) {
  const { me, refresh } = useMe();
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [essai, setEssai] = useState<Essai | null>(null);
  const [bourse, setBourse] = useState<MesStateres | null>(null);
  const [boutique, setBoutique] = useState<MaBoutique | null>(null);
  const [enVente, setEnVente] = useState<RefObjet[]>([]);
  const [panne, setPanne] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [annonce, setAnnonce] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  // Le rayon ouvert, et le filtre de la boutique de chaque rayon. Le corps d'abord : c'est par lui qu'on crée son Gaulois.
  const [rayon, setRayon] = useState<Rayon>(RAYON_CORPS);
  const [filtres, setFiltres] = useState<Filtres>({});
  // Le membre est venu créer son Gaulois : vrai jusqu'à la prochaine lecture, même une fois le Gaulois enregistré, pour
  // que rien ne change de place sous ses yeux.
  const [creation, setCreation] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const barre = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);

  /**
   * La bourse et la boutique, relues ensemble : l'une sans l'autre ne bloque rien, le vestiaire reste. Avec elles, ses
   * propres offres du marché : un objet mis en vente ne s'achète pas à la boutique (un compte pas validé n'en a pas).
   */
  const lireLaBoutique = async (): Promise<MaBoutique | null> => {
    const [b, s, v] = await Promise.all([
      call<unknown>("get_ma_boutique").then(lireBoutique, () => null),
      call<unknown>("get_mes_stateres").then(lireStateres, () => null),
      call<unknown>("get_marche").then(objetsEnVente, () => []),
    ]);
    setBoutique(b);
    setBourse(s);
    setEnVente(v);
    setPanne(!b || !s);
    return b;
  };

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const [reponse] = await Promise.all([call<unknown>("get_mon_gaulois"), lireLaBoutique()]);
      const enregistree = tenueDuServeur(reponse);
      setEtat({ kind: "pret", enregistree });
      setCreation(enregistree === null);
      if (enregistree) setTenue(enregistree);
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (me?.signed_in) void lire();
  }, [me?.signed_in]);

  // De retour sur « Mon Gaulois » après le marché : la bourse, l'inventaire et les offres ont pu changer. Relecture
  // discrète, sans rien effacer de l'écran ni de la tenue en cours.
  const avant = useRef(actif);
  useEffect(() => {
    const revenu = actif === true && avant.current === false;
    avant.current = actif;
    if (revenu && etat.kind === "pret") void lireLaBoutique();
  }, [actif]);

  const changer = (suite: Tenue) => {
    setTenue(suite);
    setEssai(null);
    setReussite(null);
    setProbleme(null);
  };

  const enregistrer = async () => {
    const premiereFois = etat.kind === "pret" && !etat.enregistree;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: tenue }));
      setEtat({ kind: "pret", enregistree });
      // Le Gaulois compagnon (src/scripts/compagnon.ts) écoute « gal:gaulois-enregistre » pour se rhabiller aussitôt.
      if (enregistree) window.dispatchEvent(new CustomEvent("gal:gaulois-enregistre", { detail: { tenue: enregistree } }));
      setReussite("Votre Gaulois est enregistré. Tapez /gaulois dans le Discord du clan pour le montrer.");
      // Un Gaulois tout juste créé reçoit ses statères du mois et ouvre la boutique : on relit.
      if (premiereFois) await lireLaBoutique();
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
      // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
      const achat = lireAchat(await call<unknown>("acheter_objet", { p_emplacement: emplacement, p_objet: id, p_prix_vu: prix }));
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
      const tirage = lirePochette(await call<unknown>("ouvrir_pochette", { p_prix_vu: prix }));
      if (!tirage) return { ok: false, message: ILLISIBLE };
      setBoutique((b) => b && { ...b, solde: tirage.solde, inventaire: avecUnExemplaire(b.inventaire, tirage.objet, "pochette", new Date().toISOString()) });
      setAnnonce(`Pochette ouverte. Il vous reste ${stateres(tirage.solde)}.`);
      return { ok: true, valeur: tirage };
    } catch (e) {
      return refuser(e, prix);
    }
  };

  /** L'objet acheté ou tiré d'une pochette se porte, et son rayon s'ouvre : on le voit coché parmi les siens. */
  const porter = (emplacement: Emplacement, id: string) => {
    changer(changerObjet(tenue, emplacement, id));
    setRayon(rayonDe(emplacement));
    setFenetre(null);
  };

  // Sur téléphone, le Gaulois reste collé en haut de l'écran et la barre des rayons se colle juste dessous : la feuille de
  // style a besoin de la hauteur du Gaulois, qui change avec un essayage.
  useLayoutEffect(() => {
    const cadre = racine.current;
    const bloc = scene.current;
    if (!cadre || !bloc) return;
    const mesurer = () => cadre.style.setProperty("--vestiaire-scene", `${Math.round(bloc.getBoundingClientRect().height)}px`);
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(bloc);
    return () => observateur?.disconnect();
  }, [etat.kind]);

  // Un autre rayon s'ouvre : si le haut du rayon est déjà passé sous la barre (on avait descendu dans les cases), la page
  // remonte pour le montrer depuis sa première case. Sans glissement : le contenu vient de changer d'un coup.
  const rayonVu = useRef(rayon);
  useLayoutEffect(() => {
    if (rayonVu.current === rayon) return;
    rayonVu.current = rayon;
    const sous = barre.current?.getBoundingClientRect().bottom;
    const haut = panneau.current?.getBoundingClientRect().top;
    if (sous !== undefined && haut !== undefined && haut < sous) window.scrollBy({ top: haut - sous - 12, behavior: "instant" });
  }, [rayon]);

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
  const essaiEnVente = essai !== null && estEnVente(enVente, essai.emplacement, essai.id);
  const raisonEssai = fermee ?? (essaiEnVente ? RAISON_EN_VENTE : manqueEssai > 0 ? `Il vous manque ${stateres(manqueEssai)}.` : null);
  const choix: Choix = { tenue, essai, boutique, enVente, onChange: changer, onEssai: setEssai };
  const achat = fenetre?.kind === "achat" ? objetPayant(fenetre.emplacement, fenetre.id) : null;
  // La bourse et la pochette surprise : au-dessus des rayons, sauf pour qui vient créer son Gaulois. Elles ne lui servent
  // qu'une fois le Gaulois créé : il commence par le corps et le visage, et les trouve sous le bouton « Créer mon Gaulois ».
  const bourseEtPochette = (
    <>
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
    </>
  );
  return (
    <div ref={racine} class="vestiaire" data-testid="vestiaire">
      <div ref={scene} class="vestiaire-scene">
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
        {!creation && bourseEtPochette}
        <form
          class="vestiaire-choix"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <div ref={barre} class="vestiaire-barre">
            <Rayons rayon={rayon} tenue={tenue} onChoisir={setRayon} />
          </div>
          <div ref={panneau} id="vestiaire-panneau" class="vestiaire-panneau" role="tabpanel" aria-labelledby={`vestiaire-rayon-${rayon}`}>
            {rayon === RAYON_CORPS ? (
              <>
                <Peau {...choix} />
                <Poils emplacement="cheveux" {...choix} />
                <Poils emplacement="barbe" {...choix} />
                {EMPLACEMENTS_VISAGE.map((emplacement) => (
                  <Visage key={emplacement} emplacement={emplacement} {...choix} />
                ))}
              </>
            ) : (
              <Objets key={rayon} emplacement={rayon} {...choix} filtre={filtres[rayon]} onFiltre={(filtre) => setFiltres((f) => choisirFiltre(f, rayon, filtre))} />
            )}
          </div>
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
                  Annuler
                </button>
              )}
            </div>
            <Problem message={probleme} />
            <Success message={reussite} />
            {!etat.enregistree && !reussite && <p class="text-sm text-muted">Votre Gaulois n'existe qu'une fois enregistré.</p>}
          </div>
        </form>
        {creation && bourseEtPochette}
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
