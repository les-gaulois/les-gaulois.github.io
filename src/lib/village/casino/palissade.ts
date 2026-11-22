/**
 * Les règles de la palissade, reprises au chiffre près de la maquette validée (`c2/jeux/palissade/regles.js`) : le statère
 * tombe de pieu en pieu sur huit rangées, une chance sur deux à chaque fois d'aller à gauche ou à droite, et finit dans une
 * des neuf coupes : 19, 4, 1,5, 0,5, 0,2, 0,5, 1,5, 4 et 19 fois la mise (mise comprise). Leurs chances sur 256 font rendre
 * en moyenne exactement la mise. Le serveur tire les huit choix (`jouer_palissade`).
 */
import { parDixiemes } from "./commun";

export const RANGEES = 8;
/** Les neuf coupes, de gauche à droite : ce qu'elles rendent, en dixièmes de la mise. */
export const DIXIEMES_DES_COUPES: readonly number[] = [190, 40, 15, 5, 2, 5, 15, 40, 190];
/** Les chances de chaque coupe sur 256 (huit choix à une chance sur deux). */
export const CHANCES_DES_COUPES: readonly number[] = [1, 8, 28, 56, 70, 56, 28, 8, 1];

/** La coupe d'arrivée d'un chemin (0 à gauche, 1 à droite) : le nombre de pas à droite. */
export const coupeDe = (chemin: readonly number[]): number => chemin.reduce((a, b) => a + b, 0);

/** Ce que rend la coupe `k` pour une mise multiple de 10, mise comprise : toujours un nombre entier. */
export const renduDeLaCoupe = (mise: number, k: number): number => parDixiemes(mise, DIXIEMES_DES_COUPES[k] ?? 0);
