import { createHmac, timingSafeEqual } from 'node:crypto';

export function paymentSignature(secret: string, paymentId: string): string {
  return createHmac('sha256', secret).update(paymentId).digest('base64url');
}

export function paymentSignatureMatches(secret: string, paymentId: string, given: string): boolean {
  if (!secret || !paymentId || !given) return false;
  const expected = Buffer.from(paymentSignature(secret, paymentId));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
