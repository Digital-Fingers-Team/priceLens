import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/** Header carrying the request id in both directions. */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** What a client-supplied id may look like; anything else is replaced (it is written to logs). */
const CLIENT_ID_PATTERN = /^[\w.-]{1,64}$/;

export type RequestWithId = Request & { requestId?: string };

/**
 * Gives every request one id, before any guard, pipe or handler runs (B-06).
 * The access log, the error envelope and the X-Request-ID response header all
 * read it from here, so a user-reported id always finds its log lines.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const supplied = req.headers['x-request-id'];
  const requestId = typeof supplied === 'string' && CLIENT_ID_PATTERN.test(supplied) ? supplied : uuidv4();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

/** The id assigned by requestIdMiddleware (a fresh one if it did not run, e.g. in unit tests). */
export function requestIdOf(req: RequestWithId): string {
  return req.requestId ?? uuidv4();
}
