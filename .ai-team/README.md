# .ai-team/ — Equipe IA pour Elevio

Ce dossier definit la facon dont les agents IA (Factory Droid + roles inspires d'agency-agents)
travaillent sur le repo Elevio.

## Objectif

Reparer, stabiliser et optimiser Elevio **sans le reecrire**.

Elevio est une PWA de gestion d'ascenseur / hoist de chantier :
- passagers : QR -> demande
- operateur : cockpit temps reel + recommandation
- moteur de dispatch : `services/elevatorBrain.ts` + `services/dispatchEngine.ts`
- temps reel : Supabase

## Comment cette equipe IA travaille

1. Toute mission est decomposee en **petites PR** (une tache = une PR).
2. Chaque PR :
   - branche dediee
   - changements minimaux
   - tests de non-regression quand pertinent
   - description claire (probleme, fix, risque, rollback)
3. **Aucun merge automatique.** L'humain valide chaque PR.
4. **Aucune fonctionnalite ne disparait** sans demande explicite.
5. **Aucun refactor de masse** : on touche le minimum pour resoudre le bug ou l'optim.

## Documents de cette equipe

- `AGENTS.md` : roles et responsabilites de chaque agent IA.
- `WORKFLOW.md` : cycle de travail PR par PR.
- `PR_PLAN.md` : ordre des PR de stabilisation proposees.
- `ELEVIO_RULES.md` : regles produit absolues a ne jamais violer.
- `TEST_STRATEGY.md` : strategie de tests de non-regression.

## Resume rapide (TL;DR pour l'humain)

- L'IA n'a pas le droit de "tout refaire propre".
- L'IA n'a pas le droit de simplifier l'UI operateur.
- L'IA doit ouvrir une PR par bug, attendre validation, puis continuer.
- L'IA doit prouver chaque correction par un test ou une simulation.
