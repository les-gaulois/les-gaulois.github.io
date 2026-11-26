<!-- Partie de docs/DIRECTION.md : « Les rôles prévus ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

## Les rôles prévus

La direction peut noter à l'avance l'identifiant Discord de son encadrement et le rôle de chacun. La personne se connecte, donne le lien de son profil OpenFront dans `/compte`, et le serveur la valide aussitôt avec ce rôle. Personne n'a à intervenir. Cette liste reste une décision humaine : c'est la direction qui l'écrit.

Dans l'éditeur SQL de Supabase, avec le mode développeur de Discord pour copier les identifiants :

```sql
insert into internal.role_presets (discord_id, role) values
  ('IDENTIFIANT_D_UN_ADMIN', 'admin'),
  ('IDENTIFIANT_D_UN_OFFICIER', 'officer');
```

**Ne mettez jamais ces identifiants dans le dépôt : il est public.**

- **Qui décide :** seuls `admin` et `officer` sont acceptés. Le rôle de fondateur ne se prévoit pas, il se transmet.
- **Pourquoi passer par le lien :** un compte déjà validé ne peut plus lier son profil OpenFront. Valider dès la connexion laisserait la personne « Gaulois n° … » sur le site.
- **Un autre profil :** le lien d'un profil absent de la liste des membres ne valide rien. La demande attend un officier comme les autres. S'il la refuse, la personne reste prévue et peut recommencer. S'il la valide, le rôle arrive à ce moment-là.
- **Une seule fois :** l'entrée s'efface dès qu'elle a servi. Une rétrogradation tient donc après une nouvelle connexion, et rien ne reste de la liste une fois tout le monde passé.
- **La sécurité :** l'identifiant comparé vient de `auth.identities`, jamais de `raw_user_meta_data`. Personne ne lit ni n'écrit cette liste depuis le site, clé de service comprise.
- **La trace :** le journal note `membership_approved` et `role_preset_applied`, au nom de la personne elle-même.

Pour relire la liste, ou retirer quelqu'un avant sa demande :

```sql
select * from internal.role_presets;
```

```sql
delete from internal.role_presets where discord_id = 'SON_IDENTIFIANT';
```

