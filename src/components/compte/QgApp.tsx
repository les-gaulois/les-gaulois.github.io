import { useCallback, useEffect, useState } from "preact/hooks";
import { CODE_LOGIN_OPEN, basePath, call } from "../../lib/compte/api";
import { othersPlanned, parseQgTools, type QgTools } from "../../lib/compte/outils";
import { IDEA_STATUS_LABELS, counted, openIdeas, parseQg, pollsAwaitingVote, type QgData } from "../../lib/compte/qg";
import { fermeturePassee } from "../../lib/compte/qg-decisions";
import { predictionClosed } from "../../lib/compte/qg-semaine";
import { waitingOthers } from "../../lib/compte/salons";
import { ROLE_LABELS, type Me } from "../../lib/compte/types";
import { fmtDate } from "../../lib/format";
import type { LogoMatriceData } from "../../lib/logo-matrice";
import { tabOfHash } from "../../lib/onglets";
import type { StoredMembers } from "../../lib/schemas";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import LogoMatrice from "../LogoMatrice";
import { subscribe } from "./appels";
import { Avatar, CodeLogin, DiscordButton, DiscordGives, Loading, Problem, messageOf, useMe, useNow, type Loadable } from "./common";
import { useLienAttendu } from "./LienOpenFront";
import { Onglets, Partie, reducedMotion, useTabs, type TabItem } from "./Onglets";
import QgCeSoir from "./QgCeSoir";
import QgDecisions from "./QgDecisions";
import QgEvenements from "./QgEvenements";
import QgIdees from "./QgIdees";
import QgMoi from "./QgMoi";
import QgMur from "./QgMur";
import QgSalons from "./QgSalons";
import QgSemaine from "./QgSemaine";
import QgSimulateur from "./QgSimulateur";
import Telemetrie from "./Telemetrie";

/**
 * Les onglets du QG, ceux des membres. L'administration (demandes, comptes, journal), au QG du 10 au 12 novembre 2026, est
 * dans la Direction : elle est réservée à l'encadrement (`DirectionApp.tsx`).
 * « Moi », « Ce soir » et « La semaine » viennent des outils du QG (11 novembre 2026, `get_qg_tools`) : sans eux, le QG
 * s'ouvre sur « Salons », comme avant.
 * `icon` : la petite icône de la partie dans le menu (`src/lib/icones-parties.ts`). Décisions et Événements ont celles
 * des Sondages et des Événements de la Direction : c'est la même chose, vue de l'autre côté.
 */
const QG_TABS = [
  { id: "moi", label: "Moi", icon: "casque" },
  { id: "salons", label: "Salons", icon: "feu" },
  { id: "ce-soir", label: "Ce soir", icon: "lune" },
  { id: "semaine", label: "La semaine", icon: "calendrier" },
  { id: "simulateur", label: "Simulateur", icon: "abaque" },
  { id: "decisions", label: "Décisions", icon: "balance" },
  { id: "evenements", label: "Événements", icon: "banniere" },
  { id: "idees", label: "Idées", icon: "eclair" },
  { id: "mur", label: "Le mur", icon: "mur" },
] as const;

