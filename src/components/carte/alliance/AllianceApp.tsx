/**
 * La fenêtre « Alliance » de la page Carte (13 novembre 2026, demande du pilote) : la porte de la carte de l'alliance pour
 * tout le monde, puis, pour les Gaulois validés et les joueurs alliés invités, les alliances, les zones à prendre et la
 * discussion. Ouverte, elle remplace le film par la carte de l'alliance (`src/scripts/alliance-ecran.ts`).
 *
 * Le même jour, plus simple à lire : en français ou en anglais au choix (`src/lib/alliance/langue.ts`), nos clans chacun
 * dans une couleur choisie par le site, les zones dans la couleur du clan qui les prend, et une bulle qui dit tout d'une
 * zone au passage de la souris.
 *
 * Un visiteur sans session ne télécharge pas Supabase tant qu'il ne choisit pas de se connecter. Le serveur décide de tout :
 * un allié n'entre que par un lien d'invitation de l'encadrement, puis une fois accepté par lui (migration 20261113000500),
 * et jamais au QG. En attendant l'accord, la fenêtre lui dit que sa demande est envoyée.
 */
import { render, type ComponentChildren } from "preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bilanZone, totauxAlliances, type BilanZone } from "../../../lib/alliance/bilan";
import { TEXTES_CAPTURE } from "../../../lib/alliance/capture";
import { COULEUR_TOUTE_L_ALLIANCE, couleurDeZone, couleursDesClans } from "../../../lib/alliance/couleurs";
import { dernierNumero, nonLus } from "../../../lib/alliance/discussion";
import { INVITATION_KEY, RETOUR_CARTE_KEY, invitationDeLAncre, jetonValable } from "../../../lib/alliance/invitation";
import { LANGUE_KEY, langueDeDepart, type Langue } from "../../../lib/alliance/langue";
import { masqueDeLaZone } from "../../../lib/alliance/masque";
import { FR, textesDe, type Textes } from "../../../lib/alliance/textes";
import type { AccesCarte, AllianceLigne, CarteAlliance, MessageAlliance } from "../../../lib/alliance/types";
import { ServerError, call, mayHaveSession, signOut, supabase } from "../../../lib/compte/api";
import { ecranAlliance, type Chargement, type Survol, type ZoneAffichee } from "../../../scripts/alliance-ecran";
import { CodeLogin, DiscordButton, DiscordGives, Problem, codeLoginShown, messageIn, usePlayerView } from "../../compte/common";
import AllianceCapture from "./AllianceCapture";
import AllianceGestion from "./AllianceGestion";
import AllianceMessages from "./AllianceMessages";
import AllianceVue from "./AllianceVue";
import AllianceZones from "./AllianceZones";
import { CalqueCarte, ChoixLangue, TextesContexte, type Calque, type Contexte, type EntreeLegende, type ModeCouleurs } from "./commun";

type Onglet = "vue" | "zones" | "messages" | "capture" | "gestion";
const VU_KEY = "gal-alliance-vu";
/** Le gris des autres clans tel qu'il paraît sur la carte : le gris voilé d'alliance-ecran.ts posé sur le fond sombre. */
const GRIS_AUTRES = 0x4b5570;

const lireStockage = (stockage: () => Storage, cle: string): string | null => {
  try {
    return stockage().getItem(cle);
  } catch {
    return null;
  }
};
const ecrireStockage = (stockage: () => Storage, cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) stockage().removeItem(cle);
    else stockage().setItem(cle, valeur);
  } catch {
    // Stockage refusé : la page marche sans.
  }
};
const session = () => sessionStorage;
const local = () => localStorage;
const AUCUNE: AllianceLigne[] = [];
const languesDuNavigateur = (): readonly string[] => (navigator.languages?.length ? navigator.languages : [navigator.language ?? "fr"]);

