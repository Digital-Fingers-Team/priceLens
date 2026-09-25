# 0005. One error envelope for every failure; domain errors carry codes

Date: 2026-09-25 · Status: Accepted · Phase 01

## Context

Two exception filters covered `HttpException` and two Prisma error types. Anything else fell through to Nest's default handler with a different shape (`{ statusCode, message }`): a rejected CORS origin came back as that 500. The HTTP filter also replaced every exception's own code with one derived from the status, so `UpgradeRequiredException` (built to carry `UPGRADE_REQUIRED` plus the feature and plan a paywall needs) reached the client as a bare `FORBIDDEN`.

## Decision

- One filter, `ApiExceptionFilter`, catches everything and writes `{ success: false, error: { code, message, details?, requestId, timestamp, path } }`. The shape and the code list (`ApiErrorCode`) are in `@pricelens/contracts`.
- An exception's own `code` wins over the status mapping, and its extra fields become `details`.
- Validation errors: `message` "Validation failed", `details` the list of messages.
- Unknown errors: 500 `INTERNAL_ERROR`, "Internal server error"; details only in the log.
- New domain errors extend `AppException(status, code, message, details)`. Codes are never renamed; new ones are added to the union.

## Consequences

- The web can branch on `error.code` (e.g. show an upgrade prompt on `UPGRADE_REQUIRED`) instead of parsing messages. Using it in the UI is phase 05/06 work.
- A rejected CORS origin is now a 403 `CORS_ORIGIN_NOT_ALLOWED` instead of a 500.
