/**
 * EncryptionAdapter — INTERFACE ONLY. Do not implement in V1.
 *
 * Reserved for the future zero-knowledge Private Vault, where the master key is
 * generated on the device, data is encrypted locally, and the server stores ciphertext
 * only. Declared now so the domain layer can be shaped for it without a later rewrite.
 *
 * There must be no implementation of this interface in V1, and no V1 code path may
 * depend on it. See .claude/rules/auth-security.md.
 */

export interface Ciphertext {
  /** Encrypted bytes. The server never holds the key that opens these. */
  data: ArrayBuffer;
  /** Initialisation vector / nonce. */
  iv: ArrayBuffer;
  /** Identifier of the key used, for rotation. Never the key itself. */
  keyId: string;
  algorithm: string;
}

export interface EncryptionAdapter {
  readonly name: string;
  readonly algorithm: string;
  encrypt(plaintext: ArrayBuffer, keyId: string): Promise<Ciphertext>;
  decrypt(ciphertext: Ciphertext): Promise<ArrayBuffer>;
}