/** La porte du QG, pour un visiteur ou un compte pas encore validé : ce qu'il y a derrière, et comment entrer. */
function Door({ me }: { me: Me }) {
  const base = basePath();
  const lien = useLienAttendu(me);
  return (
    <section class="card max-w-3xl p-6" data-testid="qg-door">
      <h2 class="text-2xl">Réservé aux membres de GAL</h2>
      <p class="mt-3 text-muted">Salons, sondages, idées, événements et mur des membres.</p>
      <ol class="mt-4 list-decimal space-y-2 pl-6">
        <li>{CODE_LOGIN_OPEN ? "Connectez-vous avec Discord, ou avec un code demandé dans le Discord du clan." : "Connectez-vous avec Discord."}</li>
        <li>Donnez le lien de votre profil OpenFront dans « Mon compte » : c'est obligatoire.</li>
        <li>Le site vérifie qu'il figure dans la liste des membres de GAL.</li>
        <li>Un officier confirme que c'est bien vous. Ensuite, le site vous reconnaît à chaque visite.</li>
      </ol>
      {!me.signed_in && (
        <>
          <div class="mt-6">
            <DiscordButton returnPath="/compte" />
          </div>
          <p class="mt-3 text-sm text-muted">Le site ne reçoit jamais votre mot de passe.</p>
          <DiscordGives />
          {CODE_LOGIN_OPEN && <CodeLogin />}
        </>
      )}
      {me.signed_in && me.status === "pending" && lien === true && (
        <div class="mt-6" data-testid="qg-lien">
          <p>
            <strong>Il manque le lien de votre profil OpenFront.</strong>
          </p>
          <a class="btn btn-primary mt-3" href={`${base}/compte`}>
            Donner mon lien OpenFront
          </a>
        </div>
      )}
      {me.signed_in && me.status === "pending" && lien === false && (
        <p class="mt-6" data-testid="qg-pending">
          <strong>Votre compte attend sa validation.</strong> Faites ou suivez votre demande dans <a href={`${base}/compte`}>Mon compte</a>.
        </p>
      )}
      {me.signed_in && me.status === "suspended" && (
        <p class="form-problem mt-6" data-testid="qg-suspended">
          Ce compte est suspendu{me.status_reason ? ` : ${me.status_reason}` : "."} Le QG lui est fermé.
        </p>
      )}
    </section>
  );
}

/**
 * Le QG, pour un membre validé : une partie à la fois, sous ses onglets. `rank` : celui du compte affiché (en vue joueur,
 * l'encadrement s'y voit membre sans grade, sans ses commandes de décision). Le serveur revérifie chaque action.
 * Les salons ne dépendent pas de la lecture du QG (`get_qg`) : si elle échoue, ils restent. Les onglets attendent la
 * réponse des outils (`get_qg_tools`), six secondes au plus : au-delà, le QG s'ouvre sans eux, et ils paraissent à leur
 * réponse. `lastRunAt` : la dernière collecte publiée, que la fenêtre « session » donne à côté de l'heure (style Terminal,
 * voir docs/DESIGN.md). `logo` : le petit logo du guerrier en mode Matrix, en tête du menu des parties, comme à la Direction.
 */
