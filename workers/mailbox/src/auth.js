// Firebase ID tokens are signed JWTs. Never trust a decoded email without verifying it.
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cachedKeys;
let expiresAt = 0;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function decode64(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
export async function verifyAdmin(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!token || token.length > 10000) throw new ApiError(401, 'Login admin diperlukan.');
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const header = JSON.parse(new TextDecoder().decode(decode64(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode64(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || !header.kid || claims.aud !== env.FIREBASE_PROJECT_ID ||
        claims.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        !Number.isFinite(claims.iat) || claims.iat > now ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now) throw new Error('Invalid claims');
    if (!cachedKeys || Date.now() >= expiresAt) {
      const response = await fetch(JWKS_URL);
      if (!response.ok) throw new ApiError(503, 'Verifikasi login sementara tidak tersedia.');
      cachedKeys = (await response.json()).keys;
      const seconds = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300);
      expiresAt = Date.now() + Math.min(seconds, 3600) * 1000;
    }
    const jwk = cachedKeys.find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) { expiresAt = 0; throw new Error('Unknown signing key'); }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) throw new Error('Bad signature');
    if (claims.email !== env.ADMIN_EMAIL || (env.ADMIN_UID && claims.sub !== env.ADMIN_UID)) {
      throw new ApiError(403, 'Akun ini tidak memiliki akses mailbox.');
    }
    return claims;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Sesi tidak valid atau kedaluwarsa. Login ulang.');
  }
}
