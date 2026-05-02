# ELEVIO_RULES.md — Regles produit absolues

Ces regles sont **non negociables** sans demande explicite et ecrite de l'humain.

## Regles produit

1. **Ne jamais reecrire l'app complete.**
2. **Ne jamais supprimer une fonctionnalite existante.**
   - Si une fonctionnalite semble "morte", on la documente dans la PR
     mais on ne la retire pas.
3. **Ne jamais simplifier l'interface operateur.**
   - Le cockpit doit rester dense, gants-friendly, lisible a distance.
   - Boutons gros, contrastes forts, info importante visible sans scroll.
4. **Ne jamais retirer les animations.**
   - Transitions de cabine, badges qui pulsent, etats anims = signal metier.
5. **Ne jamais changer le flow passager** si la mission ne le demande pas.
   - QR -> selection etage destination -> confirmation -> attente -> embarquement.

## Regles de dispatch

6. La **capacite** ne bloque jamais l'**insertion** d'une demande.
   - Elle sert au scoring, badges, alertes operateur.
7. Le **scoring** garde tous ses facteurs : priorite, attente, meme direction,
   sur le chemin, capacite, split, detour, equite.
8. Toute regle modifiee dans `services/elevatorBrain.ts` doit etre documentee
   dans la PR avec un scenario avant / apres.

## Regles techniques

9. Une **PR = une tache**. Pas de fourre-tout.
10. Une **branche = une PR**. Pas de reuse de branche apres merge.
11. **Pas de merge automatique.** Validation humaine obligatoire.
12. **Pas de modification du `main`** en direct.
13. **Pas de force-push** sur une PR ouverte sans accord.
14. **Pas de modification de schema Supabase** sans script idempotent dans
    `supabase/*.sql` et instruction de migration documentee dans la PR.
15. **Pas de modification des RLS, RPC, ou auth** sans tag explicite
    `security: requires-human-review` dans la PR.
16. **Pas de modification de `.env*`, cles, secrets.**

## Regles de qualite

17. Avant push : `npm run lint`, `npm run typecheck`, `npm run test` doivent passer.
18. Tout fix de bug metier doit etre couvert par un test (idealement rouge avant fix).
19. Tout commit suit le style du repo : `fix(scope): ...`, `test(scope): ...`,
    `feat(scope): ...`, `perf(scope): ...`, `chore(scope): ...`, `revert: ...`.
20. Pas de commentaires inutiles dans le code (le code est self-documenting,
    on commente uniquement ce qui n'est pas evident).

## Regles d'humilite IA

21. Si l'IA n'est pas sure -> elle pose une question dans la PR au lieu de deviner.
22. Si une mission demande de violer une de ces regles -> l'IA refuse poliment
    et demande confirmation explicite.
23. Si l'IA detecte un bug ou une faille hors scope -> elle l'**ecrit** dans la
    section "Hors scope detecte" de la PR mais ne le **corrige pas** dans cette PR.
