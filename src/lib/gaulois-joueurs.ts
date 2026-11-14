/**
 * Les Gaulois du village sur les images du robot (demande du pilote, 14 novembre 2026) : un petit Gaulois au-dessus du nom
 * de chaque membre qui a créé le sien, sur les images que le robot poste sur Discord et sur les fiches.
 *
 * Contrat commun entre le dessin (les fichiers `src/lib/*-image.ts`) et la lecture au serveur (ce fichier) :
 * - une image reçoit un `GauloisParJoueur`, rangé par identifiant public (`publicID`) ; le dessin ne lit jamais le serveur ;
 * - n'y figurent que les membres au pseudo public de la liste du clan, validés, qui ont enregistré leur Gaulois : c'est le
 *   serveur qui en décide (migration `20261114000400_gaulois_sur_les_images.sql`), jamais le dessin ;
 * - la carte n'est gardée qu'en mémoire, le temps d'un envoi ou d'une construction : jamais écrite dans `data/`, `dist/`
 *   ni dans le dépôt ;
 * - sans réglage, sans réponse du serveur ou sans la migration, la carte est vide et les images se dessinent comme avant.
 */
import type { Tenue } from "./gaulois";

/** Les tenues à dessiner, par identifiant public d'un membre au pseudo public. */
export type GauloisParJoueur = ReadonlyMap<string, Tenue>;

/** Aucun Gaulois : l'image se dessine comme avant. */
export const AUCUN_GAULOIS: GauloisParJoueur = new Map();
