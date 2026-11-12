import { getCollection } from "astro:content";
import type { GuideChapter } from "./commandes-image";

/** Les chapitres du guide du clan, dans l'ordre de la page /debuter, pour les images de la commande /guide. */
export async function guideChapters(): Promise<GuideChapter[]> {
  return (await getCollection("guideClan"))
    .sort((a, b) => a.data.order - b.data.order)
    .map((entry) => ({
      id: entry.id,
      order: entry.data.order,
      title: entry.data.title,
      court: entry.data.court,
      chapeau: entry.data.chapeau,
      essentiel: entry.data.essentiel,
      bloc: entry.data.bloc,
      blocTitre: entry.data.blocTitre,
      blocTexte: entry.data.blocTexte,
      points: entry.data.points.map((p) => ({ titre: p.titre, texte: p.texte, marque: p.marque })),
      retenir: entry.data.retenir,
      ouvert: entry.data.ouvert,
    }));
}
