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
