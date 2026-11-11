import { Fragment, type ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { slideFrom, tabKeyTarget, tabOfHash, type Slide } from "../../lib/onglets";

export interface TabItem {
  id: string;
  label: string;
  /** Ce qui attend sur cet onglet : un nombre, et ce qu'il compte pour un lecteur d'écran (« 2 demandes à traiter »). Rien à zéro. */
  count?: { value: number; words: string; tone?: "alerte" | "vif" } | null;
  /** Un onglet de l'encadrement, au QG : rangé après les autres, marqué de rouge. */
  staff?: boolean;
}

const reducedMotion = () => document.documentElement.classList.contains("fx-off") || matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * L'onglet ouvert, tenu dans l'adresse (`#demandes`) sans ajouter de page à l'historique : un lien peut ouvrir un
 * onglet, et la page rechargée le garde. Une adresse qui ne nomme pas d'onglet (le lien « Aller au contenu ») ne change rien.
 * `shown` : les onglets déjà ouverts une fois, pour ne lire le serveur qu'au premier passage.
 * Tant que personne n'a choisi d'onglet, ni par un clic ni par l'adresse, c'est le premier qui est ouvert, même s'il ne
 * paraît qu'après une lecture du serveur (« Moi », au QG).
 */
export function useTabs(ids: readonly string[]) {
  const key = ids.join(" ");
  const [state, setState] = useState(() => {
    const named = tabOfHash(location.hash, ids);
    const first = named ?? ids[0] ?? "";
    return { active: first, slide: null as Slide | null, shown: new Set([first]), call: 0, chosen: named !== null };
  });

  const select = useCallback(
    (id: string, bringIntoView = false) => {
      setState((s) => {
        const list = key.split(" ");
        if (!list.includes(id)) return s;
        const shown = s.shown.has(id) ? s.shown : new Set([...s.shown, id]);
        // Sans choix, l'onglet affiché est le premier : le glissement part de lui.
        const previous = s.chosen && list.includes(s.active) ? s.active : (list[0] ?? s.active);
        return { active: id, slide: slideFrom(list.indexOf(previous), list.indexOf(id)), shown, call: bringIntoView ? s.call + 1 : s.call, chosen: true };
      });
      if (location.hash !== `#${id}`) history.replaceState(history.state, "", `#${id}`);
    },
    [key],
  );

  useEffect(() => {
    const onHash = () => {
      const id = tabOfHash(location.hash, key.split(" "));
      if (id) select(id, true);
    };
    // Un onglet nommé par l'adresse peut n'apparaître qu'une fois le compte lu (celui du fondateur, par exemple).
    const named = tabOfHash(location.hash, key.split(" "));
    if (named) setState((s) => (s.active === named ? s : { ...s, active: named, shown: new Set([...s.shown, named]), chosen: true }));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [key, select]);

  /**
   * Garde l'onglet affiché, comme si on l'avait choisi : un onglet qui paraît ensuite en tête ne prend pas sa place sous les
   * yeux du membre (au QG, quand les outils répondent après l'ouverture).
   */
  const hold = useCallback(() => {
    setState((s) => {
      if (s.chosen) return s;
      const first = key.split(" ")[0] ?? "";
      return { ...s, active: first, shown: new Set([...s.shown, first]), chosen: true };
    });
  }, [key]);

  // Un onglet qui n'existe plus pour ce compte (vue joueur) : on revient au premier. Sans choix, le premier, toujours.
  const first = ids[0] ?? "";
  const active = state.chosen && ids.includes(state.active) ? state.active : first;
  const shown = state.shown.has(active) ? state.shown : new Set([...state.shown, active]);
  return { active, slide: state.chosen ? state.slide : null, shown, select, call: state.call, hold };
}

/**
 * La barre d'onglets : une seule ligne, qui défile de côté dans son cadre quand la place manque, sans élargir la page.
 * Au clavier : flèches, Début et Fin, comme dans tout groupe d'onglets. Un nombre dit ce qui attend derrière un onglet.
 * `call` : augmenté quand un lien a demandé un onglet, la barre revient alors à l'écran.
 * `menu` : la barre est remplacée par un menu déroulant, sur toutes les largeurs. Son bouton dit la partie ouverte, et
 * sa liste donne toutes les parties d'un coup (la Direction : le pilote ne voyait pas la fin de la barre). Les onglets
 * restent dans la page, masqués : chaque partie garde le nom de son onglet.
 */
export function Onglets({
  label,
  prefix,
  tabs,
  active,
  onSelect,
  call = 0,
  menu = false,
  debut,
}: {
  label: string;
  prefix: string;
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  call?: number;
  menu?: boolean;
  /** Ce qui se place en tête de la barre, avant les onglets ou le menu : à la Direction, le petit logo. */
  debut?: ComponentChildren;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [open, setOpen] = useState(false);

  // Le menu se ferme d'un clic ou d'un toucher ailleurs. À son ouverture, le focus va sur la partie ouverte, et si la liste
  // sort de l'écran (sur téléphone, la barre est souvent en bas), la barre remonte sous l'en-tête pour la montrer entière.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true });
    if ((list.current?.getBoundingClientRect().bottom ?? 0) > window.innerHeight) {
      bar.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Les bords qui cachent encore des onglets s'estompent : on voit qu'il y en a d'autres à faire défiler.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [tabs.length]);

  // L'onglet ouvert reste visible dans la barre, centré si elle défile. La page, elle, ne bouge pas.
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2), behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active]);

  useEffect(() => {
    if (call > 0) strip.current?.parentElement?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [call]);

  // Au doigt ou à la souris : si la partie choisie s'ouvre presque hors de l'écran (sur téléphone, la barre est souvent en bas
  // du premier écran), la barre remonte en haut, sous l'en-tête, et la partie se lit dessous. Sinon, la page ne bouge pas.
  const choose = (id: string) => {
    onSelect(id);
    requestAnimationFrame(() => {
      const part = document.getElementById(`${prefix}-partie-${id}`);
      if (part && part.getBoundingClientRect().top > window.innerHeight - 160) {
        strip.current?.parentElement?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      }
    });
  };

  const onKey = (e: KeyboardEvent, index: number) => {
    const next = tabKeyTarget(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onSelect(tab.id);
    document.getElementById(`${prefix}-onglet-${tab.id}`)?.focus();
  };

  // Une partie choisie dans le menu : le focus va sur son onglet, ou revient au bouton du menu quand la barre est cachée.
  const fromMenu = (id: string) => {
    setOpen(false);
    choose(id);
    requestAnimationFrame(() => {
      const tab = document.getElementById(`${prefix}-onglet-${id}`);
      (tab && tab.offsetParent !== null ? tab : toggle.current)?.focus();
    });
  };

  // Échap : le menu se ferme et le focus revient au bouton, une fois la liste masquée (elle a pu le prendre entre-temps).
  const closeMenu = () => {
    setOpen(false);
    requestAnimationFrame(() => toggle.current?.focus());
  };

  // Dans le menu : flèches haut et bas, en boucle, Début et Fin ; Échap le ferme et rend le focus au bouton.
  const onMenuKey = (e: KeyboardEvent, index: number) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
    const next = tabKeyTarget(e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    list.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  const opened = tabs.find((tab) => tab.id === active);

  return (
    <div
      ref={bar}
      class={`onglets ${edges.start ? "onglets-avant" : ""} ${edges.end ? "onglets-apres" : ""} ${menu ? "onglets-avec-menu" : ""}`}
      onFocusOut={(e) => {
        // Le focus part vers un élément hors de la barre (touche Tab) : le menu se ferme. Sans destination, rien : Safari
        // et Firefox sur Mac ne donnent pas le focus au bouton cliqué, et fermer ici masquerait la liste avant le clic.
        // Un clic hors de la barre ferme déjà le menu (pointerdown, plus haut).
        if (open && e.relatedTarget && !bar.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {debut}
      <div ref={strip} class="onglets-defile" role="tablist" aria-label={label} data-testid={`${prefix}-onglets`}>
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          const count = tab.count && tab.count.value > 0 ? tab.count : null;
          return (
            <Fragment key={tab.id}>
              {tab.staff && !tabs[i - 1]?.staff && <span class="onglets-separation" aria-hidden="true" />}
              <button
                type="button"
                role="tab"
                id={`${prefix}-onglet-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${prefix}-partie-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                class={`onglet ${tab.staff ? "onglet-encadrement" : ""}`}
                // Un onglet de l'encadrement prend les jetons du thème rouge, comme sa partie.
                data-theme={tab.staff ? "rouge" : undefined}
                data-testid={`onglet-${tab.id}`}
                onClick={() => choose(tab.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {tab.label}
                {count && (
                  <>
                    <span class={`onglet-nombre tnum ${count.tone ? `onglet-nombre-${count.tone}` : ""}`} aria-hidden="true">
                      {fmtInt(count.value)}
                    </span>
                    <span class="sr-only">, {count.words}</span>
                  </>
                )}
              </button>
            </Fragment>
          );
        })}
      </div>
      {menu && (
        <div class="onglets-menu">
          <button
            ref={toggle}
            type="button"
            class="onglets-menu-bouton"
            aria-expanded={open}
            aria-controls={`${prefix}-menu`}
            data-testid={`${prefix}-menu-bouton`}
            onClick={() => setOpen(!open)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && !open) {
                e.preventDefault();
                setOpen(true);
              } else if (e.key === "Escape" && open) {
                e.preventDefault();
                closeMenu();
              }
            }}
          >
            <span class="onglets-menu-ouverte">
              <span class="sr-only">Partie ouverte : </span>
              <span class="onglets-menu-nom">{opened?.label}</span>
              <Nombre count={opened?.count} />
            </span>
            <svg class="onglets-menu-fleche" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <ul ref={list} id={`${prefix}-menu`} class="onglets-liste" hidden={!open} data-testid={`${prefix}-menu`}>
            {tabs.map((tab, i) => (
              <li key={tab.id}>
                <button type="button" class="onglets-choix" aria-current={tab.id === active ? "true" : undefined} onClick={() => fromMenu(tab.id)} onKeyDown={(e) => onMenuKey(e, i)}>
                  <span class="min-w-0">{tab.label}</span>
                  <Nombre count={tab.count} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ce qui attend derrière une partie, dans le menu : le nombre, et ce qu'il compte pour les lecteurs d'écran. Rien à zéro. */
function Nombre({ count }: { count: TabItem["count"] | undefined }) {
  if (!count || count.value <= 0) return null;
  return (
    <>
      <span class={`onglet-nombre tnum ${count.tone ? `onglet-nombre-${count.tone}` : ""}`} aria-hidden="true">
        {fmtInt(count.value)}
      </span>
      <span class="sr-only">, {count.words}</span>
    </>
  );
}

/**
 * Une partie de l'espace, sous son onglet. Masquée, elle reste dans la page : un brouillon ou un appel en cours ne se
 * perd pas d'un onglet à l'autre. Elle glisse doucement du côté de son onglet ; le bouton pause et le réglage
 * « réduire les animations » coupent ce mouvement. `staff` : une partie de l'encadrement, aux couleurs du thème rouge.
 */
export function Partie({ prefix, id, active, slide, staff = false, children }: { prefix: string; id: string; active: string; slide: Slide | null; staff?: boolean; children: ComponentChildren }) {
  const shown = id === active;
  return (
    <div
      role="tabpanel"
      id={`${prefix}-partie-${id}`}
      aria-labelledby={`${prefix}-onglet-${id}`}
      tabIndex={0}
      hidden={!shown}
      class={`partie ${shown && slide ? `partie-${slide}` : ""} ${staff ? "zone-encadrement" : ""}`}
      data-theme={staff ? "rouge" : undefined}
      // Le nom court de la partie, que l'ambiance console de la Direction écrit en commande au-dessus d'elle.
      data-partie={id}
      data-testid={`partie-${id}`}
    >
      {children}
    </div>
  );
}

/** Le haut d'une partie : son titre, une phrase pour dire à quoi elle sert, et une commande à droite si besoin. */
export function PartieTete({ id, title, eyebrow, children, aside }: { id: string; title: string; eyebrow?: string; children?: ComponentChildren; aside?: ComponentChildren }) {
  return (
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="min-w-0 max-w-3xl">
        {eyebrow && <p class="partie-surtitre">{eyebrow}</p>}
        <h2 id={id} class="text-2xl">
          {title}
        </h2>
        {children && <div class="mt-2 text-muted">{children}</div>}
      </div>
      {aside}
    </div>
  );
}
