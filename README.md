# Suivi des heures — VLADIS

Application de pointage : chaque chef d'équipe se connecte, retrouve sa brigade déjà présélectionnée,
saisit les heures du jour et envoie. Les données sont stockées dans Supabase (Postgres + Auth), avec
row-level security : un chef ne voit/écrit que sa propre équipe, `rh_admin` voit tout.

## Mise en place (une seule fois)

1. **Créer un projet Supabase** (région EU recommandée, ex. Frankfurt) sur https://supabase.com.
2. Dans le **SQL Editor** du projet, exécuter le contenu de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — crée les tables
   `teams`, `employees`, `absence_types`, `pointage_entries` + les policies RLS.
3. Activer l'authentification par **email / magic link** dans Authentication → Providers.
4. Copier `.env.local.example` vers `.env.local` et remplir les valeurs depuis
   Project Settings → API (URL, anon key, service role key).
5. Installer les dépendances puis peupler les équipes à partir de `data/equipes.ts` :

   ```bash
   npm install
   npm run seed:equipes
   ```

6. Dans Supabase, créer un compte Auth pour chaque chef d'équipe et pour le/la RH (Authentication →
   Users → Invite), puis, dans la table `user_roles`, associer chaque `auth_user_id` à :
   - `role = 'chef'` + `employee_id` = la ligne `employees` correspondant à ce chef (celle référencée
     par `teams.chef_employee_id`) — le chef ne verra alors que sa propre équipe.
   - `role = 'rh_admin'` (employee_id optionnel) pour l'accès complet.

7. Lancer l'application :

   ```bash
   npm run dev
   ```

   Ouvrir [http://localhost:3000](http://localhost:3000) — redirige vers `/login` si non connecté.

## Structure

- `app/page.tsx` — formulaire de pointage (équipe → date → heures par ouvrier).
- `app/login`, `app/auth/callback` — connexion par magic link Supabase.
- `proxy.ts` + `lib/supabase/proxy.ts` — rafraîchissement de session et protection des routes
  (convention `proxy` de Next.js 16, remplace l'ancien `middleware.ts`).
- `lib/supabase/client.ts` / `server.ts` — clients Supabase (navigateur / serveur).
- `supabase/migrations/` — schéma SQL, à appliquer dans l'ordre.
- `scripts/seed-equipes.ts` — migration ponctuelle `data/equipes.ts` → tables `teams`/`employees`.
- `data/equipes.ts` — conservé comme source du script de seed uniquement (plus utilisé à l'exécution).

## Déploiement

Le projet est prévu pour Vercel. Ajouter les mêmes variables que `.env.local` (sauf
`SUPABASE_SERVICE_ROLE_KEY`, réservée aux scripts locaux) dans Project Settings → Environment
Variables sur Vercel avant de déployer.
