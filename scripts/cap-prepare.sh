#!/usr/bin/env bash
# Prepare the Capacitor webDir with a minimal fallback index.html.
# In live-server mode, Capacitor loads from server.url instead.
# This script ensures `out/` exists for `npx cap sync`.
# The fallback page redirects to /welcome if Capacitor is detected.
set -euo pipefail
mkdir -p out
if [ ! -f out/index.html ]; then
  cat > out/index.html << 'EOF'
<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/><title>Elevio</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#07090d;color:#f8fafc;font-family:system-ui,sans-serif}</style><script>if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){window.location.replace('/welcome')}</script></head><body><p>Chargement d'Elevio...</p></body></html>
EOF
fi
echo "out/ ready for Capacitor"
