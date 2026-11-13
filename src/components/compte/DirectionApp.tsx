import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { MemberFilter } from "../../lib/compte/admin-members";
import { basePath, call } from "../../lib/compte/api";
import { pendingWords } from "../../lib/compte/pending";
import { ROLE_LABELS, type Role } from "../../lib/compte/types";
import { setPlayerView } from "../../lib/compte/vue-joueur";
import type { SiteHealthInput } from "../../lib/etat-site";
import { fmtInt } from "../../lib/format";
import type { LogoMatriceData } from "../../lib/logo-matrice";
import { tabsFor } from "../../lib/onglets";
import LogoMatrice from "../LogoMatrice";
import { Members, type MembersAsk } from "./AdminPanels";
import { DiscordButton, Loading, Problem, messageOf, useMe, usePendingCount } from "./common";
import DirectionActivite from "./DirectionActivite";
import DirectionAnnonces, { EMPTY_ANNOUNCEMENT } from "./DirectionAnnonces";
import DirectionDemandes from "./DirectionDemandes";
import DirectionDiscord from "./DirectionDiscord";
import DirectionEnsemble from "./DirectionEnsemble";
import DirectionEvenements, { EMPTY_EVENT } from "./DirectionEvenements";
import DirectionFondateur from "./DirectionFondateur";
import DirectionJournal from "./DirectionJournal";
import DirectionObjectif from "./DirectionObjectif";
import DirectionPolls, { EMPTY_POLL, type PollDraft } from "./DirectionPolls";
import DirectionWelcome from "./DirectionWelcome";
import DirectionWeeklyPick, { EMPTY_WEEKLY_PICK, type WeeklyPickDraft } from "./DirectionWeeklyPick";
import { Onglets, Partie, reducedMotion, useTabs, type TabItem } from "./Onglets";
import type { Overview } from "./direction-overview";
import Telemetrie from "./Telemetrie";

/**
 * Les onglets de la Direction. Le journal et Discord ne sont montrés qu'aux admins et au fondateur, le dernier qu'au fondateur.
 * Demandes, Comptes et Journal : l'administration, au QG du 10 au 12 novembre 2026, ici depuis (demande du pilote : elle est
 * destinée à l'encadrement). L'affichage suit le rang, mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien.
 * `icon` : la petite icône de la partie dans le menu (`src/lib/icones-parties.ts`). Événements et Sondages ont celles des
 * Événements et des Décisions du QG : c'est la même chose, vue de l'autre côté.
 */
const DIRECTION_TABS = [
  { id: "ensemble", label: "Vue d'ensemble", icon: "tour" },
  // Les visites du site, comptées par le site lui-même (demande du pilote, 13 novembre 2026) : src/lib/activite-site.ts.
  { id: "activite", label: "Activité du site", icon: "oeil" },
  { id: "demandes", label: "Demandes", icon: "porte" },
  // « Comptes » : les comptes du site, validés, en attente ou suspendus, et non la page publique des membres.
  { id: "comptes", label: "Comptes", icon: "bouclier" },
  { id: "journal", label: "Journal", icon: "tablette", rank: 3 },
  { id: "annonces", label: "Annonces", icon: "cor" },
  { id: "evenements", label: "Événements", icon: "banniere" },
  { id: "sondages", label: "Sondages", icon: "balance" },
  { id: "accueil", label: "Mot d'accueil", icon: "hutte" },
  { id: "semaine", label: "Gaulois de la semaine", icon: "coq" },
  { id: "objectif", label: "Objectif", icon: "cible" },
  { id: "discord", label: "Discord", icon: "corbeau", rank: 3 },
  { id: "fondateur", label: "Fondateur", icon: "cle", rank: 4 },
] as const;

/**
 * L'espace Direction, en onglets : une partie à la fois. `health` : l'état de la collecte et de la gazette, lu au moment
 * de la construction du site (voir direction.astro). Seules la vue d'ensemble, les annonces et les événements attendent
 * `get_direction_overview` : si elle échoue, les autres parties restent, et l'on peut toujours valider un membre.
 */
