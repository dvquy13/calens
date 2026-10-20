import * as logger from "firebase-functions/logger";

export interface GoogleTokenInfo {
  email?: string;
  email_verified?: boolean | string;
  [key: string]: unknown;
}

export type FetchLike = typeof fetch;

/**
 * Verifies a Google OAuth access token via Google's tokeninfo endpoint.
 * Throws if the token is rejected or the lookup fails.
 * @param {string} idToken The OAuth access token sent by the extension.
 * @param {FetchLike} fetchImpl Injectable fetch (defaults to global fetch).
 * @return {Promise<GoogleTokenInfo>} The decoded token info.
 */
export async function verifyGoogleToken(
  idToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenInfo> {
  const response = await fetchImpl(
    "https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" +
    encodeURIComponent(idToken),
  );
  if (!response.ok) {
    logger.error("Token verification failed:", await response.text());
    throw new Error("Invalid token");
  }
  return await response.json() as GoogleTokenInfo;
}

/**
 * Whether tokeninfo reports the email as verified (bool or "true" string).
 * @param {GoogleTokenInfo} info Token info.
 * @return {boolean} True when verified.
 */
export function isEmailVerified(info: GoogleTokenInfo): boolean {
  return info.email_verified === true || info.email_verified === "true";
}