/** L'invitation de l'adresse, gardée dans l'onglet le temps de la connexion, puis retirée de l'adresse. */
function prendreInvitation(): string | null {
  const dansLAdresse = invitationDeLAncre(location.hash);
  if (dansLAdresse) {
    ecrireStockage(session, INVITATION_KEY, dansLAdresse);
    history.replaceState(history.state, "", `${location.pathname}${location.search}#alliance`);
    return dansLAdresse;
  }
  const gardee = lireStockage(session, INVITATION_KEY);
  return gardee && jetonValable(gardee) ? gardee : null;
}

/** La fenêtre « Alliance » est-elle la fenêtre ouverte de la console ? */
const fenetreOuverte = (root: HTMLElement | null) => root?.dataset.ouverte === "alliance";

/**
 * Ce que la page Carte écrit en dur, en français, autour de la fenêtre : son titre, son bouton de fermeture, le nom de la
 * carte et de ses boutons. Ils suivent la langue choisie ; la fenêtre porte `lang="en"` en anglais.
 */
function traduireLaPage(root: HTMLElement, t: Textes): void {
  const fenetre = document.getElementById("alliance");
  if (fenetre) {
    if (t.langue === "fr") fenetre.removeAttribute("lang");
    else fenetre.setAttribute("lang", t.langue);
    const titre = document.getElementById("alliance-titre");
    if (titre) titre.textContent = t.titreFenetre;
    fenetre.querySelector(".carte-fermer")?.setAttribute("aria-label", t.fermer);
  }
  const canvas = root.querySelector<HTMLElement>("[data-alliance-canvas]");
  if (canvas) {
    canvas.setAttribute("aria-label", t.carteAria);
    if (t.langue === "fr") canvas.removeAttribute("lang");
    else canvas.setAttribute("lang", t.langue);
    // La description du clavier, commune avec le film, est en français : en anglais, elle est dans le nom de la carte.
    if (t.langue === "fr") canvas.setAttribute("aria-describedby", "carte-clavier");
    else canvas.removeAttribute("aria-describedby");
  }
  root.querySelector('[data-alliance-zoom="1"]')?.setAttribute("aria-label", t.zoomPlus);
  root.querySelector('[data-alliance-zoom="-1"]')?.setAttribute("aria-label", t.zoomMoins);
  const monde = root.querySelector("[data-alliance-monde-texte]");
  if (monde) monde.textContent = t.vueDEnsemble;
  const capture = root.querySelector("[data-alliance-capture-texte]");
  if (capture) capture.textContent = TEXTES_CAPTURE[t.langue].boutonCarte;
  const outils = root.querySelector<HTMLElement>("[data-alliance-outils]");
  if (outils) {
    if (t.langue === "fr") outils.removeAttribute("lang");
    else outils.setAttribute("lang", t.langue);
  }
}

function Porte({ invitation, connecte, t }: { invitation: string | null; connecte: () => void; t: Textes }) {
  return (
    <div data-testid="alliance-porte">
      <p>{invitation ? t.porteInvite : t.porteReservee}</p>
      <div class="mt-4">
        <DiscordButton returnPath="/compte" label={t.seConnecterDiscord} langue={t.langue} avant={() => ecrireStockage(session, RETOUR_CARTE_KEY, String(Date.now()))} />
      </div>
      <DiscordGives langue={t.langue} />
      {codeLoginShown() && <CodeLogin connecte={connecte} langue={t.langue} />}
    </div>
  );
}

