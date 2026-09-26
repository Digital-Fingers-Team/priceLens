import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './api-error';

const res = (status: number, error: Record<string, unknown>) => ({ response: { status, data: { error } } });

describe('getApiErrorMessage', () => {
  it('turns the rate limiter into user copy, not the framework message', () => {
    const msg = getApiErrorMessage(res(429, { code: 'RATE_LIMITED', message: 'ThrottlerException: Too Many Requests' }));
    expect(msg).toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('shows the API message for a wrong password and a taken e-mail', () => {
    expect(getApiErrorMessage(res(401, { code: 'UNAUTHORIZED', message: 'Invalid credentials' }))).toBe('Invalid credentials');
    expect(getApiErrorMessage(res(409, { code: 'CONFLICT', message: 'Email already registered' }))).toBe('Email already registered');
  });

  it('prefers validation details over the generic message', () => {
    expect(getApiErrorMessage(res(400, { message: 'Validation failed', details: ['email must be an email'] }))).toBe(
      'email must be an email',
    );
  });

  it('explains a network failure', () => {
    expect(getApiErrorMessage({ request: {} })).toMatch(/Cannot reach the server/);
  });
});
