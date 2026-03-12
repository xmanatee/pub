/**
 * Generate RS256 JWT key pair for @convex-dev/auth using Node.js built-in crypto.
 * Produces JWT_PRIVATE_KEY (PEM with newlines→spaces) and JWKS (JSON Web Key Set).
 */
import { generateKeyPairSync } from "node:crypto";

export interface AuthKeys {
  JWT_PRIVATE_KEY: string;
  JWKS: string;
}

export function generateAuthKeys(): AuthKeys {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const pem = (privateKey as unknown as string).trimEnd().replace(/\n/g, " ");
  const jwk = publicKey as unknown as Record<string, string>;

  return {
    JWT_PRIVATE_KEY: pem,
    JWKS: JSON.stringify({ keys: [{ use: "sig", alg: "RS256", ...jwk }] }),
  };
}
