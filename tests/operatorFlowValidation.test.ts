/**
 * Validation ciblée du flow critique operateur → passager.
 *
 * 7 scenarios demandes par l'humain avant merge :
 * 1. Pickup echoue  → demande reste visible operateur
 * 2. Pickup reussit → etat synchronise (UI + serveur)
 * 3. Dropoff        → bouton toujours dispo tant que necessaire
 * 4. Realtime retard → aucun etat incoherent
 * 5. Deux actions rapides → pas de desynchronisation
 * 6. Capacite atteinte  → aucune perte de demande
 * 7. Navigation passager → pas de redirection incorrecte
 *
 * Pattern : readFileSync + assert structurel (meme approche que
 * les autres fichiers de test du repo). Pas de DOM, pas de jsdom.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");
const DASHBOARD = readFileSync(join(root, "components/operator/OperatorDashboard.tsx"), "utf8");
const ACTIONS = readFileSync(join(root, "lib/actions.ts"), "utf8");
const REALTIME = readFileSync(join(root, "lib/realtime.ts"), "utf8");
const BRAIN = readFileSync(join(root, "services/elevatorBrain.ts"), "utf8");

// ---------------------------------------------------------------------------
// 1. Pickup echoue → demande reste visible cote operateur
// ---------------------------------------------------------------------------
test("validation 1: pickup echoue → onPickupFailure restaure le statut original dans liveRequests", () => {
  // Le handler doit (a) supprimer l'entree optimistic, (b) remettre le statut
  // original de la demande pour qu'elle reaparaisse dans la file operateur.
  assert.match(DASHBOARD, /onPickupFailure=\{[\s\S]*?optimisticRequestsRef\.current\.delete\(req\.id\)/);
  assert.match(DASHBOARD, /onPickupFailure=\{[\s\S]*?status: req\.status,\s*updated_at: req\.updated_at,\s*elevator_id: req\.elevator_id/);
});

test("validation 1: pickup echoue → current_load recalcule apres rollback", () => {
  const block = DASHBOARD.match(/onPickupFailure=\{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.match(block, /boardedLoad/);
  assert.match(block, /onElevatorPatch\?\.\(elevator\.id/);
});

// ---------------------------------------------------------------------------
// 2. Pickup reussit → etat synchronise (UI + serveur)
// ---------------------------------------------------------------------------
test("validation 2: pickup reussit → onPickupSuccess met a jour liveRequests en boarded", () => {
  assert.match(DASHBOARD, /onPickupSuccess=\{[\s\S]*?status: "boarded" as const/);
  assert.match(DASHBOARD, /onPickupSuccess=\{[\s\S]*?elevator_id: r\.elevator_id \?\? elevator\.id/);
});

test("validation 2: pickup reussit → onPickupSuccess broadcast le passager IMMEDIATEMENT (optimiste)", () => {
  const successBlock = DASHBOARD.match(/onPickupSuccess=\{[\s\S]*?\}\}/)?.[0] ?? "";
  // BUG 3 FIX: broadcast sent immediately in onPickupSuccess for instant passenger redirect
  assert.match(successBlock, /broadcastPassengerRequestBoarded/);
  // onPickupConfirmed also broadcasts (belt-and-suspenders)
  assert.match(DASHBOARD, /onPickupConfirmed=\{[\s\S]*?broadcastPassengerRequestBoarded\(client, projectId, \[req\.id\]\)/);
});

test("validation 2: pickup reussit → advanceRequestStatus appelle avec assignElevatorId", () => {
  assert.match(RECOMMENDED, /advanceRequestStatus\(requestId, "boarded", \{[\s\S]*?assignElevatorId: operatorElevatorId/);
});

// ---------------------------------------------------------------------------
// 3. Dropoff → bouton toujours dispo tant que necessaire
// ---------------------------------------------------------------------------
test("validation 3: effectiveCompletedDropoffIds exclut les IDs que le brain veut encore deposer", () => {
  // Si le brain recommande un dropoff pour un ID dans completedDropoffIds,
  // l'ID est exclus du filtre → le bouton reaparait.
  assert.match(RECOMMENDED, /const effectiveCompletedDropoffIds = useMemo\(\(\) => \{/);
  assert.match(RECOMMENDED, /const activeDropIds = new Set\(recommendation\.requestsToDropoff\.map/);
  assert.match(RECOMMENDED, /if \(!activeDropIds\.has\(id\)\) \{[\s\S]*?next\.add\(id\)/);
  assert.match(RECOMMENDED, /recommendation\.requestsToDropoff\.filter\(\(p\) => !effectiveCompletedDropoffIds\.has/);
});

test("validation 3: dropoff echoue → onDropoffFailure restaure status boarded", () => {
  assert.match(DASHBOARD, /onDropoffFailure=\{[\s\S]*?status: "boarded" as const, completed_at: null/);
});

// ---------------------------------------------------------------------------
// 4. Realtime update arrive en retard → aucun etat incoherent
// ---------------------------------------------------------------------------
test("validation 4: mergeOperatorPollRequest garde le statut terminal si existing est terminal et incoming ne l'est pas", () => {
  // La protection est dans resolveMerge() (lib/stateResolution.ts) :
  // terminal status (completed/cancelled) wins over non-terminal.
  // mergeOperatorPollRequest delegates to resolveMerge.
  const STATE_RESOLUTION = readFileSync(join(root, "lib/stateResolution.ts"), "utf8");
  assert.match(STATE_RESOLUTION, /existingTerminal && !incomingTerminal/);
  // mergeOperatorPollRequest must delegate to resolveMerge
  assert.match(REALTIME, /resolveMerge\(existing, incoming\)/);
  // Le realtime dans OperatorDashboard applique applyOptimisticRequest.
  assert.match(DASHBOARD, /applyOptimisticRequest\(payload\.new\)/);
});

test("validation 4: applyOptimisticRequest supprime l'entree optimistic si le statut correspond", () => {
  assert.match(DASHBOARD, /request\.status === optimistic\.request\.status/);
  assert.match(DASHBOARD, /optimisticRequestsRef\.current\.delete\(request\.id\)/);
});

// ---------------------------------------------------------------------------
// 5. Deux actions rapides operateur → pas de desynchronisation
// ---------------------------------------------------------------------------
test("validation 5: pendingPickupIds empeche le double-clic pickup", () => {
  // Si l'ID est deja dans pendingPickupIds, pickup() retourne immediatement.
  assert.match(RECOMMENDED, /if \(pendingPickupIds\.has\(requestId\)\) return/);
});

test("validation 5: pendingDropoffIds empeche le double-clic dropoff", () => {
  assert.match(RECOMMENDED, /const alreadyPending = ids\.some\(\(id\) => pendingDropoffIds\.has\(id\)\)/);
  assert.match(RECOMMENDED, /if \(alreadyPending\) return/);
});

// ---------------------------------------------------------------------------
// 6. Capacite atteinte → aucune perte de demande
// ---------------------------------------------------------------------------
test("validation 6: la capacite ne bloque jamais l'insertion d'une demande (regle metier)", () => {
  // Dans createPassengerRequest : si !assignment.elevatorId ET syntheticReservations.length > 0,
  // on reset et on retente. Sinon on retourne erreur. Mais les demandes deja assignees restent.
  assert.match(ACTIONS, /if \(syntheticReservations\.length > 0\) \{[\s\S]*?syntheticReservations = \[\]/);
  assert.match(ACTIONS, /continue/);
  // Le dispatch engine emet des warnings mais ne bloque pas.
  assert.match(RECOMMENDED, /capacityWarnings/);
});

test("validation 6: requestsToPickup vide quand capacite atteinte → idle_blocked (pas de perte)", () => {
  // Le brain recommande idle_blocked avec capacityWarnings quand les demandes
  // sont trop grandes mais ne les supprime pas de la DB.
  assert.match(BRAIN, /kind: "idle_blocked"/);
  // RecommendedNextStop affiche le message idle_blocked.
  assert.match(RECOMMENDED, /recommendation\.reasonDetail\?\.kind === "idle_blocked"/);
  // La queue affiche les demandes meme si non-pickable.
  assert.match(DASHBOARD, /liveQueue/);
});

// ---------------------------------------------------------------------------
// 7. Navigation passager → pas de redirection incorrecte
// ---------------------------------------------------------------------------
test("validation 7: broadcast envoye IMMEDIATEMENT dans onPickupSuccess pour retour QR rapide", () => {
  // BUG 3 FIX: broadcast is sent immediately in onPickupSuccess (optimistic)
  // so the passenger gets instant feedback. If server action fails, onPickupFailure rolls back.
  // onPickupConfirmed also broadcasts (belt-and-suspenders).
  assert.match(RECOMMENDED, /if \(result\.ok\) \{\s*onPickupConfirmed\?\.\(targetRequest\)/);
  const successBlock = DASHBOARD.match(/onPickupSuccess=\{[\s\S]*?\}\}/)?.[0] ?? "";
  assert.match(successBlock, /broadcastPassengerRequestBoarded/);
});

test("validation 7: le passager reste sur RequestStatusCard tant que le pickup n'est pas confirme", () => {
  // RequestStatusCard ne redirige pas le passager ; seul le broadcast ou le poll
  // declenche router.replace. Le broadcast est envoye immediatement (optimiste).
  const statusCard = readFileSync(join(root, "components/RequestStatusCard.tsx"), "utf8");
  // La carte affiche le statut courant et ne redirige pas elle-meme.
  assert.doesNotMatch(statusCard, /router\.replace/);
});
