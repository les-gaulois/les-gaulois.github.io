import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import type { Me } from "../../lib/compte/types";
import type { Village } from "../../lib/village/contrat";
import { lireVillage, messageDeLaPlace } from "../../lib/village/ecran-place";
import { lumiereDuVillage } from "../../lib/village/lumiere";
import type { EtatDuMonde } from "../../lib/village/monde-etat";
import { taillesDesDessins } from "../../lib/village/monde/composition";
import { type Emplacement, cadrageDuMonde, emplacementDuBatiment, emplacementsDe, hautDansLeMonde, planDuMonde, quartierDuLieu } from "../../lib/village/monde/plan";
import { type FenetreDuMonde, fenetreDeLAncre } from "../../lib/village/monde/textes";
import type { BatimentId } from "../../lib/village/chantier-liste";
import { type FenetreDInterieur, fenetreDeLInterieur, interieurDeLAncre, interieurDeLaFenetre, interieursOuverts } from "../../lib/village/ecran-interieur";
import { type InterieurId, interieurDe } from "../../lib/village/interieurs";
import { type Habitant, type Lieu, lieuDOuverture, repartirLeVillage } from "../../lib/village/vie";
import { DemandeLienOpenFront, useLienAttendu } from "../compte/LienOpenFront";
import { messageOf, useMe } from "../compte/common";
import Vestiaire from "../compte/Vestiaire";
import MarcheDuVillage from "./MarcheDuVillage";
import { AnnonceDuToucher, useToucher } from "./PlaceToucher";
import { CameraDuMonde } from "./monde/camera-du-monde";
import { useFige } from "./fige";
import { useHorloge } from "./monde/horloge";
import { FenetreInterieur } from "./monde/FenetreInterieur";
import { FenetreChantier, FenetreFeu, FenetreForge, FenetreQui } from "./monde/MondeFenetres";
import { MondeCarte, MondeCredit, MondeDock, MondeFenetre, MondeTete, RepereDuMoi, comptesDesLieux } from "./monde/MondeInterface";
import { MondeScene } from "./monde/MondeScene";

/** Le village se relit toutes les 5 minutes tant que la page est visible : le robot relève le vocal à ce rythme. */
const RELECTURE_MS = 5 * 60_000;

const PERSONNE: Record<Lieu, Habitant[]> = { place: [], taverne: [], reunion: [], bataille: [], maisons: [] };

/** Ce qui peut être ouvert sur le monde : une fenêtre de la rangée d'icônes, ou le dedans d'un bâtiment. */
type Ouverte = FenetreDuMonde | FenetreDInterieur;

/**
 * L'heure qu'il est, relue toutes les trente secondes tant que la page est visible, et dès qu'elle le redevient : la
 * lumière et les lieux la suivent. Page cachée, rien ne tourne.
 */
function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    let minuterie = 0;
    const armer = () => {
      window.clearInterval(minuterie);
      minuterie = 0;
      if (document.visibilityState !== "visible") return;
      setMaintenant(new Date());
      minuterie = window.setInterval(() => setMaintenant(new Date()), 30_000);
    };
    armer();
    document.addEventListener("visibilitychange", armer);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", armer);
    };
  }, []);
  return maintenant;
}

type Lecture = { kind: "attente" } | { kind: "fermee"; message: string } | { kind: "erreur"; message: string } | { kind: "prete"; village: Village };

/**
 * Le village lu au serveur (`get_village`), pour un membre connecté : à l'arrivée, puis discrètement toutes les 5 minutes,
 * page visible seulement (au retour sur la page, tout de suite si la dernière lecture a plus de 5 minutes). Le serveur
 * décide de qui est au village ; une relecture qui échoue garde le village affiché. Une réponse identique ne change rien à
 * l'écran : personne ne bouge.
 */
