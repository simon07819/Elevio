# PR_PLAN.md — Ordre des PR de stabilisation Elevio

Document **propose** par l'IA. Rien n'est execute avant validation humaine.

L'idee : commencer par le filet de securite (tests + observabilite), puis attaquer
les zones a risque dans l'ordre du plus critique au plus cosmetique.

## Phase 0 — Bootstrap (cette PR)

- **PR 0** : `ai-team/bootstrap-elevio`
  - Ajoute uniquement `.ai-team/` (cette doc).
  - Aucun changement de code, de config, de schema.
  - **C'est cette PR.**

> Apres merge : reprise au PR 1 sur instruction humaine.

## Phase 1 — Filet de securite (avant tout fix)

But : pouvoir corriger sans casser.

- **PR 1** : `qa/baseline-dispatch-tests`
  - Audit de la couverture actuelle de `tests/elevatorBrain.test.ts`.
  - Ajout de scenarios manquants (cycle UP, cycle DOWN, capacite, manual_full,
    priorities_enabled off, multi-elevator).
  - Aucune modification de code metier.

- **PR 2** : `qa/passenger-flow-smoke-tests`
  - Tests legers sur le flow passager (composants `RequestForm`, `RequestStatusCard`).
  - Pas de refactor.

- **PR 3** : `qa/operator-cockpit-render-tests`
  - Tests de rendu non destructifs sur `OperatorWorkspace` /
    `OperatorDashboard` / `RecommendedNextStop` (snapshot leger ou tests
    d'invariants).

## Phase 2 — Bugs dispatch (logique up / down / capacite / cycle)

Ordre : du plus impactant au plus subtil. Chaque PR = un seul bug.

- **PR 4** : `dispatch/<bug-1>` — premier bug remonte par l'humain.
- **PR 5** : `dispatch/<bug-2>` — second bug remonte.
- **PR 6** : `dispatch/<bug-3>` — etc.

> Les noms exacts seront fixes apres triage avec l'humain.
> Chaque PR : test rouge -> fix -> test vert.

## Phase 3 — UI operateur (sans toucher a l'UX)

- **PR 7** : `frontend/operator-state-flash-fix`
  - Corrige les flashs d'etat / re-renders visibles.
  - Aucune suppression d'animation.

- **PR 8** : `frontend/operator-capacity-badge-sync`
  - Synchronisation visuelle de la capacite avec le vrai etat.

- **PR 9** : `frontend/operator-realtime-resilience`
  - Affichage clair quand realtime tombe / reprend.

## Phase 4 — Flow passager (defensif)

- **PR 10** : `frontend/passenger-resume-edge-cases`
  - Recouvrement de demande apres fermeture.
- **PR 11** : `frontend/passenger-cancel-policy`
  - Bord cas annulation.

## Phase 5 — Performance

- **PR 12** : `perf/realtime-subscription-dedup`
- **PR 13** : `perf/operator-render-memoization`
- **PR 14** : `perf/actions-batching`

> Chaque PR perf doit prouver le gain (avant / apres) et **ne rien changer visuellement**.

## Phase 6 — Hygiene (optionnel, jamais prioritaire)

- **PR 15+** : nettoyage cible (un fichier a la fois, jamais de refactor de masse).

---

## Regles globales sur ce plan

- L'ordre peut changer si l'humain priorise un bug bloquant.
- Une PR ne sera lancee qu'apres merge de la precedente.
- Si une PR depasse ~300 lignes de diff, elle est decoupee.
- Toute PR perf ou refactor qui modifie un comportement visible est rejetee.
