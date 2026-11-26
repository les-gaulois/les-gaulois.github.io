<!-- Partie de docs/DIRECTION.md : « Vérifier les membres : la limite à connaître ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## Vérifier les membres : la limite à connaître

La liste des membres est publique : **coller le lien du profil d'un membre ne prouve pas qu'on est ce membre**, puisque chacun peut le copier. Le site compare donc la demande à la liste, puis **un officier confirme**, en reconnaissant la personne sur Discord. Seul l'encadrement noté à l'avance par la direction s'en passe : son identifiant Discord ne s'imite pas.

La liste est relue une fois par jour par `scripts/relire-membres.ts`, lancé par la GitHub Action. Le `publicId` de chaque membre y est aussitôt remplacé par son empreinte : il n'entre jamais dans la base.

La preuve automatique existe : le jeton d'identité d'OpenFront (voir [API_AUDIT.md](../API_AUDIT.md), section 9). Elle n'est pas branchée : OpenFront doit d'abord ajouter le site à sa liste, et le message est prêt à la section 10 du même fichier. Une fois le site accepté, il restera à écrire une petite fonction serveur (Edge Function) qui valide le jeton.