/** `fini` : la demande est envoyée ; la page oublie l'invitation et relit la carte, qui dit alors que la demande attend. */
function Accepter({ invitation, fini, t }: { invitation: string; fini: () => Promise<void>; t: Textes }) {
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const accepter = async () => {
    setBusy(true);
    setErreur(null);
    try {
      await call("accept_alliance_invite", { p_token: invitation, p_alias: nom });
      await fini();
    } catch (e) {
      setErreur(e);
      if (e instanceof ServerError && (e.code === "invite_invalid" || e.code === "already_gaulois")) ecrireStockage(session, INVITATION_KEY, null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      class="grid gap-3"
      data-testid="alliance-accepter"
      onSubmit={(e) => {
        e.preventDefault();
        void accepter();
      }}
    >
      <p>{t.accepterIntro}</p>
      <div>
        <label for="alliance-nom" class="text-sm font-semibold">
          {t.accepterNom}
        </label>
        <input id="alliance-nom" class="field mt-1" required minLength={2} maxLength={24} placeholder={t.accepterExemple} value={nom} onInput={(e) => setNom(e.currentTarget.value)} />
      </div>
      <div>
        <button type="submit" class="btn btn-primary" disabled={busy || nom.trim().length < 2}>
          {t.accepterBouton}
        </button>
      </div>
      <Problem message={erreur === null ? null : messageIn(erreur, t.langue)} />
    </form>
  );
}

/**
 * Pour un allié : se déconnecter, ou quitter la carte de l'alliance, à part et en deux temps (son accès ne revient qu'avec une
 * nouvelle invitation). `attente` : il attend encore l'accord, et le même bouton annule sa demande.
 */
function Sortie({ relire, deconnecte, t, attente = false }: { relire: () => Promise<void>; deconnecte: () => void; t: Textes; attente?: boolean }) {
  const [arme, setArme] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  return (
    <div class="alliance-a-part mt-4">
      <div class="alliance-ligne">
        <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" onClick={() => void signOut().then(deconnecte)}>
          {t.seDeconnecter}
        </button>
        <button
          type="button"
          class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
          onBlur={() => setArme(false)}
          onClick={() => {
            if (!arme) {
              setArme(true);
              return;
            }
            setErreur(null);
            call("leave_alliance_map")
              .then(() => relire())
              .catch((e: unknown) => setErreur(e));
          }}
        >
          {attente ? (arme ? t.annulerDemandeConfirmer : t.annulerDemande) : arme ? t.quitterConfirmer : t.quitter}
        </button>
      </div>
      <Problem message={erreur === null ? null : messageIn(erreur, t.langue)} />
    </div>
  );
}

export default function AllianceApp() {
  const ecran = useMemo(() => ecranAlliance(), []);
  const root = useMemo(() => document.querySelector<HTMLElement>("[data-carte]"), []);
  const calque = useMemo(() => root?.querySelector<HTMLElement>("[data-alliance-calque]") ?? null, [root]);
  const [invitation, setInvitation] = useState<string | null>(() => prendreInvitation());
  const [langueGardee, setLangueGardee] = useState(() => lireStockage(local, LANGUE_KEY));
  const [connecte, setConnecte] = useState(() => mayHaveSession());
  const [carte, setCarte] = useState<{ status: "attente" } | { status: "erreur"; erreur: unknown } | { status: "prete"; donnees: CarteAlliance }>({ status: "attente" });
  const [charge, setCharge] = useState<Chargement | null>(null);
  const [chargeErreur, setChargeErreur] = useState(false);
  const [ouverte, setOuverte] = useState(() => fenetreOuverte(root));
  const [onglet, setOnglet] = useState<Onglet>("vue");
  // Chaque clic sur « Capture », posé sur la carte, ouvre l'onglet Capture et y prend la capture.
  const [demandeCapture, setDemandeCapture] = useState(0);
  useEffect(() => {
    const bouton = root?.querySelector<HTMLButtonElement>("[data-alliance-capture]");
    if (!bouton) return;
    const clic = () => {
      setOnglet("capture");
      setDemandeCapture((n) => n + 1);
    };
    bouton.addEventListener("click", clic);
    return () => bouton.removeEventListener("click", clic);
  }, [root]);
  const [mode, setMode] = useState<ModeCouleurs>("clans");
  const [selection, setSelection] = useState<number | null>(null);
  const [edition, setEdition] = useState<{ id: number | null; titre: string; tag: string } | null>(null);
  const [messages, setMessages] = useState<MessageAlliance[] | null>(null);
  const [erreurMessages, setErreurMessages] = useState<unknown>(null);
  const [vu, setVu] = useState<number | null>(() => {
    const v = Number(lireStockage(local, VU_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const playerView = usePlayerView();

  const access: AccesCarte | null = carte.status === "prete" ? carte.donnees.access : null;
  // Sans choix gardé : la langue du navigateur pour un joueur invité ou allié, le français pour un Gaulois.
  // Le joueur a ouvert son lien d'invitation et attend l'accord de l'encadrement.
  const attenteEnCours = carte.status === "prete" && carte.donnees.access === null && Boolean(carte.donnees.waiting);
  const langue: Langue = langueDeDepart(langueGardee, languesDuNavigateur(), invitation !== null || attenteEnCours || access?.kind === "allie");
  const t = textesDe(langue);
  const choisirLangue = useCallback((l: Langue) => {
    ecrireStockage(local, LANGUE_KEY, l);
    setLangueGardee(l);
  }, []);

  useEffect(() => {
    if (root) traduireLaPage(root, t);
  }, [root, t]);

  // La fenêtre suit la console : ouverte, elle montre la carte de l'alliance.
  useEffect(() => {
    if (!root) return;
    const suivre = () => setOuverte(fenetreOuverte(root));
    root.addEventListener("carte:fenetre", suivre);
    const surAncre = () => {
      const nouvelle = invitationDeLAncre(location.hash);
      if (nouvelle) setInvitation(prendreInvitation());
    };
    window.addEventListener("hashchange", surAncre);
    return () => {
      root.removeEventListener("carte:fenetre", suivre);
      window.removeEventListener("hashchange", surAncre);
    };
  }, [root]);

  // Une session ouverte ou fermée ailleurs (un autre onglet, la déconnexion) : la porte suit.
  useEffect(() => {
    if (!connecte) return;
    let stop = () => {};
    void supabase().then((sb) => {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setConnecte(false);
          setCarte({ status: "attente" });
        }
      });
      stop = () => data.subscription.unsubscribe();
    });
    return () => stop();
  }, [connecte]);

  const relire = useCallback(async () => {
    try {
      const donnees = await call<CarteAlliance>("get_alliance_map");
      setCarte({ status: "prete", donnees });
    } catch (e) {
      if (e instanceof ServerError && e.code === "not_signed_in") {
        setConnecte(false);
        setCarte({ status: "attente" });
        return;
      }
      setCarte({ status: "erreur", erreur: e });
    }
  }, []);

  // L'invitation a servi : la carte se relit (l'écran d'attente paraît), puis l'invitation quitte l'onglet et la page.
  const oublierInvitation = useCallback(async () => {
    await relire();
    ecrireStockage(session, INVITATION_KEY, null);
    setInvitation(null);
  }, [relire]);

  useEffect(() => {
    if (connecte) void relire();
  }, [connecte, relire]);

  // En attente de l'accord : la carte se relit toutes les 30 secondes, fenêtre ouverte, et s'ouvre d'elle-même une fois accepté.
  // La fenêtre rouverte, ou l'onglet revenu au premier plan, relit tout de suite.
  useEffect(() => {
    if (!attenteEnCours || !ouverte) return;
    void relire();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void relire();
    }, 30_000);
    const revenir = () => {
      if (document.visibilityState === "visible") void relire();
    };
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [attenteEnCours, ouverte, relire]);

  // La carte publiée (film et état pixel par pixel) ne se charge que pour qui a accès, à la première ouverture de la fenêtre.
  useEffect(() => {
    if (!access || !ecran || charge || !ouverte) return;
    ecran
      .charger()
      .then(setCharge)
      .catch(() => setChargeErreur(true));
  }, [access, ecran, charge, ouverte]);

  // Un Gaulois validé, un allié accepté ou qui attend n'a pas d'invitation à accepter : celle qui traîne dans l'onglet (le
  // lien déjà servi, rouvert pour voir où en est la demande) s'efface. Pour changer de clan, l'encadrement retire l'accès,
  // puis invite de nouveau.
  useEffect(() => {
    if ((access || attenteEnCours) && invitation) {
      ecrireStockage(session, INVITATION_KEY, null);
      setInvitation(null);
    }
  }, [access, attenteEnCours, invitation]);

  const staff = Boolean(access?.staff) && !playerView;
  const donnees = carte.status === "prete" ? carte.donnees : null;
  const alliances = donnees?.alliances ?? AUCUNE;
  const ours = donnees?.ours ?? null;
  const notres = useMemo(() => new Set(alliances.find((a) => a.id === ours)?.clans ?? []), [alliances, ours]);
  // GAL est toujours des nôtres, même avant d'être rangé dans une alliance : ses pixels ne sont jamais à prendre, et il a sa couleur.
  const pourBilan = useMemo(() => new Set([...notres, "GAL"]), [notres]);
  const couleursClans = useMemo(() => couleursDesClans(pourBilan), [pourBilan]);
  const totaux = useMemo(() => (charge ? totauxAlliances(alliances, charge.film.standings, charge.film.claimed) : []), [alliances, charge]);
  const zones = useMemo(() => donnees?.zones ?? [], [donnees]);

  const bilans = useMemo(() => {
    const out = new Map<number, BilanZone>();
    if (!charge?.etat) return out;
    for (const z of zones) {
      const m = masqueDeLaZone(z);
      if (m) out.set(z.id, bilanZone(m, charge.etat.valeurs, charge.etat.width, charge.film.clans, pourBilan));
    }
    return out;
  }, [zones, charge, pourBilan]);

  // La carte de l'alliance à la place du film, tant que la fenêtre est ouverte. Un dessin en cours reste, fenêtre fermée :
  // il se retrouve à la réouverture.
  const montree = ouverte && access !== null && charge !== null && charge.etat !== null;
  useEffect(() => {
    ecran?.montrer(montree);
  }, [ecran, montree]);

  // Les couleurs de la carte : nos clans chacun dans la sienne, ou chaque alliance dans la sienne ; les autres en gris.
  const couleursCarte = useMemo(() => {
    if (mode === "clans") return couleursClans;
    const m = new Map<string, number>();
    for (const a of alliances) for (const tag of a.clans) m.set(tag, a.color);
    return m;
  }, [mode, couleursClans, alliances]);
  useEffect(() => {
    if (ecran && charge) ecran.regler(couleursCarte);
  }, [ecran, charge, couleursCarte]);

  // Les zones à dessiner ne se refont qu'à la relecture du serveur : choisir une zone ne redécode pas les masques.
  const affichees = useMemo(() => {
    const out: ZoneAffichee[] = [];
    for (const z of zones) {
      const masque = masqueDeLaZone(z);
      if (masque) out.push({ id: z.id, title: z.title, masque, couleur: couleurDeZone(z.tag, couleursClans), etiquette: z.tag ? `${z.tag} · ${z.title}` : z.title });
    }
    return out;
  }, [zones, couleursClans]);
  useEffect(() => {
    if (ecran && charge) ecran.montrerZones(affichees, selection);
  }, [ecran, charge, affichees, selection]);

  // La légende de la carte : ce que dit chaque couleur, dans l'ordre de la carte.
  const legende = useMemo<EntreeLegende[]>(() => {
    if (!charge) return [];
    const entrees: EntreeLegende[] =
      mode === "clans" ? [...couleursClans].map(([tag, couleur]) => ({ couleur, nom: tag })) : [...totaux].sort((a, b) => a.rang - b.rang).map((a) => ({ couleur: a.color, nom: a.name }));
    if (zones.some((z) => z.tag === null)) entrees.push({ couleur: COULEUR_TOUTE_L_ALLIANCE, nom: t.touteLAlliance });
    entrees.push({ couleur: GRIS_AUTRES, nom: t.legendeAutres });
    return entrees;
  }, [charge, mode, couleursClans, totaux, zones, t]);

  // Ce que la fenêtre écrit sur la carte : la légende, et la bulle du survol, redessinée à chaque mouvement de la souris
  // sans redessiner la fenêtre. Les valeurs du moment sont gardées ici pour le rappel du survol.
  const pourLeCalque = useRef({ t, legende, zones, bilans, couleursClans, alliances, edition: false });
  pourLeCalque.current = { t, legende, zones, bilans, couleursClans, alliances, edition: edition !== null };
  const survolRef = useRef<Survol | null>(null);
  const peindreCalque = useCallback(() => {
    if (!calque || !ecran) return;
    const p = pourLeCalque.current;
    const survol = p.edition ? null : survolRef.current;
    const zoneId = survol?.info.zone ?? null;
    const zone = zoneId === null ? null : (p.zones.find((z) => z.id === zoneId) ?? null);
    const tag = survol?.info.tag ?? null;
    const c: Calque = {
      t: p.t,
      legende: p.legende,
      survol,
      libre: { largeur: ecran.largeurLibre(), hauteur: calque.getBoundingClientRect().height },
      zone,
      bilan: zone ? (p.bilans.get(zone.id) ?? null) : null,
      couleurZone: zone ? couleurDeZone(zone.tag, p.couleursClans) : 0,
      alliance: tag === null ? null : (p.alliances.find((a) => a.clans.includes(tag))?.name ?? null),
    };
    render(<CalqueCarte c={c} />, calque);
  }, [calque, ecran]);
  useEffect(() => {
    peindreCalque();
  }, [peindreCalque, t, legende, zones, bilans, couleursClans, alliances, edition]);
  useEffect(
    () => () => {
      if (calque) render(null, calque);
    },
    [calque],
  );

  // Ce qu'il y a sous la souris, dans la bulle ; un clic sur une zone la choisit et l'ouvre dans l'onglet Zones.
  useEffect(() => {
    if (!ecran) return;
    ecran.onSurvol = (survol) => {
      survolRef.current = survol;
      peindreCalque();
    };
    ecran.onClic = (info) => {
      if (edition) return;
      if (info.zone !== null) {
        setSelection(info.zone);
        setOnglet("zones");
      } else setSelection(null);
    };
  }, [ecran, edition, peindreCalque]);

  const choisir = useCallback(
    (id: number | null, viser: boolean) => {
      setSelection(id);
      const zone = zones.find((z) => z.id === id);
      if (viser && zone && ecran) ecran.viser({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    },
    [zones, ecran],
  );

  // La discussion : relue toutes les 10 secondes quand elle est sous les yeux, chaque minute sinon, pour le nombre de nouveaux.
  const lireMessages = useCallback(async () => {
    try {
      const r = await call<{ messages: MessageAlliance[] }>("get_alliance_messages");
      setMessages(r.messages);
      setErreurMessages(null);
    } catch (e) {
      setErreurMessages(e);
    }
  }, []);
  const sousLesYeux = ouverte && onglet === "messages";
  useEffect(() => {
    if (!access) return;
    void lireMessages();
    let timer = 0;
    const suivant = () => {
      timer = window.setTimeout(
        () => {
          if (document.visibilityState === "visible") void lireMessages();
          suivant();
        },
        sousLesYeux ? 10_000 : 60_000,
      );
    };
    suivant();
    const revenir = () => {
      if (document.visibilityState === "visible") void lireMessages();
    };
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [access, sousLesYeux, lireMessages]);

  // Lus : les messages sous les yeux. Le dernier lu est gardé dans ce navigateur seulement.
  useEffect(() => {
    if (!sousLesYeux || !messages) return;
    const dernier = dernierNumero(messages);
    if (dernier !== null && dernier !== vu) {
      setVu(dernier);
      ecrireStockage(local, VU_KEY, String(dernier));
    }
  }, [sousLesYeux, messages, vu]);
  const nouveaux = messages ? (vu === null ? 0 : nonLus(messages, vu)) : 0;
  // Pour l'encadrement : les joueurs alliés qui ont ouvert leur lien et attendent son accord.
  // `approved === false` seulement : un serveur d'avant l'accord ne donne pas ce champ, et personne n'y attend.
  const attentes = staff ? (donnees?.allies ?? []).filter((a) => a.approved === false).length : 0;

  // Pour l'encadrement, la carte se relit chaque minute, fenêtre ouverte : un allié qui commence à attendre s'y compte.
  useEffect(() => {
    if (!staff || !ouverte) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void relire();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [staff, ouverte, relire]);

  // Les nouveaux messages, et pour l'encadrement les alliés qui attendent, se voient aussi sur l'entrée « Alliance » de la
  // rangée du bas, fenêtre fermée.
  useEffect(() => {
    const total = nouveaux + attentes;
    const mots = [nouveaux > 0 ? `${t.nombre(nouveaux)} ${t.nouveaux(nouveaux)}` : null, attentes > 0 ? `${t.nombre(attentes)} ${t.alliesAttendent(attentes)}` : null]
      .filter((m) => m !== null)
      .join(", ");
    for (const lien of document.querySelectorAll<HTMLElement>('.carte-dock [data-ouvre="alliance"]')) {
      let pastille = lien.querySelector<HTMLElement>("[data-alliance-nouveaux]");
      if (total === 0) {
        pastille?.remove();
        continue;
      }
      if (!pastille) {
        pastille = document.createElement("span");
        pastille.className = "count-pill tnum alliance-pastille";
        pastille.dataset.allianceNouveaux = "";
        lien.append(pastille);
      }
      pastille.innerHTML = "";
      const mot = document.createElement("span");
      mot.className = "sr-only";
      // La rangée est en français : en anglais, ces mots portent leur langue, pour la voix d'un lecteur d'écran.
      mot.textContent = t.langue === "fr" ? ` : ${mots}` : `: ${mots}`;
      if (t.langue === "fr") mot.removeAttribute("lang");
      else mot.lang = t.langue;
      const chiffre = document.createElement("span");
      chiffre.setAttribute("aria-hidden", "true");
      chiffre.textContent = t.nombre(total);
      pastille.append(chiffre, mot);
    }
  }, [nouveaux, attentes, t]);

  const langues = <ChoixLangue langue={langue} choisir={choisirLangue} t={t} />;
  const enTete = (moi?: ComponentChildren) => (
    <div class="alliance-tete">
      {moi ?? <span></span>}
      {langues}
    </div>
  );

  const contenu = (() => {
    // Connecté avec un code, sur la carte même : la page se recharge, pour que l'en-tête dise aussi qui est connecté.
    if (!connecte)
      return (
        <>
          {enTete()}
          <Porte invitation={invitation} connecte={() => location.reload()} t={t} />
        </>
      );
    if (carte.status === "attente")
      return (
        <>
          {enTete()}
          <p class="text-muted" role="status">
            {t.lectureCarte}
          </p>
        </>
      );
    if (carte.status === "erreur")
      return (
        <>
          {enTete()}
          <Problem message={messageIn(carte.erreur, langue)} onRetry={() => void relire()} retryLabel={t.reessayer} />
        </>
      );

    // Le joueur a ouvert son lien : l'encadrement doit encore le reconnaître à son nom Discord et l'accepter.
    const attente = donnees?.waiting ?? null;
    if (!access && attente) {
      return (
        <div data-testid="alliance-attente">
          {enTete()}
          <p class="font-semibold">{t.demandeEnvoyee}</p>
          <p class="mt-2">{t.demandeAttente(attente.tag, attente.alias)}</p>
          <Sortie relire={relire} deconnecte={() => setConnecte(false)} t={t} attente />
        </div>
      );
    }

    if (!access || !donnees) {
      return (
        <div data-testid="alliance-sans-acces">
          {enTete()}
          {invitation ? (
            <Accepter invitation={invitation} fini={oublierInvitation} t={t} />
          ) : (
            <>
              <p>{t.sansAcces}</p>
              <p class="mt-2 text-muted">{t.sansAccesAide}</p>
            </>
          )}
          <button type="button" class="btn btn-ghost mt-4" onClick={() => void signOut().then(() => setConnecte(false))}>
            {t.seDeconnecter}
          </button>
        </div>
      );
    }

    if (chargeErreur)
      return (
        <>
          {enTete()}
          <Problem message={t.carteEnPanne} />
        </>
      );
    if (!charge)
      return (
        <>
          {enTete()}
          <p class="text-muted" role="status">
            {t.chargementCarte}
          </p>
        </>
      );

    const ctx: Contexte = { donnees: { ...donnees, access }, film: charge.film, etat: charge.etat, staff, totaux, notres, couleursClans, bilans, relire };
    const onglets: { id: Onglet; label: string; compte?: number; mots?: string }[] = [
      { id: "vue", label: t.onglets.vue },
      { id: "zones", label: t.onglets.zones },
      { id: "messages", label: t.onglets.messages, compte: nouveaux, mots: t.nouveaux(nouveaux) },
      // La capture repeint la carte pixel par pixel : sans elle, pas d'onglet Capture (la fenêtre dit déjà pourquoi).
      ...(charge.etat ? [{ id: "capture" as const, label: TEXTES_CAPTURE[t.langue].onglet }] : []),
      ...(staff ? [{ id: "gestion" as const, label: t.onglets.gestion, compte: attentes, mots: FR.alliesAttendent(attentes) }] : []),
    ];

    return (
      <div data-testid="alliance-app">
        {enTete(
          <p class="carte-petit text-muted" data-testid="alliance-moi">
            {t.connecte}{" "}
            <strong class="text-white">
              [{access.tag}] {access.name}
            </strong>
            {access.kind === "allie" ? ` · ${t.roleAllie}` : staff ? ` · ${t.roleEncadrement}` : ""}
          </p>,
        )}
        {!charge.etat && <p class="form-problem mt-2">{t.sansEtat}</p>}
        <div class="alliance-onglets" role="tablist" aria-label={t.ongletsAria}>
          {onglets.map((o) => (
            <button
              type="button"
              role="tab"
              id={`alliance-onglet-${o.id}`}
              aria-selected={onglet === o.id}
              aria-controls={`alliance-partie-${o.id}`}
              tabIndex={onglet === o.id ? 0 : -1}
              lang={o.id === "gestion" && langue !== "fr" ? "fr" : undefined}
              onClick={() => setOnglet(o.id)}
              onKeyDown={(e) => {
                const i = onglets.findIndex((x) => x.id === o.id);
                const pas = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!pas) return;
                e.preventDefault();
                const suivant = onglets[(i + pas + onglets.length) % onglets.length]!;
                setOnglet(suivant.id);
                document.getElementById(`alliance-onglet-${suivant.id}`)?.focus();
              }}
            >
              {o.label}
              {o.compte ? (
                <span class="count-pill tnum">
                  {t.nombre(o.compte)}
                  <span class="sr-only"> {o.mots}</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div id="alliance-partie-vue" role="tabpanel" aria-labelledby="alliance-onglet-vue" hidden={onglet !== "vue"}>
          <AllianceVue ctx={ctx} mode={mode} setMode={setMode} />
        </div>
        <div id="alliance-partie-zones" role="tabpanel" aria-labelledby="alliance-onglet-zones" hidden={onglet !== "zones"}>
          {ecran && <AllianceZones ctx={ctx} ecran={ecran} selection={selection} choisir={choisir} edition={edition} setEdition={setEdition} />}
        </div>
        <div id="alliance-partie-messages" role="tabpanel" aria-labelledby="alliance-onglet-messages" hidden={onglet !== "messages"}>
          <AllianceMessages messages={messages} erreurLecture={erreurMessages === null ? null : messageIn(erreurMessages, langue)} relire={lireMessages} />
        </div>
        {charge.etat && (
          <div id="alliance-partie-capture" role="tabpanel" aria-labelledby="alliance-onglet-capture" hidden={onglet !== "capture"}>
            {ecran && <AllianceCapture ctx={ctx} ecran={ecran} legende={legende} mode={mode} zones={affichees} demande={demandeCapture} />}
          </div>
        )}
        {staff && (
          // La gestion est réservée à l'encadrement de GAL : elle reste en français.
          <div id="alliance-partie-gestion" role="tabpanel" aria-labelledby="alliance-onglet-gestion" hidden={onglet !== "gestion"} lang={langue !== "fr" ? "fr" : undefined}>
            <AllianceGestion ctx={ctx} />
          </div>
        )}
        {access.kind === "allie" && <Sortie relire={relire} deconnecte={() => setConnecte(false)} t={t} />}
      </div>
    );
  })();

  return <TextesContexte.Provider value={t}>{contenu}</TextesContexte.Provider>;
}
