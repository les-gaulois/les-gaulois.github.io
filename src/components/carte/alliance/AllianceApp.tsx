/**
 * La fenêtre « Alliance » de la page Carte (13 novembre 2026, demande du pilote) : la porte de la carte de l'alliance pour
 * tout le monde, puis, pour les Gaulois validés et les joueurs alliés invités, les alliances, les zones à prendre et la
 * discussion. Ouverte, elle remplace le film par la carte de l'alliance (`src/scripts/alliance-ecran.ts`).
 *
 * Un visiteur sans session ne télécharge pas Supabase tant qu'il ne choisit pas de se connecter. Le serveur décide de tout :
 * un allié n'entre que par un lien d'invitation de l'encadrement, et jamais au QG.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { totauxAlliances } from "../../../lib/alliance/bilan";
import { dernierNumero, nonLus } from "../../../lib/alliance/discussion";
import { INVITATION_KEY, RETOUR_CARTE_KEY, invitationDeLAncre, jetonValable } from "../../../lib/alliance/invitation";
import { masqueDeLaZone } from "../../../lib/alliance/masque";
import type { AccesCarte, AllianceLigne, CarteAlliance, MessageAlliance } from "../../../lib/alliance/types";
import { ServerError, call, mayHaveSession, signOut, supabase } from "../../../lib/compte/api";
import { fmtInt } from "../../../lib/format";
import { ecranAlliance, type Chargement, type InfoPixel, type ZoneAffichee } from "../../../scripts/alliance-ecran";
import { CodeLogin, DiscordButton, DiscordGives, Problem, codeLoginShown, messageOf, usePlayerView } from "../../compte/common";
import AllianceGestion from "./AllianceGestion";
import AllianceMessages from "./AllianceMessages";
import AllianceVue from "./AllianceVue";
import AllianceZones from "./AllianceZones";
import type { Contexte } from "./commun";

type Onglet = "vue" | "zones" | "messages" | "gestion";
const VU_KEY = "gal-alliance-vu";

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

function Porte({ invitation, connecte }: { invitation: string | null; connecte: () => void }) {
  return (
    <div data-testid="alliance-porte">
      <p>{invitation ? "L'encadrement de GAL vous invite. Connectez-vous pour accepter." : "Réservée aux Gaulois et aux joueurs des clans alliés que l'encadrement de GAL invite."}</p>
      <div class="mt-4">
        <DiscordButton returnPath="/compte" avant={() => ecrireStockage(session, RETOUR_CARTE_KEY, String(Date.now()))} />
      </div>
      <DiscordGives />
      {codeLoginShown() && <CodeLogin connecte={connecte} />}
    </div>
  );
}

function Accepter({ invitation, relire }: { invitation: string; relire: () => Promise<void> }) {
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const accepter = async () => {
    setBusy(true);
    setErreur(null);
    try {
      await call("accept_alliance_invite", { p_token: invitation, p_alias: nom });
      ecrireStockage(session, INVITATION_KEY, null);
      await relire();
    } catch (e) {
      setErreur(messageOf(e));
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
      <p>L'encadrement de GAL vous invite sur la carte de l'alliance.</p>
      <div>
        <label for="alliance-nom" class="text-sm font-semibold">
          Votre nom sur la carte de l'alliance
        </label>
        <input id="alliance-nom" class="field mt-1" required minLength={2} maxLength={24} placeholder="Votre pseudo OpenFront" value={nom} onInput={(e) => setNom(e.currentTarget.value)} />
      </div>
      <div>
        <button type="submit" class="btn btn-primary" disabled={busy || nom.trim().length < 2}>
          Rejoindre la carte de l'alliance
        </button>
      </div>
      <Problem message={erreur} />
    </form>
  );
}

/** Pour un allié : se déconnecter, ou quitter la carte de l'alliance, à part et en deux temps (son accès ne revient qu'avec une nouvelle invitation). */
function Sortie({ relire, deconnecte }: { relire: () => Promise<void>; deconnecte: () => void }) {
  const [arme, setArme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div class="alliance-a-part mt-4">
      <div class="alliance-ligne">
        <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" onClick={() => void signOut().then(deconnecte)}>
          Se déconnecter
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
              .catch((e: unknown) => setErreur(messageOf(e)));
          }}
        >
          {arme ? "Confirmer : quitter la carte" : "Quitter la carte de l'alliance"}
        </button>
      </div>
      <Problem message={erreur} />
    </div>
  );
}

