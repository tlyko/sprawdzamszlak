// Tests for CF Access JWT verification (top-10 #4 from
// docs/audit-2026-05-05-night.md — single defense-in-depth gate, refactor
// bug = silent admin bypass; until this file existed there were zero
// guardrails against an accidental break).
//
// Strategy:
//   - Generate a real RSA keypair in beforeAll. Sign tokens with the
//     private key, expose the public key via a mocked createRemoteJWKSet
//     (jose's verifier accepts a function returning a key/JWK).
//   - Mock the SSM client so each test controls what loadConfig sees.
//   - Reset module state between tests so the in-module
//     cachedConfig/cachedJwks don't leak across cases.

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from 'jose';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// `aud` strings shorter than 32 chars are rejected at config load. Real
// CF Access AUD tags are 64 hex chars; pad ours to 32 to satisfy the
// shape check while staying obviously synthetic.
const TEAM_DOMAIN = 'test-team.cloudflareaccess.com';
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUDIENCE = 'a'.repeat(64);
const OWNER_EMAIL = 'owner@example.com';

let privateKey: KeyLike;
let publicJwk: JWK;

beforeAll(async () => {
  // jose's RSA-PSS works for RS256 because the algorithm picks the right
  // signing scheme based on the JWT's `alg` header.
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
});

// ssmSendMock is mutated per-test before requireAdmin is imported, so
// vi.mock's factory closes over the live reference.
const ssmSendMock = vi.fn();

vi.mock('../clients.js', () => ({
  ssm: { send: (...args: unknown[]) => ssmSendMock(...args) },
}));

// Mock createRemoteJWKSet so it never hits the network. Returns a
// resolver function over the test public key.
vi.mock('jose', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('jose');
  return {
    ...actual,
    createRemoteJWKSet: () => async () => actual.importJWK(publicJwk, 'RS256'),
  };
});

interface SsmParam {
  Name: string;
  Value: string;
}

function mockSsmGetParameters(params: SsmParam[]): void {
  ssmSendMock.mockResolvedValue({ Parameters: params });
}

const DEFAULT_SSM_PARAMS: SsmParam[] = [
  { Name: '/sprawdzamszlak/cf-access/team_domain', Value: TEAM_DOMAIN },
  { Name: '/sprawdzamszlak/cf-access/aud', Value: AUDIENCE },
  { Name: '/sprawdzamszlak/admin/owner_email', Value: OWNER_EMAIL },
];

interface SignOpts {
  email?: string;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  signingKey?: KeyLike;
}

async function signJwt(opts: SignOpts = {}): Promise<string> {
  return new SignJWT({ email: opts.email ?? OWNER_EMAIL })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(opts.signingKey ?? privateKey);
}

function makeEvent(jwt: string | undefined): APIGatewayProxyEventV2 {
  // Minimal v2 event — only the headers field matters for requireAdmin.
  return {
    headers: jwt === undefined ? {} : { 'cf-access-jwt-assertion': jwt },
  } as unknown as APIGatewayProxyEventV2;
}

// Re-import the module under test fresh for each case so the
// module-level cachedConfig/cachedJwks don't bleed between tests.
async function loadModule() {
  vi.resetModules();
  return import('./cf-access.js');
}