function Inside({ me, rank, lastRunAt, logo }: { me: Me; rank: number; lastRunAt: string | null; logo?: LogoMatriceData }) {
  const staff = rank >= 2;
  const [state, setState] = useState<Loadable<QgData>>({ status: "loading" });
  // Les outils du QG : un serveur d'avant leur migration répond par un refus, et leurs onglets ne paraissent pas.
  const [tools, setTools] = useState<Loadable<QgTools>>({ status: "loading" });
  // Les données publiques que lisent « Moi » et « La semaine » : `undefined` en lecture, `null` si illisibles.
  const [members, setMembers] = useState<StoredMembers | null | undefined>(undefined);
  const [weekFile, setWeekFile] = useState<ClanWeekFile | null | undefined>(undefined);
  const [toolsLate, setToolsLate] = useState(false);
  // Chaque minute : une heure de « Ce soir » qui finit quitte le nombre de son onglet.
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  // Le refus du serveur s'affiche à l'endroit de l'action, dans sa partie : un message en haut de page ne se verrait pas.
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  // Ce que les lecteurs d'écran entendent après une action : la zone existe déjà, seul son texte change.
  const [said, setSaid] = useState("");
  // Les autres Gaulois qui attendent dans un salon, d'après la dernière lecture des appels.
  const [waiting, setWaiting] = useState(0);
  const data = state.status === "ready" ? state.data : null;
  const kit = tools.status === "ready" ? tools.data : null;
  // Une partie vide n'a pas d'onglet : décisions et événements n'en ont un qu'une fois lus, s'il y a quelque chose. Le mur garde
  // le sien, qui porte le choix de se montrer. Si le QG ne se lit pas, ses parties s'effacent ; les salons et le simulateur restent.
  // Un lien vers un onglet absent au premier rendu l'ouvre dès qu'il paraît.
  const present = (id: string) => {
    if (id === "decisions") return (data?.polls.length ?? 0) > 0;
    if (id === "evenements") return (data?.events.length ?? 0) > 0;
    if (id === "idees" || id === "mur") return state.status !== "error";
    if (id === "moi" || id === "ce-soir" || id === "semaine") return kit !== null;
    return true;
  };
  const tabs = QG_TABS.filter((tab) => present(tab.id));
  const { active, slide, shown: opened, select, call: called, hold } = useTabs(tabs.map((tab) => tab.id));
  const base = basePath();
  const name = me.name ?? "Membre";

  /** Relit le QG. Rend le refus, ou `null`. Déjà lu, il garde ce qui est à l'écran : le refus se dit là où l'on agit. */
  const load = useCallback(async (): Promise<string | null> => {
    let message: string;
    try {
      const read = parseQg(await call<unknown>("get_qg"));
      if (read) {
        setState({ status: "ready", data: read });
        return null;
      }
      message = "La réponse du serveur est illisible. Rechargez la page.";
    } catch (e) {
      message = messageOf(e);
    }
    setState((s) => (s.status === "ready" ? s : { status: "error", message }));
    return message;
  }, []);

  /** Relit les outils du QG. Même règle que `load` : déjà lus, ils restent à l'écran si la relecture échoue. */
  const loadTools = useCallback(async (): Promise<string | null> => {
    let message: string;
    try {
      const read = parseQgTools(await call<unknown>("get_qg_tools"));
      if (read) {
        setTools({ status: "ready", data: read });
        return null;
      }
      message = "La réponse du serveur est illisible. Rechargez la page.";
    } catch (e) {
      message = messageOf(e);
    }
    setTools((s) => (s.status === "ready" ? s : { status: "error", message }));
    return message;
  }, []);

  useEffect(() => {
    void load();
    void loadTools();
    const late = window.setTimeout(() => setToolsLate(true), 6_000);
    return () => window.clearTimeout(late);
  }, [load, loadTools]);

  // Le QG s'est ouvert sans les outils : l'onglet affiché reste, même quand « Moi » paraît en tête à leur réponse.
  const toolsPending = tools.status === "loading";
  useEffect(() => {
    if (toolsLate && toolsPending) hold();
  }, [toolsLate, toolsPending, hold]);

  // Les chiffres publics du site, lus une fois que les outils répondent : sans eux, rien ne les affiche.
  const toolsReady = kit !== null;
  useEffect(() => {
    if (!toolsReady) return;
    const base = basePath();
    const read = <T,>(path: string) =>
      fetch(`${base}${path}`)
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .catch(() => null);
    void read<StoredMembers>("/data/members.json").then((list) => setMembers(list && Array.isArray(list.members) ? list : null));
    void read<ClanWeekFile>("/semaine-du-clan.json").then((file) => setWeekFile(file && Array.isArray(file.weeks) ? file : null));
  }, [toolsReady]);

  // Le relevé des appels est celui de tout le site (`appels.ts`) : l'onglet compte ceux des autres Gaulois.
  useEffect(() => subscribe((next) => setWaiting(waitingOthers(next.data?.calls ?? []))), []);

  // Choisir une partie (dans le menu, ou par une adresse qui en nomme une) fait remonter le menu des parties sous l'en-tête :
  // la partie remplit l'écran au lieu d'attendre sous le titre, le guerrier et la fenêtre « session », comme Comptes à la
  // Direction (pilote, 13 et 14 novembre 2026 : « c'est chiant de descendre la page »). La page ne fait que descendre : déjà
  // plus bas, elle ne bouge pas. Un simple passage sur /qg, sans choix, ne la fait pas bouger.
  const [chosen, setChosen] = useState(() => (tabOfHash(location.hash, QG_TABS.map((tab) => tab.id)) === null ? 0 : 1));
  const menuShown = tools.status !== "loading" || toolsLate;
  const contentRead = state.status !== "loading";
  useEffect(() => {
    if (chosen === 0 || !menuShown || !contentRead) return;
    const frame = requestAnimationFrame(() => {
      const bar = document.querySelector<HTMLElement>('[data-testid="qg"] .onglets');
      if (!bar) return;
      const margin = parseFloat(getComputedStyle(bar).scrollMarginTop) || 0;
      if (bar.getBoundingClientRect().top <= margin + 8) return;
      bar.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [chosen, menuShown, contentRead]);

  /**
   * Une action, puis une relecture : ce qui s'affiche vient toujours du serveur, jamais d'un calcul fait ici. `reread` :
   * ce que l'action change, le QG (`get_qg`) ou ses outils (`get_qg_tools`) ; se montrer change les deux.
   */
  const act = async (at: string, action: () => Promise<unknown>, done: string, reread: "qg" | "outils" | "tout" = "qg"): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      try {
        await action();
      } catch (e) {
        setError({ at, message: messageOf(e) });
        return false;
      }
      // Le serveur a accepté. Si la relecture échoue, l'écran garde l'état d'avant : il le dit.
      const [qgFailed, toolsFailed] = await Promise.all([reread === "outils" ? null : load(), reread === "qg" ? null : loadTools()]);
      if (qgFailed !== null || toolsFailed !== null) setError({ at, message: "C'est enregistré, mais l'affichage n'a pas pu être relu. Rechargez la page." });
      setSaid(done);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const problemAt = (at: string) => (error?.at === at ? error.message : null);
  const ideasToDecide = data ? openIdeas(data.ideas).length : 0;
  // Un sondage dont l'heure de fermeture est passée ne se vote plus, même avant la relecture du serveur : il ne compte pas.
  const notVoted = pollsAwaitingVote((data?.polls ?? []).filter((poll) => !fermeturePassee(poll.closes_at, now.getTime())));

  // Le nombre d'un onglet dit ce qui attend le membre derrière lui, jamais un total à lire : il disparaît une fois l'affaire faite.
  const counts: Partial<Record<string, TabItem["count"]>> = {
    salons: { value: waiting, words: counted(waiting, "Gaulois attend dans un salon", "Gaulois attendent dans un salon"), tone: "vif" },
    "ce-soir": kit ? { value: othersPlanned(kit.plans, now), words: counted(othersPlanned(kit.plans, now), "autre Gaulois a dit son heure", "autres Gaulois ont dit leur heure") } : null,
    // Un pronostic clos ne se fait plus : l'onglet ne le compte plus (même règle que La semaine).
    semaine: kit?.predictions && kit.predictions.mine === null && !predictionClosed(kit.predictions.closesAt, now.getTime()) ? { value: 1, words: "1 pronostic à faire" } : null,
    decisions: { value: notVoted, words: counted(notVoted, "sondage attend votre voix", "sondages attendent votre voix") },
    idees: staff ? { value: ideasToDecide, words: counted(ideasToDecide, "idée à trancher", "idées à trancher") } : null,
  };
  const items: TabItem[] = tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, count: counts[tab.id] ?? null }));
  const part = { prefix: "qg", active, slide };
  const opening = <Loading label="Ouverture du QG…" />;

  return (
    <div class="grid grid-cols-1 gap-6" data-testid="qg">
      <div class={`grid grid-cols-1 items-start gap-4 ${data?.welcome ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
        {/* `data-titre` : le nom de la fenêtre, écrit dans sa barre de titre par le style Terminal (décoratif). */}
        <section class="card flex flex-wrap items-center gap-4 p-5" aria-label="Vous, au QG" data-testid="qg-me" data-titre="session">
          <Avatar name={name} avatar={data?.me.avatar ?? null} large />
          {/* Le nom garde sa largeur : faute de place, les liens passent dessous. */}
          <div class="min-w-0 flex-[1_1_11rem]">
            <p class="font-display text-2xl font-extrabold [overflow-wrap:anywhere]" data-testid="qg-name">
              {name}
            </p>
            <Telemetrie role={ROLE_LABELS[me.role ?? "member"]} lastRunAt={lastRunAt} testId="qg" />
          </div>
          {/* Sur téléphone, l'en-tête n'a qu'un lien (« QG », ou « Direction » pour l'encadrement) : le compte et la Direction s'ouvrent aussi d'ici, même en panne. */}
          <div class="flex flex-wrap gap-2">
            <a class="btn btn-ghost" href={`${base}/compte`}>
              Mon compte
            </a>
            {staff && (
              <a class="btn btn-ghost" href={`${base}/direction`} data-testid="qg-direction">
                Direction
              </a>
            )}
          </div>
        </section>

        {data?.welcome && (
          // « motd » : le message du jour qu'un terminal affiche à l'ouverture d'une session.
          <section class="card p-5" aria-labelledby="welcome-title" data-testid="qg-welcome" data-titre="motd">
            <h2 id="welcome-title" class="text-xl">
              Le mot de l'encadrement
            </h2>
            <p class="mt-2 whitespace-pre-line">{data.welcome.body}</p>
            {data.welcome.updated_at && <p class="tnum mt-2 text-sm text-muted">Mis à jour le {fmtDate(data.welcome.updated_at)}</p>}
          </section>
        )}
      </div>

      {state.status === "error" && (
        <div data-testid="qg-closed">
          <Problem message={state.message} onRetry={() => void load()} />
        </div>
      )}

      <p class="sr-only" role="status">
        {said}
      </p>

      {/* Les onglets attendent la réponse des outils, refus compris : sinon la page s'ouvrirait sur « Salons », puis sauterait sur « Moi ». */}
      {tools.status === "loading" && !toolsLate ? (
        opening
      ) : (
        <div class="grid grid-cols-1 gap-5">
          {/* `menu` : le menu déroulant de la Direction, à la place de la barre d'onglets (demande du pilote, 12 novembre 2026). */}
          {/* `debut` : le petit logo du guerrier en mode Matrix, en tête du menu, comme à la Direction. */}
          <Onglets
            label="Les parties du QG"
            prefix="qg"
            tabs={items}
            active={active}
            onSelect={(id) => {
              select(id);
              setChosen((n) => n + 1);
            }}
            call={called}
            menu
            debut={logo && <LogoMatrice data={logo} id="logo-menu" class="console-logo-menu" points />}
          />

          {kit && (
            <Partie {...part} id="moi">
              <QgMoi
                me={kit.me}
                members={members}
                file={weekFile}
                now={now}
                attente={{
                  waiting,
                  notVoted,
                  prediction: kit.predictions,
                  plan: { mine: kit.plans.mine, others: othersPlanned(kit.plans, now) },
                  ideasToDecide: staff && data ? ideasToDecide : null,
                }}
              />
            </Partie>
          )}

          <Partie {...part} id="salons">
            <QgSalons voice={kit?.voice ?? null} />
          </Partie>

          {kit && (
            <Partie {...part} id="ce-soir">
              <QgCeSoir
                plans={kit.plans}
                busy={busy}
                problem={problemAt("plan")}
                onChoose={(at) => void act("plan", () => call("set_play_plan", { p_at: at }), at === null ? "Votre heure est retirée." : "Votre heure est notée.", "outils")}
              />
            </Partie>
          )}

          {kit && (
            <Partie {...part} id="semaine">
              <QgSemaine
                goal={kit.goal}
                predictions={kit.predictions}
                file={weekFile}
                busy={busy}
                problem={problemAt("pronostic")}
                onPredict={(wins) => act("pronostic", () => call("save_prediction", { p_wins: wins }), "Pronostic enregistré.", "outils")}
                onExpired={() => void loadTools()}
              />
            </Partie>
          )}

          {/* Le simulateur ne lit que des données publiques : il ne dépend ni de get_qg ni des outils. Lu au premier passage. */}
          <Partie {...part} id="simulateur">
            {opened.has("simulateur") && <QgSimulateur />}
          </Partie>

          {data && data.polls.length > 0 && (
            <Partie {...part} id="decisions">
              {/* Un vote refusé fait relire le QG : un sondage fermé depuis la dernière lecture s'y montre alors fermé. */}
              <QgDecisions
                polls={data.polls}
                busy={busy}
                problem={problemAt("polls")}
                now={now.getTime()}
                onVote={(poll, choice) => void act("polls", () => call("vote_poll", { p_poll: poll, p_choice: choice }), "Vote enregistré.").then((ok) => (ok ? null : load()))}
              />
            </Partie>
          )}

          {data && data.events.length > 0 && (
            <Partie {...part} id="evenements">
              <QgEvenements
                events={data.events}
                now={now}
                busy={busy}
                problemAt={problemAt}
                onAnswer={(event, going) => void act(`event-${event}`, () => call("set_attendance", { p_event: event, p_going: going }), going ? "Votre présence est notée." : "Votre présence est retirée.")}
              />
            </Partie>
          )}

          {present("idees") && (
            <Partie {...part} id="idees">
              {data ? (
                <QgIdees
                  ideas={data.ideas}
                  staff={staff}
                  busy={busy}
                  problemAt={problemAt}
                  onSend={(body) => act("idea-form", () => call("save_idea", { p_body: body }), "Idée proposée.")}
                  onSupport={(i) => void act(`idea-${i.id}`, () => call("support_idea", { p_idea: i.id, p_on: !i.supported }), i.supported ? "Soutien retiré." : "Soutien noté.")}
                  onDelete={(i) => act(`idea-${i.id}`, () => call("delete_idea", { p_idea: i.id }), "Idée retirée.")}
                  onDecide={(i, d) => act(`idea-${i.id}`, () => call("decide_idea", { p_idea: i.id, p_status: d.status, p_note: d.note }), `Décision enregistrée : ${IDEA_STATUS_LABELS[d.status].toLowerCase()}.`)}
                />
              ) : (
                opening
              )}
            </Partie>
          )}

          {present("mur") && (
            <Partie {...part} id="mur">
              {data ? (
                <QgMur
                  data={data}
                  tools={kit}
                  busy={busy}
                  problemAt={problemAt}
                  onVisible={(on) => void act("me", () => call("set_member_visibility", { p_on: on }), on ? "Vous êtes montré aux autres membres." : "Vous n'êtes plus montré aux autres membres.", "tout")}
                  onGg={(member) => void act("gg", () => call("give_gg", { p_member: member.number, p_on: !member.given }), member.given ? `GG retiré à ${member.name}.` : `GG envoyé à ${member.name}.`, "outils")}
                  onMentor={(on) => void act("mentor", () => call("set_mentor", { p_on: on }), on ? "Vous êtes parrain." : "Vous n'êtes plus parrain.", "outils")}
                />
              ) : (
                opening
              )}
            </Partie>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Le QG des membres. Rien de ce qui s'affiche ici ne protège quoi que ce soit : le serveur ne donne le contenu qu'à un
 * compte validé, et revérifie chaque action.
 * `lastRunAt` : la dernière collecte publiée, lue au moment de la construction du site (voir qg.astro).
 * `logo` : le petit logo du menu des parties, dessiné au même moment.
 */
export default function QgApp({ lastRunAt = null, logo }: { lastRunAt?: string | null; logo?: LogoMatriceData }) {
  const { me, failed, refresh } = useMe();

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (failed) return <Problem message="Votre compte n'a pas pu être lu pour l'instant. Réessayez dans un moment." onRetry={() => void refresh()} />;
  if (!me.signed_in || me.status !== "validated") return <Door me={me} />;
  return <Inside me={me} rank={me.rank ?? 0} lastRunAt={lastRunAt} logo={logo} />;
}
