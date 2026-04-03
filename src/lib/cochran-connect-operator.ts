/** Client-safe: Cochran Connect operator identity (Settings tab visibility, no Firebase Admin). */

export const COCHRAN_CONNECT_OPERATOR_EMAIL = "info@cochranfilms.com";

export function isCochranConnectOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === COCHRAN_CONNECT_OPERATOR_EMAIL;
}
