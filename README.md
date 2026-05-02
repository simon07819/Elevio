# Elevio

Elevio est une PWA mobile-first pour gerer les demandes d'un elevateur exterieur sur chantier. Les travailleurs scannent un code QR a leur etage, choisissent leur destination et l'operateur recoit les demandes en temps reel avec une recommandation de trajectoire.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL + Realtime
- PWA mobile/tablette
- Interface FR/EN ready, contenu initial en francais

## Routes

- `/` landing
- `/select-mode` choix passager / operateur / admin
- `/request?projectId=PROJECT_ID&floorToken=QR_TOKEN` demande passager via QR
- `/operator` cockpit operateur
- `/admin` hub admin
- `/admin/projects` projets, capacite, elevateurs
- `/admin/floors` etages et tokens QR
- `/admin/qrcodes` codes QR imprimables
- `/admin/stats` statistiques

## Installation

```bash
npm install
npm run dev
```

Ouvrir ensuite `http://localhost:3000`.

## Variables ENV

Créer `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL=https://YOUR_PUBLIC_DOMAIN.example.com
SUPERADMIN_EMAILS=owner@example.com
```

`NEXT_PUBLIC_APP_URL` doit être l’URL **publique** du site (sans slash final), par ex. `https://elevio-seven.vercel.app` sur Vercel. Elle sert aux **liens encodés dans les codes QR** : sans elle, si vous générez les affiches depuis `localhost`, les téléphones ouvriront localhost.

Sans variables Supabase, l'app fonctionne en mode demo avec les donnees locales dans `lib/demoData.ts`.

## Supabase

1. Creer un projet Supabase.
2. Executer `supabase/schema.sql` dans le SQL editor.
3. Executer `supabase/seed.sql` pour charger les donnees demo.
4. Verifier que Realtime est active pour `projects`, `floors`, `elevators`, `requests`, `request_events` et `operator_messages`.

### Bases deja creees (migration incrementale)

Si l application ou Supabase renvoie une erreur du type **column elevators.operator_tablet_label does not exist**, ouvrir **SQL Editor** et executer **`supabase/elevator-operator-tablet-label.sql`** (idempotent). Pour **column elevators.operator_display_name does not exist** ou **Could not find the 'operator_display_name' column of 'elevators' in the schema cache**, executer **`supabase/elevator-operator-display-name.sql`** (ajoute la colonne et envoie `reload schema` a PostgREST). Meme chose pour **column projects.priorities_enabled does not exist** avec **`supabase/project-priorities-enabled.sql`**. Pour que les passagers retrouvent leur demande apres fermeture de l app (QR / lien), executer **`supabase/passenger-resume-request-rpc.sql`** (fonction RPC `resume_passenger_request`). Pour les autres scripts `supabase/*.sql` hors `schema.sql` / `seed.sql`, executer le fichier correspondant aux fonctionnalites ajoutees apres la creation du projet.

### Securite multi-compte (audit 2026-05)

Deux migrations SQL doivent etre executees sur les bases existantes pour fermer des fuites
identifiees lors de l audit :

1. **`supabase/users-rls-tighten.sql`** (idempotent) — resserre la policy RLS sur la table
   `users` pour qu une rangee `project_id NULL` ne soit plus visible aux admins d autres
   comptes (seuls les superadmins).
2. **`supabase/passenger-landing-rpc.sql`** (idempotent) — ajoute trois RPC SECURITY
   DEFINER (`passenger_landing`, `passenger_floor_by_access_code`,
   `passenger_elevator_snapshots`) qui permettent au code passager d acceder uniquement
   aux donnees liees au QR scanne, au lieu de s appuyer sur des policies SELECT publiques
   trop larges. **Etape 2 (drop des policies anon)** est commentee a la fin du fichier ;
   ne l executer qu apres avoir verifie en staging que le code deploye utilise bien les
   RPC.

Ces deux fichiers sont egalement reflectes dans `schema.sql` pour les bases neuves.

### Auth admin

Dans Supabase Dashboard, configurer:

- Authentication -> URL Configuration -> Site URL: `http://localhost:3000`
- Authentication -> URL Configuration -> Redirect URLs: `http://localhost:3000/auth/callback`

En production, ajouter aussi l'URL du domaine Elevio dans les Redirect URLs.

La creation d'un compte admin demande prenom, nom, compagnie, telephone, email et mot de passe. Supabase envoie un courriel de confirmation; le lien revient sur `/auth/callback`, cree/met a jour le profil, puis redirige vers `/admin/profile?onboarding=1` pour ajouter vos logos (vous pouvez passer cette etape et les ajouter plus tard).

Les emails listes dans `SUPERADMIN_EMAILS` deviennent superadmins apres confirmation ou connexion.

### Stockage des logos (bucket `brand-logos`)

Les uploads utilisent le bucket Storage **`brand-logos`** (public, max 2 Mo, PNG / JPEG / WebP / SVG).

Si l’app affiche **« Bucket not found »** au téléversement :

1. Ouvrir **Supabase Dashboard** → **SQL Editor**.
2. Copier-coller et exécuter tout le contenu de **`supabase/storage-brand-logos.sql`** (idempotent : peut être relancé).
3. Vérifier dans **Storage** que le bucket **`brand-logos`** est bien listé.

Ce fichier est aussi inclus à la fin de **`supabase/schema.sql`** si vous déployez une base neuve.

### Template courriel Elevio

Supabase utilise un courriel par defaut tant que le template n'est pas remplace dans le dashboard.

Pour installer le courriel Elevio:

1. Ouvrir Supabase Dashboard.
2. Aller dans `Authentication` -> `Email Templates`.
3. Ouvrir `Confirm signup`.
4. Sujet recommande: `Confirmez votre compte Elevio`.
5. Coller le contenu de `supabase/email-templates/confirm-signup.html` dans le template HTML.
6. Sauvegarder.

La version texte fallback est dans `supabase/email-templates/confirm-signup.txt`.

Le template utilise les variables Supabase:

- `{{ .ConfirmationURL }}` pour le bouton de confirmation.
- `{{ .Email }}` pour afficher le courriel du compte.

Le schema accepte toutes les demandes. La capacite ne bloque jamais l'insertion: elle sert uniquement au dispatch, aux badges et aux recommandations operateur.

## Dispatch

Le moteur principal est `services/dispatchEngine.ts`.

Il prend:

- etage courant
- direction courante
- demandes actives
- capacite maximale
- charge courante
- passagers deja a bord

Il retourne:

- prochain etage recommande
- raison lisible
- demandes a prendre
- passagers a deposer
- direction suggeree
- alertes de capacite

Le scoring applique les regles demandees: priorite, temps d'attente, meme direction, sur le chemin, capacite, split, detour et penalite d'equite.

## Deploiement

Deploiement recommande sur Vercel:

```bash
npm run build
```

Puis configurer les variables `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans le dashboard Vercel.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## Notes produit

- Les gros boutons et cartes sont concus pour un usage avec gants.
- Les codes QR de `/admin/qrcodes` sont imprimables.
- Les demandes prioritaires exigent une raison.
- Les groupes trop grands restent acceptes et visibles avec recommandation de plusieurs passages.
