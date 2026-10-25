/**
 * Behavior of the Redmine → Hocuspocus authentication handshake.
 *
 * Redmine signs `<base64url(payload)>.<base64url(hmac-sha256)>`; these tests
 * play the Redmine side and assert what the server does with such a token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authenticate, verifyToken } = require('../../hocuspocus/auth.js');

const SECRET = 'a-shared-secret-only-redmine-and-hocuspocus-know';
const DOCUMENT = 'wiki-1-2-content_text';
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const NOW_IN_SECONDS = Math.floor(NOW / 1000);

function signedToken(payload, secret = SECRET) {
  const payloadJson = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(payloadJson).digest();

  return [
    Buffer.from(payloadJson).toString('base64url'),
    signature.toString('base64url')
  ].join('.');
}

function validPayload(overrides = {}) {
  return { uid: 42, login: 'alice', doc: DOCUMENT, exp: NOW_IN_SECONDS + 600, ...overrides };
}

function authenticateAt(token, options = {}) {
  return authenticate({ token, secret: SECRET, documentName: DOCUMENT, now: NOW, ...options });
}

describe('authenticate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a token signed for this document and identifies its user', () => {
    const user = authenticateAt(signedToken(validPayload()));

    expect(user).toEqual({ id: '42', name: 'alice' });
  });

  it('rejects a token signed for a different document', () => {
    const token = signedToken(validPayload({ doc: 'issue-7' }));

    expect(() => authenticateAt(token)).toThrow('Unauthorized');
  });

  it('rejects an expired token', () => {
    const token = signedToken(validPayload({ exp: NOW_IN_SECONDS - 1 }));

    expect(() => authenticateAt(token)).toThrow('Unauthorized');
  });

  it('rejects a token signed with another secret', () => {
    const token = signedToken(validPayload(), 'some-other-secret');

    expect(() => authenticateAt(token)).toThrow('Unauthorized');
  });

  it('rejects a payload changed after signing', () => {
    const [, signatureB64] = signedToken(validPayload()).split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify(validPayload({ login: 'mallory' }))
    ).toString('base64url');

    expect(() => authenticateAt(`${tamperedPayload}.${signatureB64}`)).toThrow('Unauthorized');
  });

  it('fails closed when a secret is configured but the client sends an unsigned token', () => {
    const unsigned = JSON.stringify({ id: '1', name: 'alice' });

    expect(() => authenticateAt(unsigned)).toThrow('Unauthorized');
  });

  it('fails closed when a secret is configured and no token is sent at all', () => {
    expect(() => authenticateAt(undefined)).toThrow('Unauthorized');
  });

  it('trusts the client token in development mode when no secret is configured', () => {
    const user = authenticateAt(JSON.stringify({ id: '7', name: 'dev' }), { secret: '' });

    expect(user).toEqual({ id: '7', name: 'dev' });
  });
});

describe('verifyToken', () => {
  it('reports why a token signed for another document is refused', () => {
    const result = verifyToken(signedToken(validPayload({ doc: 'issue-7' })), {
      secret: SECRET,
      documentName: DOCUMENT,
      now: NOW
    });

    expect(result).toEqual({ ok: false, reason: 'document_mismatch' });
  });

  it('reports a missing signature', () => {
    const result = verifyToken('only-a-payload', { secret: SECRET, documentName: DOCUMENT, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'token_malformed' });
  });

  it('reports a signature that does not match the payload', () => {
    const forged = signedToken(validPayload(), 'another-secret');
    const result = verifyToken(forged, { secret: SECRET, documentName: DOCUMENT, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('reports a token without a user id', () => {
    const token = signedToken({ doc: DOCUMENT, exp: NOW_IN_SECONDS + 600 });
    const result = verifyToken(token, { secret: SECRET, documentName: DOCUMENT, now: NOW });

    expect(result).toEqual({ ok: false, reason: 'token_without_user' });
  });
});
