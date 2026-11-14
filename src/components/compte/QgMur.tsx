import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { basePath } from "../../lib/compte/api";
import { ggPodium, type Mentor, type QgTools, type WallMember } from "../../lib/compte/outils";
import type { Face, QgData } from "../../lib/compte/qg";
import { MUR_FILTRES, MUR_LONG, MUR_MAX, PARRAINS_MAX, PARRAINS_MONTRES, auMoins, murAnnonce, murFiltres, murFocusApres, murLignes, murNombres, murTrouve, murVisible, type MurFiltre, type MurLigne } from "../../lib/compte/qg-mur";
import { ROLE_LABELS } from "../../lib/compte/types";
import { fmtCount, fmtInt } from "../../lib/format";
import { Avatar, Problem } from "./common";
import { Pastille, useBarreCollante, type DirTon } from "./direction-kit";
import { PartieTete } from "./Onglets";

/** La couleur de chaque filtre de la barre : vert pour les GG, comme le bouton GG envoyé. */
const TONS: Partial<Record<MurFiltre, DirTon>> = { gg: "ok" };

/** Les boutons GG du mur, dans l'ordre de la grille. */
const GG_BOUTONS = '[data-testid="qg-gg"]';

/** Le rôle, en un mot dans un cadre discret : jamais en rouge, qui dit « encadrement » ailleurs sur le site. Un membre n'en porte pas. */
function Role({ face }: { face: Face }) {
  if (face.role === "member") return null;
  return (
    <span class="qg-mur-role" data-role={face.role}>
      {ROLE_LABELS[face.role]}
    </span>
  );
}

/** Les GG reçus cette semaine : rien à zéro, ni sans les outils. */
function Gg({ gg }: { gg: number | null }) {
  if (gg === null || gg === 0) return null;
  return (
    <span class="qg-mur-gg-nombre tnum">
      <b>{fmtInt(gg)}</b> GG
    </span>
  );
}

