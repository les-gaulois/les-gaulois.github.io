import type { ComponentChildren } from "preact";
import { basePath } from "../../lib/compte/api";
import type { QgTools } from "../../lib/compte/outils";
import { MOI_ONGLETS, etatDeMoi, lignesAttente, nomDuLien, resumeAttente, semaineDeMoi, type MoiAttente, type MoiChiffres, type MoiOnglet } from "../../lib/compte/qg-moi";
import { fmtDayAndTime, fmtInt, fmtPct, fmtRank } from "../../lib/format";
import { accountLabel } from "../../lib/niveau";
import type { StoredMember, StoredMembers } from "../../lib/schemas";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Loading } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

const victoires = (n: number) => (n > 1 ? "victoires" : "victoire");

/** Un pseudo de la liste publique : il mène à sa fiche, comme partout sur le site ; un anonyme garde ses mots. */
function Nom({ m, base }: { m: StoredMember; base: string }) {
  if (!m.username || !m.publicId) return <>{m.username ?? "un membre anonyme"}</>;
  return (
    <a class="pseudo pseudo-phrase" href={`${base}/membres/${encodeURIComponent(m.publicId)}`}>
      {m.username}
    </a>
  );
}

/** Un chiffre : son nom, sa valeur en grand, et ce qu'il compte en petit. */
function Chiffre({ nom, valeur, sous, testid }: { nom: string; valeur: string; sous?: string; testid?: string }) {
  return (
    <div class="qg-moi-chiffre" data-testid={testid}>
      <dt>{nom}</dt>
      <dd>
        <span class="qg-moi-valeur console-valeur tnum">{valeur}</span>
        {sous && <span class="qg-moi-sous tnum">{sous}</span>}
      </dd>
    </div>
  );
}

/** L'image attendue par le dernier `suivreVers` : un second clic remplace le premier, sans deux boucles à la fois. */
let suivi = 0;

/**
 * Un clic sur une ligne ouvre son onglet par l'adresse (`#decisions`, lu par `useTabs`). La ligne cliquée disparaît avec
 * l'onglet « Moi » : le clavier reprend sur la partie ouverte, au lieu de retomber en haut de la page. La partie paraît
 * au rendu suivant ; on l'attend 20 images au plus, puis on renonce. Si le clavier a été posé ailleurs entre-temps, il
 * n'est pas repris. Un clic droit, ou un clic avec une touche (nouvel onglet), garde le comportement du navigateur.
 */
function suivreVers(onglet: MoiOnglet, e: MouseEvent) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  cancelAnimationFrame(suivi);
  const lien = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
  let essais = 0;
  const poser = () => {
    const partie = document.getElementById(`qg-partie-${onglet}`);
    if (partie && !partie.hidden) {
      const ici = document.activeElement;
      if (ici === null || ici === document.body || ici === lien) partie.focus({ preventScroll: true });
    } else if (++essais < 20) suivi = requestAnimationFrame(poser);
  };
  suivi = requestAnimationFrame(poser);
}

