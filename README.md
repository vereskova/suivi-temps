# Suivi des heures — VLADIS

Application interne VLADIS (BTP / installation solaire) : pointage quotidien des équipes,
gestion RH de l'effectif, paie, documents administratifs et suivi commercial. Construite en
Next.js sur Supabase (Postgres + Auth + Storage + RLS).

## Stack technique

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**
- **Supabase** : Postgres, Auth (magic link), Storage, Row-Level Security — pas d'ORM, requêtes
  via `@supabase/supabase-js` / `@supabase/ssr`
- **Tailwind CSS v4**
- **xlsx** (SheetJS) pour l'export/import Excel (pointage, checklists commerciales)
- **docx** + **@react-pdf/renderer** pour la génération de documents RH (`lib/documents/*`)
- `proxy.ts` (convention Next.js 16, remplace `middleware.ts`) pour le rafraîchissement de
  session et la protection des routes
- `lib/auth/requireRole.ts` — vérification auth+rôle partagée par les routes `app/api/**`, pour
  éviter que chacune ré-implémente (et désynchronise) le même bloc
- `app/error.tsx` / `app/global-error.tsx` — error boundaries App Router ; en l'absence de service
  de suivi d'erreurs (Sentry ou équivalent), elles se contentent de `console.error` + un écran de
  secours, plutôt que l'écran générique de Next.js

## Mise en place

1. **Créer un projet Supabase** (région EU, ex. Frankfurt) sur https://supabase.com.
2. Dans le **SQL Editor** du projet, exécuter les fichiers de `supabase/migrations/` **dans
   l'ordre numérique** (0001, 0002, …) — voir [Migrations](#migrations) ci-dessous.
