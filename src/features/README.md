# Feature Architecture Bootstrap

This folder is a phase-1/2 bootstrap for the feature-based architecture.

Current status:
- `src/app/*` pages no longer import `@/lib/firestore` directly.
- Application gateways exist under `src/features/*/application`.
- Core Gantt utility logic has been moved into `src/features/gantt/domain/*`.
- `src/components/charts/gantt/utils.ts` is now a compatibility re-export layer.
- Canonical architecture choice: `feature-based`. Legacy `src/components/*` paths remain temporary compatibility bridges.

Next migration sequence:
1. Move Gantt presentation imports from legacy `src/components/charts/gantt/*` to `src/features/gantt/presentation/*` in all consumers.
2. Move S-Curve data shaping logic fully into `src/features/scurve/domain/*` (non-hook pure functions first).
3. Introduce typed repository interfaces in `src/features/*/infrastructure` and reduce direct Firestore surface.
4. Remove compatibility bridges after all consumers are updated.
