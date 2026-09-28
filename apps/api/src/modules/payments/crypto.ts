import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

/**
 * Encrypts merchant secrets at rest with AES-256-GCM. The key is 32 random bytes,
 * base64-encoded, from PAYMENTS_ENCRYPTION_KEY. Output: "v1:<iv>:<tag>:<ciphertext>" (base64 parts).
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error('PAYMENTS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
  }

  /** Throws if the value was tampered with or encrypted under a different key. */
  decrypt(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split(':');
    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error('Unrecognised encrypted value.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}