3. Activer l'authentification **email / magic link** dans Authentication → Providers.
4. Copier `.env.local.example` vers `.env.local` et renseigner :

   | Variable | Où la trouver | Utilisée par |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | app (client + serveur) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API | app (client + serveur) |
   | `SUPABASE_URL` | Project Settings → API | scripts `scripts/*.ts` uniquement |
   | `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (secret) | scripts `scripts/*.ts` uniquement — ne jamais exposer au navigateur |
   | `SINAO_API_KEY` / `SINAO_APP_ID` | Sinao → Réglages → Clés API | intégration Sinao (voir [Limitations](#limitations-connues)) — absentes tant que la clé n'a pas été créée, l'appli tourne alors en mode simulation |

5. Installer les dépendances et lancer le serveur de développement :

   ```bash
   npm install
   npm run dev
   ```

   Ouvrir [http://localhost:3000](http://localhost:3000) — le formulaire de pointage (`/`) est
   public, aucune connexion requise. `/admin` redirige vers `/login` si non connecté.

6. Provisionner les comptes du personnel de bureau/admin avec les scripts de `scripts/`
   (chacun crée l'utilisateur Auth et son rôle dans `user_roles`, voir la table ci-dessous) :

   ```bash
   npx tsx scripts/seed-rh-login.ts rh@example.com
   npx tsx scripts/seed-comptable-login.ts accountant@example.com
   npx tsx scripts/seed-commercial-login.ts commercial@example.com
   # rh_admin : créer l'utilisateur dans Auth → Users, puis insérer manuellement
   # la ligne user_roles (role = 'rh_admin').
   ```

## Rôles et accès

Le rôle est stocké dans `user_roles.role` (enum Postgres `app_role`), lu au chargement de
`/admin` et utilisé à la fois pour l'affichage (menu) et pour les policies RLS côté base.

| Rôle | Accès dans `/admin` |
|---|---|
| **rh_admin** | Tout : Pointage (par jour / par employé / totaux du mois / export-import), Effectif (employés, médical, formations, tailles), RH (documents, calculateur de rupture, registre du personnel, organigramme, cours de français, dossier salarié, paie), Commercial. Seul rôle pouvant générer des documents (`/api/documents/generate`). |
| **rh** | Effectif + section RH complète (documents, calculateur de rupture, registre, organigramme, cours de français, dossier salarié) — pas de Pointage, pas de Paie, pas de Commercial. Vue de démarrage : Employés. Le calculateur de rupture et la génération de documents ont longtemps été codés en dur `rh_admin` uniquement alors que `rh` a déjà toute la RLS nécessaire (migration `0017`) — corrigé : les deux sont maintenant ouverts à `rh`. |
| **comptable** | Interface dédiée à deux onglets : Paie, et Employés en lecture seule (pas d'ajout/édition ; `employee_confidential` n'a aucune policy RLS pour ce rôle, donc RIB/salaire/etc. restent invisibles). |
| **commercial** | Interface dédiée à une seule vue : checklists client / préparation de devis (dossiers), export PDF, et action "Envoyer vers Sinao". |

Chaque rôle en dehors de `rh_admin` a sa propre coquille d'interface (sidebar réduite) plutôt que
le layout complet à `NAV_GROUPS` — voir `app/admin/page.tsx` (recherche `role === "comptable"` /
`role === "commercial"`).

**Rôles historiques** : l'enum `app_role` contient aussi `chef` et `boss`, et le schéma garde
encore leurs anciennes policies RLS (`supabase/migrations/0001_init.sql`,
`current_chef_team_id()`). Ils datent de l'époque où chaque chef d'équipe se connectait par
magic link pour saisir les heures de sa brigade ; depuis la migration `0022` (voir plus bas), le
pointage est public et ces rôles ne sont plus attribués à personne. Le champ `teams.chef_employee_id`
(« qui est chef de cette équipe ») et `bureau_role = 'boss'` sur `employees` restent en revanche
utilisés comme simples métadonnées d'affichage (badge couronne, organigramme) — ce n'est plus un
mécanisme d'auth.

## Le formulaire public de pointage (`/`)

Depuis la migration `supabase/migrations/0022_public_pointage.sql`, `/` ne demande plus de
connexion : les chefs d'équipe trouvaient le round-trip par email trop pénible sur mobile au
quotidien. Compromis assumé et documenté dans la migration : n'importe qui disposant du lien peut
soumettre des heures pour n'importe quelle équipe, et une vue restreinte (`pointage_roster`)
n'expose que `id, first_name, last_name, team_id, status` — jamais les colonnes sensibles
(RIB, salaire, adresse, sécurité sociale…) qui vivent sur `employees` / `employee_confidential`.
`/admin` continue d'exiger une connexion.

## Connexion (`/login`)

Réservée au personnel de bureau/admin (rh_admin, rh, comptable, commercial). Magic link Supabase
(`supabase.auth.signInWithOtp`), retour via `/auth/callback`, puis redirection vers `/admin`.

## Fonctionnalités par module

**Notifications** (`rh_admin`, `rh`)
- Échéances à venir (documents, visites médicales, rappel légal à 3 ans, anniversaires), regroupées
  par urgence (jour/semaine/mois)
- État lu/non-lu partagé en base (`notification_flags`, migration `0031`) plutôt que dans le
  localStorage de chaque navigateur — un même dossier lu par une personne compte comme lu pour
  toute l'équipe RH. Clic sur « Notifications » dans le menu = tout remettre en non-lu ; clic droit
  sur une ligne = ne remettre en non-lu que celle-ci

**Journal d'audit** (`rh_admin` uniquement)
- Historique des créations/modifications/suppressions sur `employees`, `registre_unique_personnel`
  et `payroll_line_items` — les trois modules avec le plus d'exposition légale/financière. Alimenté
  par des triggers Postgres (`audit_log`, migration `0032`), pas par un appel côté client à chaque
  écran d'édition — un trigger ne peut pas être oublié dans un futur changement de code, contrairement
  à un appel manuel ajouté à chaque endroit qui écrit. Détail « avant → après » champ par champ pour
  les modifications, snapshot complet pour créations/suppressions

**Pointage** (`rh_admin`)
- Par jour — saisie/consultation équipe par équipe pour une date donnée
- Par employé — historique d'un salarié
- Totaux du mois — récapitulatif mensuel des heures/absences
- Export / Import — export Excel, et import (notamment depuis l'export CSV de Prevaly)

**Effectif** (`rh_admin`, `rh`)
- Employés — fiches, statut, équipe, catégorie chantier/bureau
- Médical — visites médecine du travail et échéances
- Formations — habilitations et sessions de formation
- Tailles — tailles de vêtements/EPI

**RH** (`rh_admin` et `rh`, sauf Paie qui reste `rh_admin`/`comptable`)
- Documents — génération de contrats CDI (chantier/bureau), NDA, attestation de congés payés,
  demande de congé sans solde, lettre de démission — via `/api/documents/generate`
  (`lib/documents/renderDocx.ts` / `renderPdf.tsx`). Ouvert à `rh_admin` et `rh`
  (`lib/auth/requireRole.ts`)
- Calculateur de rupture — préavis, indemnités, procédure RC/démission/licenciement selon la
  Convention collective Métallurgie (`lib/rupture/compute.ts`), ouvert à `rh_admin` et `rh`
- Registre du personnel — registre unique du personnel
- Organigramme — hiérarchie équipes/chefs/bureau
- Cours de français — sessions et présence
- Dossier salarié — documents par salarié (Storage privé, bucket `dossier-salarie`)
- Paie — calcul de bulletin (`lib/payroll/compute.ts`), jours fériés français
  (`lib/payroll/frenchHolidays.ts`), **rh_admin et comptable**

**Commercial** (`rh_admin`, `commercial`)
- Checklists client / préparation de devis par dossier, avec catégories et statut par ligne
- Export PDF (`/api/commercial/export`)
- Envoi vers Sinao (`/api/commercial/sinao-quote`) — voir limitation ci-dessous

## Migrations

`supabase/migrations/*.sql`, numérotées et appliquées **manuellement**, dans l'ordre, par
l'administrateur du projet Supabase via le SQL Editor de la console. Il n'y a **aucun runner de
migration automatisé** dans ce repo (pas de script `db push`, pas d'étape CI qui les applique) —
seul `.github/workflows/ci.yml` existe, et il ne touche pas à la base (voir plus bas).

Quelques scripts `scripts/*.ts` sont des tâches ponctuelles liées à des migrations (seed initial
des équipes, import de l'historique Google Sheets, provisioning des comptes par rôle) — à lancer
avec `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en variables d'environnement, jamais depuis le
navigateur.

## CI

`.github/workflows/ci.yml` s'exécute sur chaque push/PR : install, `tsc --noEmit`, `npm run lint`,
`npm run build`. Aucune étape de tests — voir limitation ci-dessous.

## Limitations connues

- **Intégration Sinao en mode simulation** — `lib/sinao/client.ts` n'appelle l'API réelle
  (`https://api.sinao.app/v1`) que si `SINAO_API_KEY` et `SINAO_APP_ID` sont configurées ; tant
  qu'elles ne le sont pas, `createDraftQuote()` simule la réponse et préfixe l'identifiant de
  devis avec `STUB-` (voir `isStubQuoteId`). À noter : Sinao ne propose pas d'environnement de
  sandbox documenté, donc le premier appel réel se fera directement contre les données de
  production Sinao.
- **Pas de suite de tests** — aucun framework de test (Jest/Vitest/Playwright) n'est installé,
  aucun fichier `*.test.*`/`*.spec.*` dans le repo. La CI vérifie seulement types + lint + build.
- **Rôles `chef`/`boss` historiques** — toujours présents dans l'enum `app_role` et dans les
  policies RLS de la migration initiale, mais plus jamais attribués depuis que `/` est public
  (migration `0022`). Documenté directement sur le type Postgres (`comment on type app_role`,
  migration `0030`) pour que ça reste visible même en dehors de ce README. Supprimer une valeur
  d'enum impose de recréer le type — pas fait ici tant que personne n'a vérifié qu'aucune ligne
  `user_roles` historique ne les utilise encore.
