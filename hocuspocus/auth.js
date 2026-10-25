'use strict';

/**
 * Authentication for the Redmine ↔ Hocuspocus channel.
 *
 * Redmine signs a compact `<base64url(payload)>.<base64url(hmac)>` token per
 * user and per document. When `YJS_TOKEN_SECRET` is configured that token is
 * the only way in: anything else is rejected (fail closed). Without a secret
 * the server runs in development mode and trusts whatever the client sends.
 */

const crypto = require('crypto');

const SIGNATURE_ALGORITHM = 'sha256';

function sign(payloadJson, secret) {
  return crypto.createHmac(SIGNATURE_ALGORITHM, secret).update(payloadJson).digest();
}

function isSignatureValid(signature, payloadJson, secret) {
  const expected = sign(payloadJson, secret);

  return (
    signature.length === expected.length &&
    crypto.timingSafeEqual(signature, expected)
  );
}

function splitToken(token) {
  const [payloadB64, signatureB64] = String(token).split('.');

  if (!payloadB64 || !signatureB64) {
    return null;
  }

  return {
    payloadJson: Buffer.from(payloadB64, 'base64url').toString('utf8'),
    signature: Buffer.from(signatureB64, 'base64url'),
  };
}

function parsePayload(payloadJson) {
  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    return null;
  }
}

function payloadProblem(payload, { documentName, now }) {
  const notExpired = Number.isFinite(payload.exp) && payload.exp >= Math.floor(now / 1000);

  if (!notExpired) return 'token_expired';
  if (!payload.uid) return 'token_without_user';
  if (payload.doc !== documentName) return 'document_mismatch';

  return null;
}

/**
 * Verify a signed token against the secret and the document being opened.
 *
 * @returns {{ok: true, payload: object} | {ok: false, reason: string}}
 */
function verifyToken(token, { secret, documentName, now = Date.now() }) {
  const split = splitToken(token);

  if (!split) return { ok: false, reason: 'token_malformed' };
  if (!isSignatureValid(split.signature, split.payloadJson, secret)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  const payload = parsePayload(split.payloadJson);

  if (!payload) return { ok: false, reason: 'payload_not_json' };

  const problem = payloadProblem(payload, { documentName, now });

  return problem ? { ok: false, reason: problem } : { ok: true, payload };
}

/**
 * Development fallback: trust the client-supplied JSON token as-is.
 */
function developmentUser(token) {
  if (!token) return { id: 'anonymous', name: 'Anonymous' };

  try {
    const parsed = JSON.parse(token);
    return { id: parsed.id || 'anonymous', name: parsed.name || parsed.id || 'Anonymous' };
  } catch (error) {
    return { id: token, name: token };
  }
}

/**
 * Resolve the user that owns this connection.
 *
 * @throws {Error} 'Unauthorized' when a secret is configured and the token is
 *   missing, expired, signed for another document, or not signed at all.
 */
function authenticate({ token, secret, documentName, now = Date.now() }) {
  if (!secret) {
    console.warn(
      '[Hocuspocus] ⚠️  YJS_TOKEN_SECRET is not set – development authentication only, do not use in production.'
    );
    return developmentUser(token);
  }

  const result = verifyToken(token, { secret, documentName, now });

  if (!result.ok) {
    console.warn(`[Hocuspocus] ❌ Rejected connection to "${documentName}": ${result.reason}`);
    throw new Error('Unauthorized');
  }

  const { payload } = result;

  return { id: String(payload.uid), name: payload.login || String(payload.uid) };
}

module.exports = { authenticate, verifyToken };