function useVillage(actif: boolean): Lecture {
  const [lecture, setLecture] = useState<Lecture>({ kind: "attente" });
  const derniere = useRef(0);
  useEffect(() => {
    if (!actif) return;
    const lire = async (discret: boolean) => {
      derniere.current = Date.now();
      try {
        const village = lireVillage(await call<unknown>("get_village"));
        if (!village) throw new ServerError("network");
        // Rien de changé : l'écran garde le même village, personne ne bouge.
        setLecture((avant) => (avant.kind === "prete" && JSON.stringify(avant.village) === JSON.stringify(village) ? avant : { kind: "prete", village }));
      } catch (e) {
        const ferme = e instanceof ServerError ? messageDeLaPlace(e.code) : null;
        if (ferme) setLecture({ kind: "fermee", message: ferme });
        else if (!discret) setLecture({ kind: "erreur", message: messageOf(e) });
      }
    };
    void lire(false);
    let minuterie = 0;
    const armer = () => {
      window.clearInterval(minuterie);
      minuterie = 0;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - derniere.current >= RELECTURE_MS) void lire(true);
      minuterie = window.setInterval(() => void lire(true), RELECTURE_MS);
    };
    armer();
    document.addEventListener("visibilitychange", armer);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", armer);
    };
  }, [actif]);
  return lecture;
}

/**
 * Le monde du village (demande du pilote, 14 novembre 2026 : « un vrai univers où les persos se déplacent sans avoir à
 * changer de page, un grand écran immersif, sans page ») : `/village` est un seul écran, le panorama du village en pixels,
 * où l'on se promène et où les fenêtres s'ouvrent par-dessus. `etat` : le chantier et le grand feu, calculés à la
 * construction du site, publics. `me` : le compte, ou `null` quand la connexion du site n'est pas ouverte ; `ferme` : ce
 * que « Mon Gaulois » montre alors.
 *
 * Un visiteur voit le monde, le chantier, le feu, et la porte du vestiaire. Un membre voit en plus les Gaulois des
 * membres (le serveur ne les donne qu'aux comptes validés), « Qui est où » et le marché. Les anciennes adresses restent :
 * `#gaulois` ouvre « Mon Gaulois », `#marche` « Le marché », `#place` le monde seul. Un bâtiment du chantier fini qui a son
 * dedans s'ouvre d'un clic sur lui, ou par `#interieur-moulin` (`FenetreInterieur.tsx`), une fenêtre comme les autres.
 */