export default function DirectionApp({ health, logo }: { health: Omit<SiteHealthInput, "roster">; logo?: LogoMatriceData }) {
  const { me, failed, refresh } = useMe();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Les brouillons sont gardés ici : un aller-retour en vue joueur ferme les formulaires sans effacer le texte en cours.
  const [announcementDraft, setAnnouncementDraft] = useState(EMPTY_ANNOUNCEMENT);
  const [eventDraft, setEventDraft] = useState(EMPTY_EVENT);
  const [pollDraft, setPollDraft] = useState<PollDraft>(EMPTY_POLL);
  const [welcomeDraft, setWelcomeDraft] = useState<string | null>(null);
  const [pickDraft, setPickDraft] = useState<WeeklyPickDraft>(EMPTY_WEEKLY_PICK);
  // Qui vient, événement par événement : `undefined` tant que ce n'est pas lu, `null` si le serveur ne l'a pas donné.
  // Dans ce dernier cas, la liste des événements le dit, et reste lisible.
  const [attendance, setAttendance] = useState<Map<number, string[]> | null | undefined>(undefined);
  // Le filtre qu'une case de la vue d'ensemble demande à l'onglet Comptes.
  const [membersAsk, setMembersAsk] = useState<MembersAsk | null>(null);
  // Vrai une fois la liste des comptes lue : avant, la page n'est pas assez haute pour remonter jusqu'à elle.
  const [membersReady, setMembersReady] = useState(false);
  const rank = me?.rank ?? 0;
  const base = basePath();
  const tabs = tabsFor(DIRECTION_TABS, rank);
  const { active, slide, shown, select, call: called } = useTabs(tabs.map((tab) => tab.id));
  // Le nombre de l'onglet Demandes, relu dès qu'une demande est traitée, comme la pastille de l'en-tête.
  const pending = usePendingCount(rank >= 2);
  // Revenir à la vue d'ensemble la relit : une demande, un rôle ou une suspension traités ailleurs changent ses cases.
  const away = useRef(false);
  // Chaque lecture a son numéro : la réponse d'une lecture dépassée par une plus récente est écartée, sans remettre l'ancien état.
  const reads = useRef(0);

  const load = async () => {
    const mine = ++reads.current;
    let next: Overview | null = null;
    let problem: string | null = null;
    try {
      next = await call<Overview>("get_direction_overview");
    } catch (e) {
      problem = messageOf(e);
    }
    if (mine !== reads.current) return;
    if (next) setOverview(next);
    setError(problem);
    let people: Map<number, string[]> | null = null;
    try {
      const data = await call<{ rows: { event_id: number; names: string[] }[] }>("list_event_attendance");
      people = new Map(data.rows.map((r) => [r.event_id, r.names]));
    } catch {
      // Pas de réponse : `null`, et la liste des événements le dit.
    }
    if (mine === reads.current) setAttendance(people);
  };

  useEffect(() => {
    if (rank >= 2) void load();
  }, [rank]);

  useEffect(() => {
    if (active !== "ensemble") away.current = true;
    else if (away.current && rank >= 2) void load();
  }, [active]);

  // Comptes est une longue liste : à son ouverture (menu, case de la vue d'ensemble ou adresse #comptes), le menu des parties
  // remonte sous l'en-tête et la liste remplit l'écran, au lieu d'attendre sous le titre et le guerrier (pilote, 13 novembre
  // 2026 : « c'est chiant de descendre la page pour voir les membres »). La page ne fait que descendre vers la liste : si l'on
  // est déjà plus bas, elle ne bouge pas.
  useEffect(() => {
    if (active !== "comptes" || !membersReady) return;
    const bar = document.querySelector<HTMLElement>('[data-testid="direction"] .onglets');
    if (!bar) return;
    const margin = parseFloat(getComputedStyle(bar).scrollMarginTop) || 0;
    if (bar.getBoundingClientRect().top <= margin + 8) return;
    bar.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active, membersReady]);

  if (me === null) return <Loading />;
  if (failed) return <Problem message="Le service de connexion ne répond pas pour l'instant. Le reste du site continue de fonctionner." onRetry={() => void refresh()} />;
  if (!me.signed_in) {
    return (
      <section class="card max-w-xl p-6" data-testid="direction-signed-out">
        <p class="mb-4">Cet espace est réservé aux officiers et aux chefs du clan.</p>
        <DiscordButton returnPath="/direction" />
      </section>
    );
  }
  if (rank < 2) {
    return (
      <section class="card max-w-xl p-6" data-testid="direction-forbidden">
        <p>
          Cet espace est réservé aux officiers et aux chefs du clan. <a href={`${base}/compte`}>Voir mon compte</a>
        </p>
      </section>
    );
  }

  const qg = `${base}/qg`;
  const items: TabItem[] = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    count: tab.id === "demandes" && pending !== null && pending > 0 ? { value: pending, words: `${fmtInt(pending)} ${pendingWords(pending) ?? ""}`, tone: "alerte" } : null,
  }));
  const part = { prefix: "direction", active, slide };

  // Une case de la vue d'ensemble ouvre sa partie, et le focus y va : la case elle-même vient d'être masquée.
  const open = (id: string, filter?: MemberFilter) => {
    if (filter) setMembersAsk((ask) => ({ filter, n: (ask?.n ?? 0) + 1 }));
    select(id, true);
    requestAnimationFrame(() => document.getElementById(`direction-partie-${id}`)?.focus({ preventScroll: true }));
  };

  // Les parties lues par `get_direction_overview` : son refus s'affiche dans chacune, là où l'on regarde.
  const withOverview = (render: (data: Overview) => ComponentChildren) => (
    <>
      <Problem message={error} onRetry={() => void load()} />
      {overview ? <div class={error ? "mt-4" : undefined}>{render(overview)}</div> : !error && <Loading />}
    </>
  );

  return (
    <div class="grid grid-cols-1 gap-6" data-testid="direction">
      <section class="card flex flex-wrap items-center justify-between gap-4 p-5" aria-label="Vous, à la Direction" data-testid="direction-me" data-titre="session">
        <div class="min-w-0 flex-[1_1_11rem]">
          <p class="font-display text-2xl font-extrabold [overflow-wrap:anywhere]">{me.name}</p>
          <Telemetrie role={ROLE_LABELS[me.role as Role]} lastRunAt={health.meta.lastRunAt} testId="direction" />
        </div>
        <div class="flex flex-wrap gap-2">
          {/* Les idées des membres se tranchent au QG, là où les membres les proposent. */}
          <a class="btn btn-ghost" href={qg} data-testid="direction-qg">
            Le QG
          </a>
          <a class="btn btn-ghost" href={`${base}/compte`}>
            Mon compte
          </a>
          {/* Tout le site passe en vue de membre sans grade, jusqu'à « Quitter la vue joueur » en haut de chaque page. Le serveur garde le vrai rôle. */}
          <button type="button" class="btn btn-ghost" data-player-view-start data-testid="player-view-start" onClick={() => setPlayerView(true)}>
            Voir le site comme un joueur
          </button>
        </div>
      </section>
      <div class="grid grid-cols-1 gap-5">
        {/* `menu` : treize parties pour le fondateur, la barre ne les montrait pas toutes ; à la place, un menu déroulant, à toutes les largeurs. */}
        {/* `debut` : le petit logo du guerrier en mode Matrix, en tête du menu (style Terminal). */}
        <Onglets
          label="Les parties de la Direction"
          prefix="direction"
          tabs={items}
          active={active}
          onSelect={(id) => select(id)}
          call={called}
          menu
          debut={logo && <LogoMatrice data={logo} id="logo-menu" class="console-logo-menu" points />}
        />

        <Partie {...part} id="ensemble">
          {withOverview((data) => <DirectionEnsemble data={data} health={health} onOpen={open} />)}
        </Partie>

        <Partie {...part} id="activite">
          {shown.has("activite") && <DirectionActivite />}
        </Partie>

        {/* L'administration : lue au premier passage sur son onglet, puis gardée, avec ses champs remplis. */}
        <Partie {...part} id="demandes">
          {shown.has("demandes") && <DirectionDemandes />}
        </Partie>
        <Partie {...part} id="comptes">
          {shown.has("comptes") && <Members me={me} ask={membersAsk} active={active === "comptes"} onReady={() => setMembersReady(true)} />}
        </Partie>
        {rank >= 3 && (
          <Partie {...part} id="journal">
            {shown.has("journal") && <DirectionJournal />}
          </Partie>
        )}

        <Partie {...part} id="annonces">
          {withOverview((data) => (
            <DirectionAnnonces rows={data.announcements} reload={load} form={announcementDraft} setForm={setAnnouncementDraft} />
          ))}
        </Partie>

        <Partie {...part} id="evenements">
          {withOverview((data) => (
            <DirectionEvenements rows={data.events} attendance={attendance} reload={load} form={eventDraft} setForm={setEventDraft} />
          ))}
        </Partie>

        {/* Les parties suivantes lisent le serveur au premier passage sur leur onglet, puis restent dans la page. */}
        <Partie {...part} id="sondages">
          {shown.has("sondages") && <DirectionPolls form={pollDraft} setForm={setPollDraft} />}
        </Partie>

        <Partie {...part} id="accueil">
          {shown.has("accueil") && <DirectionWelcome draft={welcomeDraft} setDraft={setWelcomeDraft} />}
        </Partie>

        <Partie {...part} id="semaine">
          {shown.has("semaine") && <DirectionWeeklyPick draft={pickDraft} setDraft={setPickDraft} />}
        </Partie>

        {/* L'objectif de la semaine, que les membres voient au QG (outils du QG, 11 novembre 2026). */}
        <Partie {...part} id="objectif">
          {shown.has("objectif") && <DirectionObjectif />}
        </Partie>

        {/* Le serveur refuse le réglage sous le rang d'admin : l'onglet n'est qu'une commodité. */}
        {rank >= 3 && (
          <Partie {...part} id="discord">
            {shown.has("discord") && <DirectionDiscord />}
          </Partie>
        )}

        {me.role === "founder" && (
          <Partie {...part} id="fondateur">
            {shown.has("fondateur") && (
              <DirectionFondateur
                onDone={async () => {
                  await refresh();
                  await load();
                }}
              />
            )}
          </Partie>
        )}
      </div>
    </div>
  );
}