export default function AllianceApp() {
  const ecran = useMemo(() => ecranAlliance(), []);
  const root = useMemo(() => document.querySelector<HTMLElement>("[data-carte]"), []);
  const [invitation, setInvitation] = useState<string | null>(() => prendreInvitation());
  const [connecte, setConnecte] = useState(() => mayHaveSession());
  const [carte, setCarte] = useState<{ status: "attente" } | { status: "erreur"; message: string } | { status: "prete"; donnees: CarteAlliance }>({ status: "attente" });
  const [charge, setCharge] = useState<Chargement | null>(null);
  const [chargeErreur, setChargeErreur] = useState(false);
  const [ouverte, setOuverte] = useState(() => fenetreOuverte(root));
  const [onglet, setOnglet] = useState<Onglet>("vue");
  const [couleursDesClans, setCouleursDesClans] = useState(false);
  const [selection, setSelection] = useState<number | null>(null);
  const [edition, setEdition] = useState<{ id: number | null; titre: string; tag: string } | null>(null);
  const [messages, setMessages] = useState<MessageAlliance[] | null>(null);
  const [erreurMessages, setErreurMessages] = useState<string | null>(null);
  const [vu, setVu] = useState<number | null>(() => {
    const v = Number(lireStockage(local, VU_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const hud = useRef(root?.querySelector<HTMLElement>("[data-alliance-hud]") ?? null);
  const playerView = usePlayerView();

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
      setCarte({ status: "erreur", message: messageOf(e) });
    }
  }, []);

  useEffect(() => {
    if (connecte) void relire();
  }, [connecte, relire]);

  const access: AccesCarte | null = carte.status === "prete" ? carte.donnees.access : null;

  // La carte publiée (film et état pixel par pixel) ne se charge que pour qui a accès, à la première ouverture de la fenêtre.
  useEffect(() => {
    if (!access || !ecran || charge || !ouverte) return;
    ecran
      .charger()
      .then(setCharge)
      .catch(() => setChargeErreur(true));
  }, [access, ecran, charge, ouverte]);

  // Un Gaulois validé n'a pas besoin d'invitation : celle qui traîne dans l'onglet s'efface. Un allié peut en recevoir une
  // nouvelle, pour un autre clan : il la garde, et l'accepte au-dessus des onglets.
  useEffect(() => {
    if (access?.kind === "gaulois" && invitation) {
      ecrireStockage(session, INVITATION_KEY, null);
      setInvitation(null);
    }
  }, [access, invitation]);

  const staff = Boolean(access?.staff) && !playerView;
  const donnees = carte.status === "prete" ? carte.donnees : null;
  const alliances = donnees?.alliances ?? AUCUNE;
  const ours = donnees?.ours ?? null;
  const notres = useMemo(() => new Set(alliances.find((a) => a.id === ours)?.clans ?? []), [alliances, ours]);
  const totaux = useMemo(() => (charge ? totauxAlliances(alliances, charge.film.standings, charge.film.claimed) : []), [alliances, charge]);

  // La carte de l'alliance à la place du film, tant que la fenêtre est ouverte. Un dessin en cours reste, fenêtre fermée :
  // il se retrouve à la réouverture.
  const montree = ouverte && access !== null && charge !== null && charge.etat !== null;
  useEffect(() => {
    ecran?.montrer(montree);
  }, [ecran, montree]);

  useEffect(() => {
    if (!ecran || !charge) return;
    const couleurs = new Map<string, number>();
    for (const a of alliances) for (const tag of a.clans) couleurs.set(tag, a.color);
    ecran.regler(couleurs, couleursDesClans ? "clans" : "alliances");
  }, [ecran, charge, alliances, couleursDesClans]);

  useEffect(() => {
    if (!ecran || !charge) return;
    const zones: ZoneAffichee[] = [];
    for (const z of donnees?.zones ?? []) {
      const masque = masqueDeLaZone(z);
      if (masque) zones.push({ id: z.id, title: z.title, masque });
    }
    ecran.montrerZones(zones, selection);
  }, [ecran, charge, donnees, selection]);

  // Ce qu'il y a sous la souris, écrit sur la carte ; un clic sur une zone la choisit.
  useEffect(() => {
    if (!ecran) return;
    const nomDAlliance = (tag: string | null) => (tag === null ? null : (alliances.find((a) => a.clans.includes(tag))?.name ?? null));
    const texte = (info: InfoPixel) => {
      const pos = `x ${String(info.x).padStart(4, "0")} · y ${String(info.y).padStart(4, "0")}`;
      const quoi = info.sorte === "mer" ? "Mer" : info.sorte === "neutre" ? "Terre neutre" : `${info.tag ?? "Clan supprimé"}${nomDAlliance(info.tag) ? ` · ${nomDAlliance(info.tag)}` : ""}`;
      const zone = info.zone === null ? "" : ` · zone « ${donnees?.zones?.find((z) => z.id === info.zone)?.title ?? ""} »`;
      return `${pos} · ${quoi}${zone}`;
    };
    ecran.onSurvol = (info) => {
      if (hud.current) hud.current.textContent = info ? texte(info) : "";
    };
    ecran.onClic = (info) => {
      if (edition) return;
      if (info.zone !== null) {
        setSelection(info.zone);
        setOnglet("zones");
      } else setSelection(null);
    };
  }, [ecran, alliances, donnees, edition]);

  const choisir = useCallback(
    (id: number | null, viser: boolean) => {
      setSelection(id);
      const zone = donnees?.zones?.find((z) => z.id === id);
      if (viser && zone && ecran) ecran.viser({ x: zone.x, y: zone.y, w: zone.w, h: zone.h });
    },
    [donnees, ecran],
  );

  // La discussion : relue toutes les 10 secondes quand elle est sous les yeux, chaque minute sinon, pour le nombre de nouveaux.
  const lireMessages = useCallback(async () => {
    try {
      const r = await call<{ messages: MessageAlliance[] }>("get_alliance_messages");
      setMessages(r.messages);
      setErreurMessages(null);
    } catch (e) {
      setErreurMessages(messageOf(e));
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

  // Les nouveaux messages se voient aussi sur l'entrée « Alliance » de la rangée du bas, fenêtre fermée.
  useEffect(() => {
    for (const lien of document.querySelectorAll<HTMLElement>('.carte-dock [data-ouvre="alliance"]')) {
      let pastille = lien.querySelector<HTMLElement>("[data-alliance-nouveaux]");
      if (nouveaux === 0) {
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
      mot.textContent = nouveaux > 1 ? " nouveaux messages" : " nouveau message";
      pastille.append(fmtInt(nouveaux), mot);
    }
  }, [nouveaux]);

  // Connecté avec un code, sur la carte même : la page se recharge, pour que l'en-tête dise aussi qui est connecté.
  if (!connecte) return <Porte invitation={invitation} connecte={() => location.reload()} />;
  if (carte.status === "attente")
    return (
      <p class="text-muted" role="status">
        Lecture de la carte de l'alliance…
      </p>
    );
  if (carte.status === "erreur") return <Problem message={carte.message} onRetry={() => void relire()} />;

  if (!access || !donnees) {
    return (
      <div data-testid="alliance-sans-acces">
        {invitation ? (
          <Accepter invitation={invitation} relire={relire} />
        ) : (
          <>
            <p>Ce compte n'a pas accès à la carte de l'alliance.</p>
            <p class="mt-2 text-muted">Un joueur allié entre avec le lien d'invitation de l'encadrement de GAL ; un Gaulois, une fois son compte validé.</p>
          </>
        )}
        <button type="button" class="btn btn-ghost mt-4" onClick={() => void signOut().then(() => setConnecte(false))}>
          Se déconnecter
        </button>
      </div>
    );
  }

  if (chargeErreur) return <Problem message="La carte n'a pas pu se charger. Rechargez la page." />;
  if (!charge)
    return (
      <p class="text-muted" role="status">
        Chargement de la carte…
      </p>
    );

  const ctx: Contexte = { donnees: { ...donnees, access }, film: charge.film, etat: charge.etat, staff, totaux, notres, relire };
  const onglets: { id: Onglet; label: string; compte?: number }[] = [
    { id: "vue", label: "Alliances" },
    { id: "zones", label: "Zones" },
    { id: "messages", label: "Messages", compte: nouveaux },
    ...(staff ? [{ id: "gestion" as const, label: "Gestion" }] : []),
  ];

  return (
    <div data-testid="alliance-app">
      <p class="carte-petit text-muted" data-testid="alliance-moi">
        Connecté : <strong class="text-white">[{access.tag}] {access.name}</strong>
        {access.kind === "allie" ? " · joueur allié invité" : staff ? " · encadrement de GAL" : ""}
      </p>
      {!charge.etat && <p class="form-problem mt-2">La carte pixel par pixel n'est pas publiée pour ce relevé : le film reste affiché, et les zones ne se comptent pas.</p>}
      {/* Un allié réinvité, pour un autre clan : il accepte ici, sans quitter la carte. */}
      {access.kind === "allie" && invitation && (
        <div class="carte-bloc">
          <Accepter invitation={invitation} relire={relire} />
        </div>
      )}
      <div class="alliance-onglets" role="tablist" aria-label="Parties de la carte de l'alliance">
        {onglets.map((o) => (
          <button
            type="button"
            role="tab"
            id={`alliance-onglet-${o.id}`}
            aria-selected={onglet === o.id}
            aria-controls={`alliance-partie-${o.id}`}
            tabIndex={onglet === o.id ? 0 : -1}
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
                {fmtInt(o.compte)}
                <span class="sr-only"> nouveaux</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div id="alliance-partie-vue" role="tabpanel" aria-labelledby="alliance-onglet-vue" hidden={onglet !== "vue"}>
        <AllianceVue ctx={ctx} couleursDesClans={couleursDesClans} setCouleursDesClans={setCouleursDesClans} />
      </div>
      <div id="alliance-partie-zones" role="tabpanel" aria-labelledby="alliance-onglet-zones" hidden={onglet !== "zones"}>
        {ecran && <AllianceZones ctx={ctx} ecran={ecran} selection={selection} choisir={choisir} edition={edition} setEdition={setEdition} />}
      </div>
      <div id="alliance-partie-messages" role="tabpanel" aria-labelledby="alliance-onglet-messages" hidden={onglet !== "messages"}>
        <AllianceMessages messages={messages} erreurLecture={erreurMessages} relire={lireMessages} />
      </div>
      {staff && (
        <div id="alliance-partie-gestion" role="tabpanel" aria-labelledby="alliance-onglet-gestion" hidden={onglet !== "gestion"}>
          <AllianceGestion ctx={ctx} />
        </div>
      )}
      {access.kind === "allie" && <Sortie relire={relire} deconnecte={() => setConnecte(false)} />}
    </div>
  );
}
