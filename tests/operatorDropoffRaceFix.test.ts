/**
 * Regression test for the completedDropoffIds race condition in RecommendedNextStop.
 *
 * Bug: after a successful dropoff, the request ID was added to completedDropoffIds
 * and never removed. If a realtime race condition brought the request back to
 * "boarded" (recommendation.requestsToDropoff includes it again), pendingDropoffs
 * filtered it out and the operator could never drop it off again — the button
 * disappeared permanently.
 *
 * Fix: a useEffect clears stale entries from completedDropoffIds whenever the
 * brain's requestsToDropoff includes an ID we previously marked completed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const RECOMMENDED = readFileSync(join(root, "components/operator/RecommendedNextStop.tsx"), "utf8");

test("dropoff race fix: effectiveCompletedDropoffIds exclut les IDs qui reaparaissent dans requestsToDropoff", () => {
  // Le useMemo doit : (1) mapper les IDs actifs de requestsToDropoff,
  // (2) garder uniquement les completedDropoffIds qui ne sont PAS dans les actifs,
  // (3) ainsi pendingDropoffs n'exclura plus les requetes que le brain veut encore deposer.
  assert.match(
    RECOMMENDED,
    /const activeDropIds = new Set\(recommendation\.requestsToDropoff\.map\(\(p\) => p\.requestId\)\)/,
  );
  assert.match(
    RECOMMENDED,
    /for \(const id of completedDropoffIds\) \{[\s\S]*?if \(!activeDropIds\.has\(id\)\) \{[\s\S]*?next\.add\(id\)/,
  );
  assert.match(
    RECOMMENDED,
    /\}, \[recommendation\.requestsToDropoff, completedDropoffIds\]\)/,
  );
});

test("dropoff race fix: pendingDropoffs utilise effectiveCompletedDropoffIds (pas completedDropoffIds direct)", () => {
  assert.match(
    RECOMMENDED,
    /recommendation\.requestsToDropoff\.filter\(\(p\) => !effectiveCompletedDropoffIds\.has\(p\.requestId\)\)/,
  );
});

test("dropoff race fix: pendingDropoffs filtre via effectiveCompletedDropoffIds qui derive de completedDropoffIds", () => {
  // Le coeur du fix : effectiveCompletedDropoffIds est un sous-ensemble de completedDropoffIds
  // qui exclut les IDs que le brain veut encore deposer. pendingDropoffs utilise
  // effectiveCompletedDropoffIds au lieu de completedDropoffIds directement.
  assert.match(
    RECOMMENDED,
    /const effectiveCompletedDropoffIds = useMemo\(\(\) => \{[\s\S]*?completedDropoffIds[\s\S]*?\}, \[recommendation\.requestsToDropoff, completedDropoffIds\]\)/,
  );
  assert.match(
    RECOMMENDED,
    /recommendation\.requestsToDropoff\.filter\(\(p\) => !effectiveCompletedDropoffIds\.has\(p\.requestId\)\)/,
  );
});
