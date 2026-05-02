# TEST_STRATEGY.md — Strategie de tests

## Outils en place

Defini dans `package.json` :

```bash
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test       # tsc -p tsconfig.test.json && node --test .test-build/tests/*.test.js
```

Les tests existent deja sous `tests/` :
- `tests/elevatorBrain.test.ts` (~33 ko, scenarios dispatch)
- `tests/passengerRequestUi.test.ts`

## Pyramide de tests pour Elevio

### 1. Tests unitaires deterministes (priorite max)

Cible : `services/elevatorBrain.ts`, `services/dispatchEngine.ts`,
`services/multiElevatorDispatch.ts`, `lib/elevatorRouting.ts`,
`lib/recommendationReason.ts`.

Format : entree fixture + sortie attendue.

Couvrir au minimum :
- Cycle UP : pickup en cours de route, dropoff au chemin, sequence chantier.
- Cycle DOWN : SCAN nearest-in-direction, dropoff au passage.
- Idle : choix de la prochaine demande au repos.
- Capacite :
  - capacite atteinte -> warning, pas de blocage d'insertion,
  - `manual_full = true` -> comportement attendu,
  - `capacityEnabled = false`.
- Priorities :
  - `prioritiesEnabled = true` -> priorite respectee,
  - `prioritiesEnabled = false` -> on ignore le flag priorite.
- Split entre plusieurs ascenseurs (`multiElevatorDispatch`).
- Tie-break (egalite de score).

### 2. Tests de regression (chaque bug -> un test)

Regle : tout bug corrige doit avoir un test qui :
- echoue **avant** le fix,
- passe **apres** le fix,
- documente le bug en commentaire ou nom de test (ex: `regression: pickup ignore sequence_number`).

### 3. Tests UI legers

Cible : composants critiques cote operateur et passager.

On evite les tests de pixel ; on prefere :
- snapshot leger sur la **structure** des cles d'etat,
- assertions sur la presence des elements clefs (boutons gants, badges capacite,
  bouton priorite, status cabine).

Pas de framework lourd ajoute sans accord humain.

### 4. Tests end-to-end (hors scope par defaut)

Pas dans cette phase. Si demande, on ajoutera Playwright dans une PR dediee.

## Obligations

- Avant chaque PR fix : `npm run test` vert.
- Avant chaque PR perf : test de non-regression sur les invariants visuels +
  mention du gain mesure (re-render count, timing, payload realtime).
- Avant chaque PR dispatch : ajouter / mettre a jour `tests/elevatorBrain.test.ts`.

## Anti-patterns interdits

- Tests qui dependent de l'horloge reelle. Utiliser des timestamps fixes.
- Tests qui dependent du reseau ou de Supabase. Mocker les inputs.
- Tests "tout-vert" sans assertion utile.
- Tests qui changent uniquement la sortie attendue pour "rendre vert" sans
  comprendre la regression.
