/**
 * Console summary for an incoming runtime message. Only the message type is
 * logged: payloads can carry tokens (`idToken`, `accessToken`) or
 * user data, so they are never printed.
 */
export function describeMessage(message: unknown): string {
  if (message && typeof message === 'object' && 'type' in message) {
    return String((message as { type: unknown }).type);
  }
  return typeof message;
}
