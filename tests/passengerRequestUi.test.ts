import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("la page demande passager ne rend pas le lien Scanner un code QR dans le header", () => {
  const shell = readFileSync(join(root, "components/PassengerRequestShell.tsx"), "utf8");

  assert.match(shell, /BrandLogo/);
  assert.match(shell, /LanguageSwitcher/);
  assert.equal(shell.includes("scan.start"), false);
  assert.equal(shell.includes("Scanner un code QR"), false);
  assert.equal(shell.includes("href=\"/\""), false);
});

test("annuler et recommencer tente le RPC puis un fallback serveur", () => {
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  const cancelClient = readFileSync(join(root, "lib/passengerCancelClient.ts"), "utf8");

  assert.match(form, /cancelPassengerRequestClient/);
  assert.match(form, /updateRequestStatus\(submittedRequestId,\s*"cancelled"/);
  assert.match(cancelClient, /\.select\("id"\)/);
  assert.match(cancelClient, /!directRow \? \{ ok: false \}/);
});

test("ramasser notifie instantanement le passager de retourner au scan", () => {
  const dashboard = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
  const form = readFileSync(join(root, "components/RequestForm.tsx"), "utf8");
  const broadcast = readFileSync(join(root, "lib/passengerNotifyBroadcast.ts"), "utf8");

  assert.match(broadcast, /PASSENGER_BROADCAST_REQUEST_BOARDED/);
  assert.match(dashboard, /broadcastPassengerRequestBoarded\(client,\s*projectId,\s*\[req\.id\]\)/);
  assert.match(form, /PASSENGER_BROADCAST_REQUEST_BOARDED/);
  assert.match(form, /router\.replace\("\/"\)/);
});

test("la protection anti-double-demande ne bloque pas une demande deja ramassee", () => {
  const guard = readFileSync(join(root, "supabase/passenger-device-open-request-guard.sql"), "utf8");
  const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8");

  assert.match(guard, /r\.status in \('pending', 'assigned', 'arriving'\)/);
  assert.doesNotMatch(guard, /'boarded'\)/);
  assert.match(schema, /r\.status in \('pending', 'assigned', 'arriving'\)/);
});