function Monde({ etat, me, lien, rafraichir, ferme }: { etat: EtatDuMonde; me: Me | null; lien: boolean; rafraichir?: () => Promise<void>; ferme?: ComponentChildren }) {
  const camera = useMemo(() => new CameraDuMonde(), []);
  const fige = useFige();
  const horloge = useHorloge(!fige);
  const maintenant = useMaintenant();
  const toucher = useToucher();
  const connecte = me?.signed_in === true && !lien;
  const lecture = useVillage(connecte);
  const moi = useMemo(() => new RepereDuMoi(), []);

  // La lumière et les lieux ne changent qu'à la minute.
  const minute = Math.floor(maintenant.getTime() / 60_000);
  const date = useMemo(() => new Date(minute * 60_000), [minute]);
  const lumiere = useMemo(() => lumiereDuVillage(date), [date]);
  const village = lecture.kind === "prete" ? lecture.village : null;
  const lieux = useMemo(() => (village ? repartirLeVillage(village.gaulois, date, village.releve) : PERSONNE), [village, date]);
  const membre = village !== null;
  // Le monde est bâti pour le nombre de Gaulois du village : une maison par tranche de quatre, jusqu'à mille. Un visiteur,
  // à qui le serveur ne dit rien des membres, voit le village de départ.
  const habitants = village?.gaulois.length ?? 0;
  const plan = useMemo(() => planDuMonde(taillesDesDessins(), habitants), [habitants]);
  // La caméra cadre la grand-rue en bas de l'écran, la colline au-dessus d'elle.
  useMemo(() => {
    camera.cadrer = cadrageDuMonde(plan);
  }, [camera, plan]);

  // Les bâtiments finis qui ont leur dedans dessiné : on y entre (`ecran-interieur.ts`), par `#interieur-moulin` aussi.
  const ouverts = useMemo(() => interieursOuverts(etat), [etat]);
  const fenetreDeLAdresse = (ancre: string): Ouverte | null => {
    const interieur = interieurDeLAncre(ancre, ouverts);
    return interieur ? fenetreDeLInterieur(interieur) : fenetreDeLAncre(ancre);
  };

  // La fenêtre ouverte suit l'adresse ; un compte qui doit encore donner son lien OpenFront le donne d'abord.
  const [ouverte, setOuverte] = useState<Ouverte | null>(() => fenetreDeLAdresse(location.hash));
  const [vues, setVues] = useState<ReadonlySet<Ouverte>>(() => new Set(ouverte ? [ouverte] : []));
  // La fenêtre ouverte, sue tout de suite (avant que l'écran ne se redessine) : Échap pressée juste après une ouverture la
  // referme, et deux clics rapides sur une icône ne s'emmêlent pas.
  const ouverteMaintenant = useRef(ouverte);
  // Ce qui a fait entrer dans un bâtiment (sa zone dans le monde, ou « Entrer » dans le chantier) : le focus y revient.
  // Toute autre fenêtre ouverte l'oublie : sortir d'un dedans ouvert par l'adresse ne ramène pas devant le précédent.
  const entreeDuDedans = useRef<HTMLElement | null>(null);
  const montrer = (id: Ouverte | null, adresse = true) => {
    entreeDuDedans.current = null;
    ouverteMaintenant.current = id;
    setOuverte(id);
    if (id) setVues((avant) => (avant.has(id) ? avant : new Set([...avant, id])));
    if (adresse) history.replaceState(history.state, "", id ? `#${id}` : location.pathname + location.search);
  };
  const choisir = (id: FenetreDuMonde) => montrer(ouverteMaintenant.current === id ? null : id);
  const entrer = (id: InterieurId, depuis: HTMLElement | null) => {
    montrer(fenetreDeLInterieur(id));
    entreeDuDedans.current = depuis;
  };
  const fermer = () => {
    const quittee = ouverteMaintenant.current;
    const depuis = entreeDuDedans.current;
    montrer(null);
    const interieur = interieurDeLaFenetre(quittee);
    if (interieur) {
      // On ressort devant le bâtiment : le focus revient à ce qui y a fait entrer s'il se voit encore, sinon au bâtiment
      // lui-même (la caméra vient à lui). Ni l'un ni l'autre ne fait défiler la scène.
      const cible = depuis?.isConnected && depuis.getClientRects().length > 0 ? depuis : document.querySelector<HTMLElement>(`.monde-zone[data-interieur="${interieur}"]`);
      cible?.focus({ preventScroll: true });
    } else if (quittee) document.getElementById(`monde-entree-${quittee}`)?.focus();
  };
  useEffect(() => {
    const ancre = () => montrer(fenetreDeLAdresse(location.hash), false);
    window.addEventListener("hashchange", ancre);
    return () => window.removeEventListener("hashchange", ancre);
  }, []);
  useEffect(() => {
    if (lien) montrer("gaulois", false);
  }, [lien]);

  // Échap ferme la fenêtre ouverte, après ce qui passe avant elle : une fenêtre de la boutique, un menu de l'en-tête.
  // Écoutée dès l'arrivée, et non à chaque ouverture : une touche pressée aussitôt la fenêtre ouverte n'est pas perdue.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !ouverteMaintenant.current) return;
      if (document.querySelector("dialog[open], details[data-menu][open], [data-testid='appels-popup']")) return;
      fermer();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, []);

  // À l'arrivée, la caméra est sur la place ; dès que le village est lu, sur le lieu où se trouve son Gaulois.
  const placee = useRef(false);
  useEffect(() => {
    const place = quartierDuLieu(plan, "place");
    if (!placee.current) camera.aller(place.vue, place.vueY, true);
    if (village && !placee.current) {
      placee.current = true;
      const lieu = quartierDuLieu(plan, lieuDOuverture(lieux));
      camera.aller(lieu.vue, lieu.vueY, true);
    }
  }, [village, plan]);
  useEffect(() => () => camera.fermer(), [camera]);

  // La page est prête : elle garde sa mise en page d'écran (voir le script en ligne de village.astro).
  useEffect(() => {
    document.documentElement.dataset["mondePret"] = "";
    document.documentElement.classList.add("village-monde");
  }, []);

  /** Sur un téléphone, aller voir quelque chose referme la fenêtre, qui le cacherait. */
  const voir = (x: number, y: number) => {
    if (window.matchMedia("(max-width: 47.9375rem)").matches) fermer();
    camera.aller(x, y);
  };
  const voirLEmplacement = (e: Emplacement) => voir(e.x + e.largeur / 2, hautDansLeMonde(e) + e.hauteur / 2);
  const voirLeQuartier = (lieu: Lieu) => {
    const q = quartierDuLieu(plan, lieu);
    voir(q.vue, q.vueY);
  };
  const parler = (habitant: Habitant) => {
    toucher.toucher(habitant);
    // La caméra va à celui qui parle : dans son lieu, à peu près à sa place.
    const q = quartierDuLieu(plan, habitant.presence.lieu);
    if (moi.point !== null && habitant.gaulois.moi) camera.aller(moi.point.x, moi.point.y);
    else camera.aller(q.vue, q.vueY);
  };

  const messageDuVillage = lecture.kind === "fermee" || lecture.kind === "erreur" ? lecture.message : null;
  // Le dedans ouvert, et le Gaulois du visiteur qui s'y tient : le sien seulement, que le serveur marque (`moi`).
  const dedans = interieurDe(interieurDeLaFenetre(ouverte) ?? "");
  const tenueDuSien = village?.gaulois.find((g) => g.moi)?.tenue ?? null;
  return (
    <div class="monde" data-fenetre={ouverte ?? undefined} data-testid="village">
      <MondeScene plan={plan} etat={etat} lumiere={lumiere} date={date} lieux={lieux} camera={camera} horloge={horloge} fige={fige} parole={toucher.parole} onToucher={toucher.toucher} ouvrir={(id) => montrer(id)} entrer={entrer} membre={membre} moiA={(point) => moi.poser(point)}>
        <MondeTete />
        <MondeCarte plan={plan} camera={camera} comptes={membre ? comptesDesLieux(lieux) : null} />
        <MondeCredit />
        <MondeFenetre id="gaulois" ouverte={ouverte === "gaulois"} onFermer={fermer}>
          {vues.has("gaulois") &&
            (me === null ? (
              ferme
            ) : lien ? (
              <div data-testid="village-lien">
                <DemandeLienOpenFront me={me} onSent={rafraichir ?? (async () => {})} />
              </div>
            ) : (
              <Vestiaire actif={ouverte === "gaulois"} />
            ))}
        </MondeFenetre>
        {connecte && (
          <MondeFenetre id="marche" ouverte={ouverte === "marche"} onFermer={fermer}>
            {vues.has("marche") && <MarcheDuVillage actif={ouverte === "marche"} />}
          </MondeFenetre>
        )}
        {connecte && (
          <MondeFenetre id="qui" ouverte={ouverte === "qui"} onFermer={fermer}>
            <FenetreQui village={village} lieux={lieux} message={messageDuVillage} dit={toucher.dit} onParler={parler} onGaulois={() => montrer("gaulois")} voirLieu={voirLeQuartier} />
          </MondeFenetre>
        )}
        <MondeFenetre id="chantier" ouverte={ouverte === "chantier"} onFermer={fermer}>
          <FenetreChantier
            etat={etat}
            voir={(id) => voirLEmplacement(emplacementDuBatiment(plan, id as BatimentId))}
            entrer={entrer}
          />
        </MondeFenetre>
        <MondeFenetre id="feu" ouverte={ouverte === "feu"} onFermer={fermer}>
          <FenetreFeu etat={etat} voir={() => voir(plan.feu.x, plan.dy0 + plan.feu.pied - 60)} />
        </MondeFenetre>
        <MondeFenetre id="forge" ouverte={ouverte === "forge"} onFermer={fermer}>
          <FenetreForge
            voir={() => voirLEmplacement(emplacementsDe(plan, "forge")[0]!)}
          />
        </MondeFenetre>
        {dedans && <FenetreInterieur key={dedans.id} dessin={dedans} lumiere={lumiere} horloge={horloge} fige={fige} tenue={tenueDuSien} onFermer={fermer} />}
      </MondeScene>
      <MondeDock ouverte={ouverte} onChoisir={choisir} membre={connecte} />
      <AnnonceDuToucher dit={toucher.dit} />
    </div>
  );
}

/** Le monde, pour un site dont la connexion est ouverte : le compte se lit, puis le monde se peuple. */
function MondeAvecCompte({ etat }: { etat: EtatDuMonde }) {
  const { me, refresh } = useMe();
  const lien = useLienAttendu(me);
  // Le temps de lire le compte, le monde se montre déjà : il est public.
  return <Monde etat={etat} me={me ?? { signed_in: false }} lien={lien === true} rafraichir={refresh} />;
}

/**
 * La page du village. `ouvert` : la connexion du site est ouverte (`AUTH_ENABLED`) ; sinon, le monde se visite sans
 * compte, et « Mon Gaulois » montre ce que la page a mis dans la balise (`children` : la porte fermée).
 */
export default function VillageApp({ etat, ouvert, children }: { etat: EtatDuMonde; ouvert: boolean; children?: ComponentChildren }) {
  return ouvert ? <MondeAvecCompte etat={etat} /> : <Monde etat={etat} me={null} lien={false} ferme={children} />;
}
