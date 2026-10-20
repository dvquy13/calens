import { describe, it, expect } from 'vitest';
import { googleErrorReason } from './error-utils';

describe('googleErrorReason', () => {
  it('returns the short reason from a Google error body, not the body', () => {
    const body = JSON.stringify({
      error: {
        code: 404,
        message: 'Not Found: calendar someone@gmail.com',
        errors: [{ domain: 'calendar', reason: 'notFound', message: 'Not Found' }],
      },
    });
    expect(googleErrorReason(body)).toBe('notFound');
  });

  it('falls back to the status name, then to unknown', () => {
    expect(googleErrorReason(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }))).toBe('UNAUTHENTICATED');
    expect(googleErrorReason('{}')).toBe('unknown');
  });

  it('does not echo a non-JSON body', () => {
    expect(googleErrorReason('<html>Bearer ya29.secret</html>')).toBe('unparseable body');
  });
});
