/**
 * Smoke tests for the passenger flow (RequestForm + RequestStatusCard).
 *
 * Strategy: stay light — read component source files and assert structural
 * invariants (imports, hidden form fields, server-action wiring, status states,
 * realtime subscriptions). No DOM render, no jsdom. Mirrors the existing
 * passengerRequestUi.test.ts pattern.
 *
 * Goal: detect if anything breaks the passenger flow plumbing without locking
 * cosmetics. Each test focuses on a single behavior.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const REQUEST_FORM = read("components/RequestForm.tsx");
const STATUS_CARD = read("components/RequestStatusCard.tsx");
const SHELL = read("components/PassengerRequestShell.tsx");
const CANCEL_CLIENT = read("lib/passengerCancelClient.ts");
const RESUME_CLIENT = read("lib/passengerResumeClient.ts");

// ---------------------------------------------------------------------------
// Creation d'une demande via UI : le formulaire est correctement cable
// ---------------------------------------------------------------------------

test("smoke flow: RequestForm submit appelle createPassengerRequest", () => {
  assert.match(REQUEST_FORM, /createPassengerRequest/);
  // L'action server est appelee avec le formData provenant du form action.
  assert.match(REQUEST_FORM, /createPassengerRequest\(formData\)/);
});

test("smoke flow: RequestForm pose les hidden inputs requis (projectId, fromFloorId, toFloorId, passengerDeviceKey)", () => {
  assert.match(REQUEST_FORM, /name="projectId"/);
  assert.match(REQUEST_FORM, /name="fromFloorId"/);
  assert.match(REQUEST_FORM, /name="toFloorId"/);
  assert.match(REQUEST_FORM, /name="passengerDeviceKey"/);
});

test("smoke flow: RequestForm propage project.id, currentFloor.id et destinationId aux hidden inputs", () => {
  assert.match(REQUEST_FORM, /value=\{project\.id\}/);
  assert.match(REQUEST_FORM, /value=\{currentFloor\.id\}/);
  assert.match(REQUEST_FORM, /value=\{destinationId\}/);
});

test("smoke flow: RequestForm utilise FloorSelector pour la destination", () => {
  assert.match(REQUEST_FORM, /import \{ FloorSelector \} from "@\/components\/FloorSelector"/);
  assert.match(REQUEST_FORM, /<FloorSelector[\s\S]*?onSelect=\{setDestinationId\}/);
});

test("smoke flow: RequestForm input passengerCount est borne par passengerMax (min=1, max=passengerMax)", () => {
  assert.match(REQUEST_FORM, /name="passengerCount"/);
  assert.match(REQUEST_FORM, /min=\{1\}/);
  assert.match(REQUEST_FORM, /max=\{passengerMax\}/);
  // passengerMax vient de maxPassengerPartySize.
  assert.match(REQUEST_FORM, /maxPassengerPartySize\(capacityEnabled, liveElevators\)/);
});

test("smoke flow: RequestForm boutons +/- changent passengerCount (clic = feedback visuel actif)", () => {
  // Bouton -1 et +1 sur passengerCount.
  assert.match(REQUEST_FORM, /setPassengerCount\(\(value\) => Math\.max\(1, value - 1\)\)/);
  assert.match(REQUEST_FORM, /setPassengerCount\(\(value\) => Math\.min\(passengerMax, value \+ 1\)\)/);
});

test("smoke flow: RequestForm priority est pose uniquement quand prioritiesEnabled", () => {
  // Le bloc priorite est rendu sous {prioritiesEnabled ? ... : null}.
  assert.match(REQUEST_FORM, /prioritiesEnabled \? \(/);
  assert.match(REQUEST_FORM, /name="priority"/);
  assert.match(REQUEST_FORM, /name="priorityReason"/);
});

test("smoke flow: RequestForm bouton submit affiche request.sending pendant l'envoi", () => {
  assert.match(REQUEST_FORM, /isPending \|\| isSubmittingRequest \? t\("request\.sending"\) : t\("request\.submit"\)/);
});

test("smoke flow: RequestForm bouton submit disabled si pending ou dispatchBlocked", () => {
  assert.match(
    REQUEST_FORM,
    /disabled=\{isPending \|\| isSubmittingRequest \|\| dispatchBlocked\}/,
  );
});

test("smoke flow: RequestForm bloque les inputs (pointer-events-none) quand dispatch est bloque", () => {
  assert.match(REQUEST_FORM, /dispatchBlocked \? " pointer-events-none opacity-50" : ""/);
});

test("smoke flow: RequestForm garde la persistence locale de la demande (savePassenger / clearPassenger)", () => {
  assert.match(REQUEST_FORM, /savePassengerPendingRequest\(project\.id,/);
  assert.match(REQUEST_FORM, /clearPassengerPendingRequest/);
});

test("smoke flow: RequestForm utilise startTransition pour la soumission async", () => {
  assert.match(REQUEST_FORM, /useTransition/);
  assert.match(REQUEST_FORM, /startTransition\(async \(\) =>/);
});

// ---------------------------------------------------------------------------
// Etats en attente / en cours / complete (statuts de RequestStatus)
// ---------------------------------------------------------------------------

test("smoke flow: RequestStatusCard mappe les 6 RequestStatus vers des cles i18n", () => {
  // statusKeys: pending, assigned, arriving, boarded, completed, cancelled.
  assert.match(STATUS_CARD, /pending: "status\.pending"/);
  assert.match(STATUS_CARD, /assigned: "status\.assigned"/);
  assert.match(STATUS_CARD, /arriving: "status\.arriving"/);
  assert.match(STATUS_CARD, /boarded: "status\.boarded"/);
  assert.match(STATUS_CARD, /completed: "status\.completed"/);
  assert.match(STATUS_CARD, /cancelled: "status\.cancelled"/);
});

test("smoke flow: RequestStatusCard affiche le statut courant via t(statusKeys[currentRequest.status])", () => {
  assert.match(STATUS_CARD, /t\(statusKeys\[currentRequest\.status\]\)/);
});

test("smoke flow: RequestStatusCard affiche le temps d'attente via formatWaitTime", () => {
  assert.match(STATUS_CARD, /formatWaitTime\(currentRequest\.wait_started_at\)/);
});

test("smoke flow: RequestStatusCard bouton Annuler n'apparait que si status === pending", () => {
  assert.match(STATUS_CARD, /canCancel = currentRequest\.status === "pending"/);
  assert.match(STATUS_CARD, /\{canCancel && \(/);
});

test("smoke flow: RequestStatusCard cancel appelle updateRequestStatus avec status=cancelled", () => {
  assert.match(STATUS_CARD, /updateRequestStatus\(currentRequest\.id, "cancelled"/);
});

test("smoke flow: RequestStatusCard cancel passe cancelRelatedSplit avec les coordonnees du voyage", () => {
  assert.match(STATUS_CARD, /cancelRelatedSplit:\s*\{/);
  assert.match(STATUS_CARD, /projectId: currentRequest\.project_id/);
  assert.match(STATUS_CARD, /fromFloorId: currentRequest\.from_floor_id/);
  assert.match(STATUS_CARD, /toFloorId: currentRequest\.to_floor_id/);
  assert.match(STATUS_CARD, /waitStartedAt: currentRequest\.wait_started_at/);
  assert.match(STATUS_CARD, /originalPassengerCount: currentRequest\.original_passenger_count/);
});

// ---------------------------------------------------------------------------
// Realtime / lien UI <-> dispatch
// ---------------------------------------------------------------------------

test("smoke flow: RequestStatusCard subscribe a requests filtre sur l'id de la demande", () => {
  assert.match(STATUS_CARD, /subscribeToTable<\{ new: HoistRequest \}>/);
  assert.match(STATUS_CARD, /table: "requests"/);
  assert.match(STATUS_CARD, /filter: `id=eq\.\$\{request\.id\}`/);
});

test("smoke flow: RequestStatusCard met a jour son etat local sur changement realtime", () => {
  assert.match(STATUS_CARD, /onChange: \(payload\) =>/);
  assert.match(STATUS_CARD, /setCurrentRequest\(payload\.new\)/);
});

test("smoke flow: RequestForm utilise analyzePassengerDispatch pour decider canDispatch", () => {
  assert.match(REQUEST_FORM, /analyzePassengerDispatch\(\{ elevators: liveElevators, timeZone: tz \}\)/);
  assert.match(REQUEST_FORM, /canDispatch: analysis\.canDispatch/);
});

test("smoke flow: RequestForm sync les ascenseurs en realtime (table elevators) + polling 2s", () => {
  assert.match(REQUEST_FORM, /subscribeToTable<ElevatorRealtimePayload>/);
  assert.match(REQUEST_FORM, /table: "elevators"/);
  assert.match(REQUEST_FORM, /filter: `project_id=eq\.\$\{project\.id\}`/);
  assert.match(REQUEST_FORM, /window\.setInterval\(syncElevators, 2_000\)/);
});

test("smoke flow: RequestForm capacity_enabled / priorities_enabled retombent a true par defaut", () => {
  assert.match(REQUEST_FORM, /project\.priorities_enabled !== false/);
  assert.match(REQUEST_FORM, /project\.capacity_enabled !== false/);
});

test("smoke flow: RequestForm message d'erreur affiche dans un encadre rouge (feedback visuel)", () => {
  // {message && (<div className="...border-red-200 bg-red-50...">{message}</div>)}
  assert.match(REQUEST_FORM, /\{message && \(/);
  assert.match(REQUEST_FORM, /border-red-200 bg-red-50/);
});

// ---------------------------------------------------------------------------
// Resume / persistence (recouvrement apres fermeture)
// ---------------------------------------------------------------------------

test("smoke flow: RequestForm passe par RPC client puis fallback server pour resume", () => {
  // fetchPassengerResumeSnapshot tente d'abord resumePassengerRequestClient (browser RPC),
  // puis fallback resumePassengerRequest (server action).
  assert.match(REQUEST_FORM, /resumePassengerRequestClient\(projectId, floorQrToken, requestId\)/);
  assert.match(REQUEST_FORM, /return resumePassengerRequest\(projectId, floorQrToken, requestId\)/);
});

test("smoke flow: RequestForm efface la persistence locale quand le statut est terminal ou boarded", () => {
  assert.match(REQUEST_FORM, /isTerminalPassengerRequestStatus/);
  assert.match(REQUEST_FORM, /clearsPassengerPendingStorage\(status: RequestStatus\)/);
  assert.match(REQUEST_FORM, /status === "completed" \|\| status === "cancelled"/);
});

test("smoke flow: RequestForm affiche un loader Resume tant que passengerResumeReady=false", () => {
  assert.match(REQUEST_FORM, /if \(!passengerResumeReady\)/);
  assert.match(REQUEST_FORM, /t\("request\.resumeLoading"\)/);
});

// ---------------------------------------------------------------------------
// Annulation depuis l'ecran "demande envoyee"
// ---------------------------------------------------------------------------

test("smoke flow: RequestForm cancelAndReset essaie cancelPassengerRequestClient avant le fallback updateRequestStatus", () => {
  assert.match(REQUEST_FORM, /cancelPassengerRequestClient\(/);
  assert.match(REQUEST_FORM, /updateRequestStatus\(submittedRequestId, "cancelled"/);
});

test("smoke flow: cancelPassengerRequestClient retourne ok=false si pas de session Supabase", () => {
  assert.match(CANCEL_CLIENT, /if \(!client\)/);
  assert.match(CANCEL_CLIENT, /return \{ ok: false \}/);
});

test("smoke flow: cancelPassengerRequestClient valide projectId et requestId comme UUID", () => {
  assert.match(CANCEL_CLIENT, /isUuid\(projectId\)/);
  assert.match(CANCEL_CLIENT, /isUuid\(requestId\)/);
});

test("smoke flow: cancelPassengerRequestClient appelle la RPC cancel_passenger_request", () => {
  assert.match(CANCEL_CLIENT, /\.rpc\("cancel_passenger_request"/);
});

test("smoke flow: resumePassengerRequestClient existe et expose une signature compatible", () => {
  // Au moins une fonction exportee qui prend projectId, floorQrToken, requestId.
  assert.match(RESUME_CLIENT, /export\s+(?:async\s+)?function\s+resumePassengerRequestClient/);
});

// ---------------------------------------------------------------------------
// Shell : invariants UI deja couverts dans passengerRequestUi.test.ts
// (BrandLogo, LanguageSwitcher, pas de lien scan). On verifie ici l'integration.
// ---------------------------------------------------------------------------

test("smoke flow: PassengerRequestShell rend RequestForm avec les 4 props critiques", () => {
  assert.match(SHELL, /<RequestForm/);
  assert.match(SHELL, /project=\{project\}/);
  assert.match(SHELL, /floors=\{floors\}/);
  assert.match(SHELL, /currentFloor=\{currentFloor\}/);
  assert.match(SHELL, /elevators=\{elevators\}/);
});

test("smoke flow: PassengerRequestShell est un client component", () => {
  assert.match(SHELL, /^"use client";/);
});

test("smoke flow: RequestForm est un client component (etats + hooks)", () => {
  assert.match(REQUEST_FORM, /^"use client";/);
});

test("smoke flow: RequestStatusCard est un client component (subscribe realtime + state)", () => {
  assert.match(STATUS_CARD, /^"use client";/);
});
