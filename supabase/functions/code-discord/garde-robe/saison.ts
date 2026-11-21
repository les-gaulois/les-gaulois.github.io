/**
 * La garde-robe du village, lot « saison » : l'objet légendaire dessiné pour une saison du pass, donné à son 30e palier et
 * nulle part ailleurs (décision du pilote, 21 novembre 2026). Sa rareté est « saison » (« Légendaire de saison ») : il ne
 * s'achète pas, ne se vend pas, ne sort d'aucune pochette et la forge n'en fabrique pas.
 *
 * Saison 1, du mardi 17 novembre au lundi 28 décembre 2026, l'entrée dans l'hiver : la « Couronne du solstice ». Cinq
 * cristaux de glace dressés sur un bandeau d'argent givré aux filets d'or, serti de saphirs, et au milieu le soleil du
 * solstice en médaillon d'or, au pied du plus grand cristal ; deux éclats de givre s'en détachent. Elle se pose sur la
 * tête comme les autres couronnes, sans cornes ni ailes.
 *
 * Dessin original de Claude Fable 5.2, fait pour le clan [GAL] ; il n'emprunte rien à une œuvre existante. La grille a été
 * tracée par programme (formes, puis contours), puis écrite ici en clair : ce fichier fait foi.
 */
import type { ObjetDuLot } from "../gaulois.ts";

/** La glace (q sa lumière, i sa face claire, p son bleu, P son ombre, I le pied pris dans le métal) et le cœur du soleil (E). */
const GLACE_DU_SOLSTICE = { q: "#f1fbff", i: "#bfeaff", p: "#7cc8f5", P: "#3f86d6", I: "#2a57a8", E: "#fff7cf" };

export const LOT_SAISON_1: readonly ObjetDuLot[] = [
  {
    emplacement: "tete",
    id: "couronne-solstice",
    nom: "Couronne du solstice",
    rarete: "saison",
    gratuit: false,
    couvre: true,
    couleurs: GLACE_DU_SOLSTICE,
    dessin: {
      y: 0,
      lignes: [
        ".......................kk....k..................",
        "......................kqpk..kqk.................",
        "............k...k....kqipPk..k.k................",
        "...........kqk.kqk...kqiipPk..kqk...............",
        "............k.kqiPk.kqiqppPk.kqiPk..............",
        "..........k...kqipPkkqiippPkkqipPk...k..........",
        ".........kqk..kqiipPkqiqppPkqiipPk..kqk.........",
        "........kqiPk.kqiipPkqkkkkPkqiipPk.kqiPk........",
        ".........kqiPkkqiipPkkyyygkkqiipPkkqiPk.........",
        ".........kqiPIkqiiPIkyEgggGkqiiPIkqiPIk.........",
        ".........kkkkkkkkkkkkygEEgGkkkkkkkkkkkk.........",
        "........kyyyyyyyyyyykygEygGkyygggggggggk........",
        "........knnnbBnnbBnnkGGGGGGknnbBnnbBMMMk........",
        "........knmmBBMmBBmMmkGGGGkmMmBBMmBBMMMk........",
        "........kGGGGGGGGGGGGGkkkkGGGGGGGGGGGGGk........",
        "........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk........",
        "........kqiPk......................kqiPk........",
        "........kqiPk......................kqiPk........",
        "........kqpk........................kqpk........",
        "........kqpk........................kqpk........",
        ".........kqk........................kqk.........",
        ".........kqk........................kqk.........",
        "..........k..........................k..........",
      ],
    },
  },
];
