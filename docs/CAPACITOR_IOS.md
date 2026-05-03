# Capacitor iOS — Guide de build et déploiement

## Architecture

Elevio utilise **Capacitor en mode live server**. L'app iOS charge l'application
depuis un serveur Next.js (dev ou production), pas depuis des fichiers statiques.

Pourquoi : les Server Actions, le callback OAuth Supabase, et les pages SSR
nécessitent un serveur. L'export statique (`output: "export"`) casserait
l'authentification et les actions serveur.

## Commandes

### Développement local

```bash
# 1. Lancer le serveur Next.js
npm run dev

# 2. Préparer le webDir minimal
bash scripts/cap-prepare.sh

# 3. Configurer l'URL du serveur local
export CAPACITOR_SERVER_URL="http://<VOTRE_IP_LOCALE>:3000"
npx cap sync ios

# 4. Ouvrir dans Xcode
npx cap open ios
# puis Run dans Xcode
```

### Production (app déployée)

```bash
# 1. Préparer le webDir
bash scripts/cap-prepare.sh

# 2. Retirer CAPACITOR_SERVER_URL (utiliser le bundle web)
unset CAPACITOR_SERVER_URL
npx cap sync ios

# 3. Ouvrir dans Xcode
npx cap open ios
# puis Archive > Distribute App
```

Note : En production sans `server.url`, Capacitor charge `out/index.html`
qui affiche "Chargement d'Elevio...". Pour que l'app fonctionne hors ligne
en production, il faudra convertir les pages SSR en client-side (export statique).
Ceci est un travail futur.

### Sync après changement web

```bash
npx cap sync ios
```

## Configuration

- **appId** : `com.elevio.app`
- **appName** : `Elevio`
- **webDir** : `out/` (fallback HTML minimal)
- **server.url** : variable d'env `CAPACITOR_SERVER_URL`

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `capacitor.config.ts` | Configuration Capacitor |
| `ios/App/` | Projet Xcode généré |
| `scripts/cap-prepare.sh` | Crée `out/index.html` minimal |
| `app/layout.tsx` | viewport-fit=cover, apple-touch-icon |

## Prochaines étapes pour l'App Store

1. Ajouter les vraies icônes iOS (1024x1024) dans `ios/App/App/Assets.xcassets`
2. Configurer le signing Xcode (Apple Developer account)
3. Tester sur device physique avec le serveur local
4. Pour l'offline complet : convertir les pages SSR en client-side + export statique