beforeEach(() => {
  ssmSendMock.mockReset();
  mockSsmGetParameters(DEFAULT_SSM_PARAMS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('requireAdmin — happy path', () => {
  it('returns identity when JWT is valid and email matches owner', async () => {
    const { requireAdmin } = await loadModule();
    const jwt = await signJwt();
    await expect(requireAdmin(makeEvent(jwt))).resolves.toEqual({
      email: OWNER_EMAIL,
    });
  });

  it('accepts the header in capitalised form too (defensive)', async () => {
    const { requireAdmin } = await loadModule();
    const jwt = await signJwt();
    const event = {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    } as unknown as APIGatewayProxyEventV2;
    await expect(requireAdmin(event)).resolves.toEqual({ email: OWNER_EMAIL });
  });

  it('matches owner email case-insensitively', async () => {
    const { requireAdmin } = await loadModule();
    const jwt = await signJwt({ email: OWNER_EMAIL.toUpperCase() });
    await expect(requireAdmin(makeEvent(jwt))).resolves.toEqual({
      email: OWNER_EMAIL.toUpperCase(),
    });
  });
});

describe('requireAdmin — UnauthorizedError', () => {
  it('throws when the header is missing entirely', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    await expect(requireAdmin(makeEvent(undefined))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws when the header is empty', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    const event = {
      headers: { 'cf-access-jwt-assertion': '' },
    } as unknown as APIGatewayProxyEventV2;
    await expect(requireAdmin(event)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws on a JWT signed by a different key', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    const otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwt = await signJwt({ signingKey: otherKey });
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws on a JWT with wrong audience', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    const jwt = await signJwt({ audience: 'b'.repeat(64) });
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws on a JWT with wrong issuer', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    const jwt = await signJwt({
      issuer: 'https://attacker.cloudflareaccess.com',
    });
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws on an expired JWT', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    // jose accepts negative durations to backdate `exp` (e.g. "-1s").
    const jwt = await signJwt({ expiresIn: '-1s' });
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws when the email claim is not the owner email', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    const jwt = await signJwt({ email: 'attacker@example.com' });
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('throws when the email claim is missing entirely', async () => {
    const { requireAdmin, UnauthorizedError } = await loadModule();
    // SignJWT with no payload field — the default for our wrapper is
    // OWNER_EMAIL, but we can pass an empty string to trigger the
    // `typeof email !== 'string'` branch via stringification.
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('requireAdmin — AuthNotConfiguredError', () => {
  it('throws when no SSM parameters are returned', async () => {
    const { requireAdmin, AuthNotConfiguredError } = await loadModule();
    mockSsmGetParameters([]);
    const jwt = await signJwt();
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      AuthNotConfiguredError,
    );
  });

  it('throws when team_domain has the wrong shape', async () => {
    const { requireAdmin, AuthNotConfiguredError } = await loadModule();
    mockSsmGetParameters([
      { Name: '/sprawdzamszlak/cf-access/team_domain', Value: 'not-a-cf-domain.example.com' },
      { Name: '/sprawdzamszlak/cf-access/aud', Value: AUDIENCE },
      { Name: '/sprawdzamszlak/admin/owner_email', Value: OWNER_EMAIL },
    ]);
    const jwt = await signJwt();
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      AuthNotConfiguredError,
    );
  });

  it('throws when the audience param is too short to be a CF AUD tag', async () => {
    const { requireAdmin, AuthNotConfiguredError } = await loadModule();
    mockSsmGetParameters([
      { Name: '/sprawdzamszlak/cf-access/team_domain', Value: TEAM_DOMAIN },
      { Name: '/sprawdzamszlak/cf-access/aud', Value: 'short' },
      { Name: '/sprawdzamszlak/admin/owner_email', Value: OWNER_EMAIL },
    ]);
    const jwt = await signJwt();
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      AuthNotConfiguredError,
    );
  });

  it('throws when owner_email is not an email', async () => {
    const { requireAdmin, AuthNotConfiguredError } = await loadModule();
    mockSsmGetParameters([
      { Name: '/sprawdzamszlak/cf-access/team_domain', Value: TEAM_DOMAIN },
      { Name: '/sprawdzamszlak/cf-access/aud', Value: AUDIENCE },
      { Name: '/sprawdzamszlak/admin/owner_email', Value: 'not-an-email' },
    ]);
    const jwt = await signJwt();
    await expect(requireAdmin(makeEvent(jwt))).rejects.toBeInstanceOf(
      AuthNotConfiguredError,
    );
  });
});

describe('loadConfig caching', () => {
  it('only calls SSM once across multiple requireAdmin invocations', async () => {
    const { requireAdmin } = await loadModule();
    const jwt = await signJwt();
    await requireAdmin(makeEvent(jwt));
    await requireAdmin(makeEvent(jwt));
    await requireAdmin(makeEvent(jwt));
    expect(ssmSendMock).toHaveBeenCalledTimes(1);
  });
});
