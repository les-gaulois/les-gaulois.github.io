<!-- Partie de docs/DIRECTION.md : « Installer la connexion » › « 3. Installer le schéma ». Sommaire et ordre des parties : docs/DIRECTION.md. -->

### 3. Installer le schéma

Collez chaque fichier de `supabase/migrations/` dans l'éditeur SQL de Supabase, **dans l'ordre de leurs noms**, ou utilisez `npx supabase db push` après `npx supabase login` et `npx supabase link`. Ces fichiers installent aussi les tables de l'ancien jeu. Une migration déjà appliquée ne se modifie jamais : on en ajoute une nouvelle.