/** Vers le membre de devant, vers le prochain palier, et qui suit : les mêmes chiffres publics que « Ma place » de l'accueil. */
function Suite({ c, base }: { c: MoiChiffres; base: string }) {
  const { place, tier } = c;
  return (
    <div class="qg-moi-jauges" data-testid="qg-moi-suite">
      <div>
        {place.next && place.missing !== null && c.nextShare !== null ? (
          <>
            <p>
              À dépasser : <Nom m={place.next} base={base} />
            </p>
            <p class="tnum text-sm text-muted">
              Encore {fmtInt(place.missing)} {victoires(place.missing)}
            </p>
            <div class="meter mt-2" aria-hidden="true">
              <i style={{ "--v": `${c.nextShare}%` }}></i>
            </div>
          </>
        ) : (
          <p>
            <Pastille ton="ok">En tête</Pastille> <span class="ml-1">Personne devant vous</span>
          </p>
        )}
        {place.behind && place.lead !== null && (
          <p class="tnum mt-2 text-sm text-muted">
            Derrière : <Nom m={place.behind} base={base} />, à {fmtInt(place.lead)} {victoires(place.lead)}
          </p>
        )}
      </div>
      {tier && (
        <div data-testid="qg-moi-palier">
          <p class="tnum">Palier de {fmtInt(tier.wins)} victoires</p>
          <p class="tnum text-sm text-muted">
            Encore {fmtInt(tier.missing)} {victoires(tier.missing)}
          </p>
          <div class="meter mt-2" aria-hidden="true">
            <i style={{ "--v": `${c.tierShare}%` }}></i>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * « Moi » : le tableau de bord du membre, ouvert à l'arrivée au QG. À gauche, ce qui l'attend au QG, une ligne par sujet,
 * avec sa couleur et un lien vers l'onglet (calculs dans `src/lib/compte/qg-moi.ts`). À droite, ses chiffres dans le clan :
 * le pseudo vient du serveur (`get_qg_tools`), les chiffres des données publiques du site, comme « Ma place dans le clan »
 * de l'accueil ; les GG viennent du serveur. `members` et `file` : `undefined` en lecture, `null` si illisibles.
 */
export default function QgMoi({
  me,
  members,
  file,
  attente,
  now,
}: {
  me: QgTools["me"];
  members: StoredMembers | null | undefined;
  file: ClanWeekFile | null | undefined;
  attente: MoiAttente;
  now: Date;
}) {
  const base = basePath();
  const lignes = lignesAttente(attente, now);
  const resume = resumeAttente(lignes);
  const etat = etatDeMoi(me.pseudo, members);
  const c = etat.etat === "pret" ? etat.chiffres : null;
  const member = c?.member ?? (etat.etat === "sans-partie" ? etat.member : null);
  const semaine = semaineDeMoi(member, file);

  // Ce qui remplace les chiffres du clan quand ils manquent : la raison, en une ligne.
  let manque: ComponentChildren = null;
  if (etat.etat === "absent") {
    manque = (
      <p class="qg-moi-manque" data-testid="qg-moi-absent">
        <Pastille ton="danger">Introuvable</Pastille>
        <span>
          Votre pseudo n'est pas dans la liste du clan. <a href={`${base}/compte`}>Mon compte</a>
        </span>
      </p>
    );
  } else if (etat.etat === "lecture") {
    manque = <Loading />;
  } else if (etat.etat === "illisible") {
    manque = (
      <p class="qg-moi-manque" data-testid="qg-moi-illisible">
        <Pastille ton="warn">Illisible</Pastille>
        <span>Les chiffres du clan n'ont pas pu être lus.</span>
      </p>
    );
  } else if (etat.etat === "inconnu") {
    manque = (
      <p class="qg-moi-manque" data-testid="qg-moi-inconnu">
        <Pastille ton="muted">Pas de données</Pastille>
        <span>{etat.pseudo} n'a pas de chiffres dans la liste publique du clan.</span>
      </p>
    );
  } else if (etat.etat === "sans-partie") {
    manque = (
      <p class="qg-moi-manque" data-testid="qg-moi-sans-partie">
        <Pastille ton="muted">Pas encore classé</Pastille>
        <span>Une victoire avec le tag GAL, et vous entrez dans le classement.</span>
      </p>
    );
  }

  return (
    <section class="qg-moi" aria-labelledby="moi-titre" data-testid="qg-moi">
      <PartieTete
        id="moi-titre"
        title="Mon tableau de bord"
        aside={
          <p class="qg-moi-resume">
            <Pastille ton={resume.ton} testid="qg-moi-resume">
              {resume.texte}
            </Pastille>
          </p>
        }
      />

      <div class="qg-moi-grille">
        <section aria-labelledby="moi-attente-titre">
          <h3 id="moi-attente-titre" class="qg-moi-titre">
            Ce qui m'attend
          </h3>
          <ul class="dir-liste qg-moi-attente" data-testid="qg-moi-attente">
            {/* Le nom du lien dit toute la ligne, dans l'ordre où elle se lit (`nomDuLien`) : « À voter : 1 sondage attend votre
                voix, Décisions ». La pastille, déjà dans ce nom, n'est pas lue une seconde fois. */}
            {lignes.map((ligne) => (
              <li key={ligne.onglet} class="dir-ligne qg-moi-ligne" data-dir-ton={ligne.ton} data-testid={`qg-moi-ligne-${ligne.onglet}`}>
                <span class="qg-moi-etat" aria-hidden="true">
                  <Pastille ton={ligne.ton}>{ligne.etat}</Pastille>
                </span>
                <a class="qg-moi-lien" href={`#${ligne.onglet}`} aria-label={nomDuLien(ligne)} onClick={(e) => suivreVers(ligne.onglet, e)}>
                  {/* L'espace entre les deux sépare « voix » de « Décisions » dans le texte du lien ; la mise en page ne le montre pas. */}
                  <span class="qg-moi-phrase tnum">{ligne.texte}</span>{" "}
                  <span class="qg-moi-vers">{MOI_ONGLETS[ligne.onglet]}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="moi-chiffres-titre">
          <h3 id="moi-chiffres-titre" class="qg-moi-titre">
            Mes chiffres dans le clan
          </h3>
          {/* Le membre reconnu, avec ou sans partie : il voit sur quel pseudo le site a lu ses chiffres. */}
          {member && (
            <p class="qg-moi-qui">
              {member.publicId ? (
                <a class="pseudo" href={`${base}/membres/${encodeURIComponent(member.publicId)}`} data-testid="qg-moi-fiche">
                  {member.username}
                </a>
              ) : (
                member.username
              )}
            </p>
          )}
          {manque}
          <dl class="qg-moi-chiffres" data-testid="qg-moi-chiffres">
            {c && (
              <>
                <Chiffre nom="Place" valeur={fmtRank(c.place.rank)} sous={`sur ${fmtInt(c.place.ranked)} membres`} testid="qg-moi-place" />
                <Chiffre nom="Victoires" valeur={fmtInt(c.place.wins)} />
                <Chiffre nom="Défaites" valeur={fmtInt(c.losses)} />
                <Chiffre nom="Réussite" valeur={fmtPct(c.rate)} />
              </>
            )}
            {semaine && <Chiffre nom="Cette semaine" valeur={fmtInt(semaine.wins)} sous={victoires(semaine.wins)} testid="qg-moi-semaine" />}
            <Chiffre nom="GG reçus" valeur={fmtInt(me.gg)} sous="cette semaine" testid="qg-moi-gg" />
          </dl>
          {c && <Suite c={c} base={base} />}
          {c?.account && (
            <p class="qg-moi-compte" data-testid="qg-moi-compte">
              Compte OpenFront, tout le jeu : {accountLabel(c.account)}
            </p>
          )}
          {c && (
            <p class="dir-note tnum text-sm" data-testid="qg-moi-date">
              Liste du clan du {fmtDayAndTime(c.fetchedAt)}
              {semaine && <>, semaine comptée depuis le {fmtDayAndTime(semaine.since)}</>}
            </p>
          )}
        </section>
      </div>

      <details class="fold qg-moi-aide" data-testid="qg-moi-aide">
        <summary>Comment lire ces chiffres</summary>
        <ul class="qg-moi-aide-liste">
          <li>Place, victoires, défaites et réussite : vos parties en équipe sous le tag GAL, d'après la liste publique du clan. Deux membres à égalité partagent la même place.</li>
          <li>Réussite : la part de vos parties gagnées, le taux de victoire de votre fiche.</li>
          <li>Cette semaine : vos victoires sous le tag entre le relevé du lundi et la dernière liste lue.</li>
          <li>GG : les mercis que les membres vous ont donnés cette semaine, sur le mur.</li>
          <li>Les paliers sont des seuils choisis par le site, pas par le jeu.</li>
          <li>Le niveau et le prestige sont ceux du compte OpenFront, tout le jeu confondu, pas seulement les parties sous le tag.</li>
        </ul>
      </details>
    </section>
  );
}
