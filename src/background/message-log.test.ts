import { describe, it, expect } from 'vitest';
import { describeMessage } from './message-log';

describe('describeMessage', () => {
  it('logs only the message type, never the token or email in the payload', () => {
    const message = {
      type: 'GET_DIAGNOSTICS_REPORT',
      userEmail: 'someone@gmail.com',
      idToken: 'ya29.a0AfB_secret_token_value',
      accessToken: 'ya29.another_secret_value',
    };
    const logged = describeMessage(message);
    expect(logged).toBe('GET_DIAGNOSTICS_REPORT');
    expect(logged).not.toContain('ya29');
    expect(logged).not.toContain('someone@gmail.com');
  });

  it('falls back to the value type for messages without a type', () => {
    expect(describeMessage(undefined)).toBe('undefined');
    expect(describeMessage({ foo: 1 })).toBe('object');
  });
});