/** Un parrain : son nom, son rôle et son pseudo Discord, pour lui écrire. */
function Parrain({ mentor }: { mentor: Mentor }) {
  return (
    <li class="dir-ligne qg-mur-ligne" data-dir-ton={mentor.mine ? "ally" : undefined}>
      <Avatar name={mentor.name} avatar={mentor.avatar} />
      <div class="qg-mur-qui">
        <p class="qg-mur-nom">{mentor.name}</p>
        <p class="qg-mur-suite">
          <Role face={mentor} />
          {mentor.mine && (
            <Pastille ton="ally" plain>
              Vous
            </Pastille>
          )}
          {mentor.discord && (
            <span>
              Discord : <span class="qg-mur-discord">{mentor.discord}</span>
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * Le mur des membres : ceux qui choisissent de se montrer, les plus remerciés de la semaine (GG), et les parrains. Un GG
 * remercie un membre du mur pour la semaine, un seul par membre remercié ; le site n'en montre que le nombre, jamais qui
 * remercie qui. Être parrain montre son pseudo Discord aux membres validés, pour qu'un nouveau puisse écrire : la ligne
 * du réglage le dit avant le choix, et le bouton la lit (`aria-describedby`). La photo d'un parrain, dont l'adresse contient
 * son identifiant Discord, ne vient que s'il se montre. Sans les outils (`tools` à `null`, serveur d'avant la migration), le
 * mur reste celui de `get_qg`.
 *
 * Le dessin (14 novembre 2026) suit l'onglet Comptes de la Direction : mes deux réglages en tête avec leur état en
 * pastille, le podium et les parrains en lignes courtes à côté, puis le mur en grille serrée. Quand le mur dépasse
 * `MUR_LONG` membres, une barre de recherche et de filtres chiffrés reste sous l'en-tête du site. Aucun membre du mur
 * n'est marqué parrain : le serveur ne dit pas lequel l'est (voir `qg-mur.ts`).
 */
export default function QgMur({
  data,
  tools,
  busy,
  problemAt,
  onVisible,
  onGg,
  onMentor,
}: {
  data: QgData;
  tools: QgTools | null;
  busy: boolean;
  problemAt: (at: string) => string | null;
  onVisible: (on: boolean) => void;
  onGg: (member: WallMember) => void;
  onMentor: (on: boolean) => void;
}) {
  const base = basePath();
  const podium = tools ? ggPodium(tools.wall) : [];
  const mentors = tools?.mentors ?? [];

  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<MurFiltre>("tous");
  const lignes = murLignes(data.wall, tools);
  const long = lignes.length > MUR_LONG;
  // Un mur redevenu court n'a plus de barre : la recherche et le filtre ne s'appliquent plus, et sont oubliés.
  const typed = long ? search : "";
  const choix: MurFiltre = long ? filtre : "tous";
  useEffect(() => {
    if (long) return;
    setSearch("");
    setFiltre("tous");
  }, [long]);
  const totaux = murNombres(lignes);
  const nombres = murNombres(lignes.filter((ligne) => murTrouve(ligne, typed)));
  const visibles = murVisible(lignes, typed, choix);
  const filtres = murFiltres(totaux, choix, tools !== null);

  const section = useRef<HTMLElement>(null);
  const grille = useRef<HTMLUListElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const toutMontrer = useRef<HTMLButtonElement>(null);
  const tous = useRef<HTMLButtonElement>(null);

  // Un filtre choisi plus bas dans la page raccourcit le mur : la page revient à son début, sans mouvement. Pas au montage :
  // le mur se monte caché pendant qu'on lit un autre onglet, et la page ne doit pas bouger sous les yeux.
  const top = useRef<HTMLDivElement>(null);
  const monte = useRef(false);
  useEffect(() => {
    if (!monte.current) {
      monte.current = true;
      return;
    }
    const mark = top.current;
    if (!mark || mark.getClientRects().length === 0) return;
    const header = document.querySelector<HTMLElement>("header.barre");
    const gap = mark.getBoundingClientRect().top - (header?.offsetHeight ?? 0);
    // « instant » : sinon, le `scroll-behavior: smooth` de la page ferait glisser le mur à chaque lettre tapée.
    if (gap < 0) window.scrollBy({ top: gap, behavior: "instant" });
  }, [choix, typed]);

  // Le focus ne se perd jamais. Un GG retiré sous « GG cette semaine » ôte sa case du mur, et son bouton avec : le focus va au
  // bouton qui prend sa place, sinon à « Tout montrer » ou au titre du mur. « Tout montrer » s'efface lui-même : le focus va
  // au filtre « Tous ».
  const dernier = useRef<{ key: string; index: number } | null>(null);
  const versTous = useRef(false);
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    const key = target.closest<HTMLElement>("[data-key]")?.dataset["key"];
    const boutons = [...(grille.current?.querySelectorAll<HTMLElement>(GG_BOUTONS) ?? [])];
    dernier.current = key ? { key, index: boutons.indexOf(target) } : null;
  };
  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget;
    if (next instanceof Node && !grille.current?.contains(next)) dernier.current = null;
  };
  useLayoutEffect(() => {
    if (versTous.current) {
      versTous.current = false;
      tous.current?.focus();
      return;
    }
    const last = dernier.current;
    if (!last || visibles.some((ligne) => ligne.key === last.key)) return;
    dernier.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const boutons = grille.current?.querySelectorAll<HTMLElement>(GG_BOUTONS);
    const i = murFocusApres(last.index, boutons?.length ?? 0);
    (boutons && i >= 0 ? boutons[i] : (toutMontrer.current ?? titre.current))?.focus();
  });
  const showAll = () => {
    versTous.current = true;
    setFiltre("tous");
    setSearch("");
  };

  return (
    <section class="qg-mur" aria-labelledby="mur-titre" data-testid="qg-wall">
      <PartieTete id="mur-titre" title="Le mur des membres">
        {data.wall.length > 0 && (
          <p class="tnum" data-testid="qg-wall-count">
            {auMoins(data.wall.length, MUR_MAX)} sur {fmtInt(data.members)} membres reconnus {data.wall.length > 1 ? "se montrent" : "se montre"}.
          </p>
        )}
      </PartieTete>

      <div class="qg-mur-haut">
        <section aria-labelledby="mur-reglages-titre" data-testid="qg-mur-reglages">
          <h3 id="mur-reglages-titre" class="qg-mur-titre">
            Mes réglages
          </h3>
          <div class="dir-liste">
            <div class="dir-ligne qg-mur-reglage" data-dir-ton={data.me.visible ? "ok" : "muted"} data-testid="qg-visibility">
              <button type="button" class="chip" aria-pressed={data.me.visible} aria-disabled={busy || undefined} aria-describedby="mur-note-visible" data-testid="qg-visible" onClick={() => !busy && onVisible(!data.me.visible)}>
                Me montrer
              </button>
              <Pastille ton={data.me.visible ? "ok" : "muted"} testid="qg-visible-etat">
                {data.me.visible ? "Montré" : "Caché"}
              </Pastille>
              {/* Le détail, dont l'identifiant Discord que contient l'adresse de la photo, est sur la page de confidentialité. */}
              <p id="mur-note-visible" class="qg-mur-note">
                Vu des membres validés : nom, rôle et photo Discord, dont l'adresse contient votre identifiant Discord. <a href={`${base}/confidentialite#avec-un-compte`}>Détails</a>
              </p>
              <Problem message={problemAt("me")} />
            </div>
            {tools && (
              <div class="dir-ligne qg-mur-reglage" data-dir-ton={tools.me.mentor ? "ally" : "muted"} data-testid="qg-parrainage">
                <button type="button" class="chip" aria-pressed={tools.me.mentor} aria-disabled={busy || undefined} aria-describedby="mur-note-parrain" data-testid="qg-parrain" onClick={() => !busy && onMentor(!tools.me.mentor)}>
                  Être parrain
                </button>
                <Pastille ton={tools.me.mentor ? "ally" : "muted"} testid="qg-parrain-etat">
                  {tools.me.mentor ? "Parrain" : "Pas parrain"}
                </Pastille>
                <p id="mur-note-parrain" class="qg-mur-note">Vu des membres validés, pour qu'un nouveau vous écrive : nom, rôle et pseudo Discord.</p>
                <Problem message={problemAt("mentor")} />
              </div>
            )}
          </div>
        </section>

        {podium.length > 0 && (
          <section aria-labelledby="mur-podium-titre" data-testid="qg-gg-podium">
            <h3 id="mur-podium-titre" class="qg-mur-titre">
              Les plus remerciés de la semaine
            </h3>
            <ol class="dir-liste">
              {podium.map((member) => (
                <li key={member.number} class="dir-ligne qg-mur-ligne" data-dir-ton="ok">
                  <Avatar name={member.name} avatar={member.avatar} />
                  <div class="qg-mur-qui">
                    <p class="qg-mur-nom">{member.name}</p>
                    {member.role !== "member" && (
                      <p class="qg-mur-suite">
                        <Role face={member} />
                      </p>
                    )}
                  </div>
                  <Gg gg={member.gg} />
                </li>
              ))}
            </ol>
          </section>
        )}

        {mentors.length > 0 && (
          <section aria-labelledby="parrains-titre" data-testid="qg-parrains">
            <h3 id="parrains-titre" class="qg-mur-titre">
              Les parrains <span class="tnum">{auMoins(mentors.length, PARRAINS_MAX)}</span>
            </h3>
            <ul class="dir-liste" data-testid="qg-parrains-liste">
              {mentors.slice(0, PARRAINS_MONTRES).map((mentor, i) => (
                <Parrain key={i} mentor={mentor} />
              ))}
            </ul>
            {mentors.length > PARRAINS_MONTRES && (
              <details class="fold qg-mur-suite-parrains" data-testid="qg-parrains-suite">
                <summary>{fmtCount(mentors.length - PARRAINS_MONTRES, "autre")} {mentors.length - PARRAINS_MONTRES > 1 ? "parrains" : "parrain"}</summary>
                <ul class="dir-liste">
                  {mentors.slice(PARRAINS_MONTRES).map((mentor, i) => (
                    <Parrain key={i} mentor={mentor} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
      </div>

      {lignes.length > 0 && (
        <section ref={section} class="qg-mur-membres" aria-labelledby="mur-membres-titre">
          <h3 ref={titre} id="mur-membres-titre" class="qg-mur-titre" tabIndex={-1}>
            Sur le mur <span class="tnum">{auMoins(lignes.length, MUR_MAX)}</span>
          </h3>
          {/* Toujours présente : un lecteur d'écran annonce combien de membres restent après une lettre tapée ou un filtre choisi. */}
          <p class="sr-only" role="status">
            {murAnnonce(visibles.length, typed, choix)}
          </p>
          <div ref={top} />
          {long && <BarreMur section={section} tous={tous} search={search} onSearch={setSearch} filtres={filtres} choix={choix} nombres={nombres} onFiltre={setFiltre} />}
          <Problem message={problemAt("gg")} />
          {visibles.length === 0 ? (
            <div class="qg-mur-vide" data-testid="qg-mur-vide">
              <p>Aucun membre pour ce choix.</p>
              <button ref={toutMontrer} type="button" class="dir-bouton" onClick={showAll}>
                Tout montrer
              </button>
            </div>
          ) : (
            <ul ref={grille} class="qg-mur-grille" data-testid="qg-wall-list" onFocusIn={onFocusIn} onFocusOut={onFocusOut}>
              {visibles.map((ligne) => (
                <Carte key={ligne.key} ligne={ligne} busy={busy} onGg={onGg} />
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

/**
 * La barre de recherche et de filtres d'un long mur. Elle ne se monte qu'avec la barre : `useBarreCollante` mesure au
 * montage, et un mur peut passer la borne pendant la visite (un 13e membre se montre). Les hauteurs se posent sur la partie
 * « Sur le mur » (`section`), qui contient la barre et la grille : les boutons GG en tirent leur marge sous la barre. Une
 * fois la barre partie, elles s'effacent.
 */
function BarreMur({
  section,
  tous,
  search,
  onSearch,
  filtres,
  choix,
  nombres,
  onFiltre,
}: {
  section: RefObject<HTMLElement>;
  tous: RefObject<HTMLButtonElement>;
  search: string;
  onSearch: (text: string) => void;
  filtres: MurFiltre[];
  choix: MurFiltre;
  nombres: Record<MurFiltre, number>;
  onFiltre: (filtre: MurFiltre) => void;
}) {
  const { root, bar } = useBarreCollante<HTMLElement, HTMLDivElement>();
  // Avant la mesure du crochet (`useEffect`) : un effet de mise en page passe d'abord.
  useLayoutEffect(() => {
    const el = section.current;
    root.current = el;
    return () => {
      el?.style.removeProperty("--dir-outils");
      el?.style.removeProperty("--dir-haut");
    };
  }, [root, section]);
  return (
    <div ref={bar} class="dir-outils" data-testid="qg-mur-outils">
      <div class="dir-recherche" role="search">
        <label class="sr-only" for="mur-recherche">
          Rechercher un membre
        </label>
        <input id="mur-recherche" class="field dir-champ" type="search" placeholder="Rechercher un membre" autocomplete="off" data-testid="qg-mur-recherche" value={search} onInput={(e) => onSearch(e.currentTarget.value)} />
      </div>
      <div class="dir-filtres" role="group" aria-label="Filtrer le mur">
        {MUR_FILTRES.filter((f) => filtres.includes(f.id)).map((f) => (
          <button key={f.id} ref={f.id === "tous" ? tous : undefined} type="button" class="dir-filtre" data-dir-ton={TONS[f.id]} data-testid="qg-mur-filtre" data-filtre={f.id} aria-pressed={choix === f.id} onClick={() => onFiltre(f.id)}>
            {f.label} <span class="dir-nombre tnum">{fmtInt(nombres[f.id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Un membre du mur : sa photo ou son initiale, son nom, son rôle, ses GG de la semaine, et le bouton GG avec son état. Le
 * bouton est une bascule (`aria-pressed`, un second appui retire le GG) : son nom ne change pas, « GG à Épona », et
 * « envoyé » ne s'écrit que pour les yeux, pour ne pas dire l'état deux fois.
 */
function Carte({ ligne, busy, onGg }: { ligne: MurLigne; busy: boolean; onGg: (member: WallMember) => void }) {
  const { face, member } = ligne;
  const given = member?.given === true;
  const suite = ligne.staff || (ligne.gg !== null && ligne.gg > 0);
  return (
    <li class="qg-mur-carte" data-key={ligne.key} data-dir-ton={given ? "ok" : ligne.mine ? "ally" : undefined} data-testid="qg-wall-member">
      <Avatar name={face.name} avatar={face.avatar} />
      <div class="qg-mur-qui">
        <p class="qg-mur-nom">{face.name}</p>
        {suite && (
          <p class="qg-mur-suite">
            <Role face={face} />
            <Gg gg={ligne.gg} />
          </p>
        )}
      </div>
      {ligne.mine ? (
        <Pastille ton="ally" plain>
          Vous
        </Pastille>
      ) : (
        member && (
          <button type="button" class="dir-bouton qg-mur-gg" data-dir-ton="ok" aria-pressed={given} aria-disabled={busy || undefined} data-testid="qg-gg" onClick={() => !busy && onGg(member)}>
            GG{given && <span aria-hidden="true"> envoyé</span>}
            <span class="sr-only"> à {face.name}</span>
          </button>
        )
      )}
    </li>
  );
}
