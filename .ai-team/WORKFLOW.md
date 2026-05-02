# WORKFLOW.md — Cycle de travail PR par PR

## Principe

**Une tache = une branche = une PR = une validation humaine.**

L'IA ne continue **jamais** sans le go de l'humain.

## Etapes d'une mission

### 0. Prise de mission

L'humain ouvre un ticket / message decrivant :
- le bug ou l'amelioration,
- les zones a NE PAS toucher,
- le critere de succes (test, scenario, comportement attendu).

L'**Architecte** decide quel agent prend la PR.

### 1. Branche

Format : `<role>/<sujet-court-kebab>`

Exemples :
- `dispatch/up-cycle-skip-floor`
- `frontend/operator-capacity-flash`
- `qa/regression-pickup-priority`
- `perf/operator-realtime-throttle`
- `debug/passenger-resume-loop`
- `ai-team/<bootstrap-ou-meta>`

### 2. Test rouge AVANT le fix (pour bugs)

Le **QA / Testeur** ou l'agent responsable :
1. ajoute un test qui echoue,
2. commit `test: ...` (ce commit seul peut etre rouge en CI).

### 3. Fix minimal

L'agent owner :
1. ecrit le diff le plus petit qui rend le test vert,
2. respecte les regles d'`ELEVIO_RULES.md`.

### 4. Verifications locales

Avant push, l'agent execute :
```bash
npm run lint
npm run typecheck
npm run test
```

Tout doit etre vert.

### 5. Commit

Format conventionnel deja utilise dans le repo :
- `fix(brain): ...`
- `fix(operator): ...`
- `fix(dispatch): ...`
- `test(brain): ...`
- `feat(...)`: uniquement si demande explicitement
- `chore(...)`, `docs(...)`, `perf(...)`

### 6. PR

Titre = clair, ASCII, scope visible.

Template de description :
```
## Probleme
<phrase courte + scenario reproductible>

## Cause
<fichier + ligne + raison>

## Fix
<diff minimal explique>

## Tests
<noms de tests ajoutes / modifies>

## Risque & rollback
<zones touchees / git revert <sha>>
```

### 7. Reviewer IA

Le `Reviewer` (voir AGENTS.md) verifie la PR avant de la marquer "ready for human".

### 8. Validation humaine

L'humain :
- relit,
- demande des ajustements si besoin,
- merge ou demande revert.

### 9. Stop

Apres merge, **l'IA s'arrete**.
La mission suivante repart de l'etape 0.

## Regles dures

- **Pas de PR fourre-tout.** Une PR ne fait qu'une chose.
- **Pas de commit "WIP" public.** Les commits poussees sont propres.
- **Pas de force-push** sur une branche qui a deja une PR ouverte sans accord.
- **Pas de modification du `main`** en direct.
- **Pas de modif de `.env*`, secrets, cles, RLS** sans demande explicite et review.
