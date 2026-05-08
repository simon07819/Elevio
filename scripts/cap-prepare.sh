#!/usr/bin/env bash
# Prepare the Capacitor webDir with a boot-loader fallback index.html.
#
# This script:
#   1. Reads CAPACITOR_SERVER_URL from .env.local (or shell env).
#   2. Creates out/index.html — a BOOT LOADER that redirects the WebView
#      to the live Next.js server instead of showing a dead-end "Chargement" screen.
#   3. Exports the URL so `npx cap sync ios` bakes server.url into the
#      capacitor.config.json — the FIRST-PATH way Capacitor loads the app.
#   4. The fallback HTML is the SECOND-PATH safety net: if server.url is
#      missing from the config (e.g. env var wasn't in shell during sync),
#      the HTML bootstraps the app by redirecting to the Vercel URL.
#
# IMPORTANT: No redirect to /welcome — it has no static HTML in webDir
# and would cause an infinite reload loop. The redirect always goes to /
# on the Next.js server, which serves ScanHome (passenger QR scan page).
set -euo pipefail

# ── 1. Resolve the server URL ────────────────────────────────────────────
# Priority: shell env > .env.local > empty
SERVER_URL="${CAPACITOR_SERVER_URL:-}"
if [ -z "$SERVER_URL" ] && [ -f .env.local ]; then
  # Read the value from .env.local (first match, no comments, trimmed)
  SERVER_URL=$(grep -E '^CAPACITOR_SERVER_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
  echo "[cap-prepare] CAPACITOR_SERVER_URL from .env.local: ${SERVER_URL}"
else
  echo "[cap-prepare] CAPACITOR_SERVER_URL from shell env: ${SERVER_URL:-<empty>}"
fi

# Export so Capacitor CLI reads it when compiling capacitor.config.ts
export CAPACITOR_SERVER_URL="$SERVER_URL"

# ── 2. Generate boot-loader index.html ──────────────────────────────────
mkdir -p out

if [ -n "$SERVER_URL" ]; then
  # Normalize: strip trailing slash
  NORMALIZED_URL="${SERVER_URL%/}"

  cat > out/index.html << HTMLEOF
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/><title>Elevio</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#020826;color:#f8fafc;font-family:system-ui,sans-serif;flex-direction:column;gap:12px}.spinner{width:28px;height:28px;border:3px solid rgba(248,250,252,.15);border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.err{color:#f87171;font-size:13px;max-width:80vw;text-align:center;display:none}</style></head><body>
<p>Chargement d'Elevio...</p>
<div class="spinner"></div>
<p class="err" id="e"></p>
<script>
(function(){
  var url="${NORMALIZED_URL}";
  var isCap=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
  console.log("[iOS Boot]",{step:"fallback_html",pathname:window.location.pathname,isCapacitor:isCap,serverUrl:url});

  // ── BOOT TIMEOUT: 8s ──
  // If the Next.js server is unreachable, show an error instead of
  // staying stuck on "Chargement d'Elevio" forever.
  var bootTimeoutMs=8000;
  var bootTimer=setTimeout(function(){
    console.error("[iOS Boot] TIMEOUT — server unreachable after",bootTimeoutMs,"ms");
    document.getElementById("e").style.display="block";
    document.getElementById("e").textContent="Impossible de joindre le serveur. Vérifiez votre connexion réseau.";
    document.querySelector(".spinner").style.display="none";
    document.querySelector("p").textContent="Échec du chargement";
  },bootTimeoutMs);

  // ── REDIRECT to live Next.js server ──
  // This is the second-path bootstrap. If Capacitor config has server.url
  // set (first-path), this HTML is never shown. If not, this redirect
  // ensures the app loads from the deployed Vercel URL.
  console.log("[iOS Boot] redirecting to",url);
  window.location.replace(url+"/");
})();
</script></body></html>
HTMLEOF

  echo "[cap-prepare] out/index.html generated with server URL: ${NORMALIZED_URL}"
else
  # No server URL — generate minimal fallback (offline-only mode)
  cat > out/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/><title>Elevio</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#020826;color:#f8fafc;font-family:system-ui,sans-serif;flex-direction:column;gap:12px}.err{color:#f87171;font-size:13px;max-width:80vw;text-align:center}</style></head><body>
<p>Chargement d'Elevio...</p>
<p class="err">CAPACITOR_SERVER_URL non configuré. Lancez: bash scripts/cap-prepare.sh && npx cap sync ios</p>
<script>
console.log("[iOS Boot]",{step:"fallback_html",pathname:window.location.pathname,isCapacitor:!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()),serverUrl:null});
console.error("[iOS Boot] NO SERVER URL — app cannot boot without CAPACITOR_SERVER_URL");
</script></body></html>
HTMLEOF

  echo "[cap-prepare] WARNING: CAPACITOR_SERVER_URL is empty — app will NOT boot on iOS"
  echo "[cap-prepare] Set it in .env.local or export it before running this script"
fi

echo "out/ ready for Capacitor"
