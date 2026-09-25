# 0002. Shared API contracts live in a declaration-only package

Date: 2026-09-25 · Status: Accepted · Phase 01

## Context

The API and the web app typed the same responses by hand (envelope, error shape, pagination, price responses), and the copies had started to drift. `packages/*` was declared in the workspace but empty.

A normal TypeScript package (`.ts` sources) doesn't fit this repo's build:
- the API compiles with `nest build` (plain `tsc`, CommonJS). A `.ts` file imported from outside `apps/api` becomes part of the program and moves the emitted entry point from `dist/src/main.js` to a deeper path, breaking `start`, the Dockerfile and the deploy script;
- a compiled package (`dist/` + build step) needs building before every typecheck, test and image build, in the right order, in both Dockerfiles.

## Decision

`packages/contracts` (`@pricelens/contracts`) contains `.d.ts` files only. Both apps depend on it (`workspace:*`) and import it with `import type`.

- Declaration files are never emitted, so the API's output layout is unchanged, and there is nothing to build.
- Type imports are erased, so the package has no runtime presence in either app.
- The apps compile with `skipLibCheck`, which skips errors *inside* `.d.ts` files. The package therefore has its own `typecheck` script (`tsc`, `skipLibCheck: false`), run by `turbo typecheck`.
- Both Dockerfiles copy `packages/contracts` before their filtered install. The API runtime stage keeps it, because the unit tests run inside the image (`deploy-api.sh`) and type-check against it.

## Consequences

- Only types can be shared, not values (no runtime enums or zod schemas). Error codes are a string-literal union. If runtime sharing is ever needed (e.g. zod schemas used by both apps), this becomes a compiled package with a build step, and this record is superseded.
- The first contents are the envelope, error codes, pagination and the two price responses. Other response types move in as the phases that own those endpoints touch them.
