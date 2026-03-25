/** ECDH P-256 + AES-256-GCM helpers for Aether end-to-end encryption. */

const ECDH_ALG = { name: "ECDH", namedCurve: "P-256" } as const;
const AES_ALG  = { name: "AES-GCM", length: 256 } as const;

export type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };

/** Generate a fresh ECDH P-256 key pair. */
export async function generateKeyPair(): Promise<KeyPair> {
  return crypto.subtle.generateKey(ECDH_ALG, false, ["deriveKey"]) as Promise<KeyPair>;
}

/** Export a public key to base64 SPKI so it can be sent over the wire. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/** Import a base64 SPKI public key received from a peer. */
export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return crypto.subtle.importKey("spki", buf, ECDH_ALG, false, []);
}

/** Derive a shared AES-256-GCM key from our private key + peer's public key. */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  remotePublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    privateKey,
    AES_ALG,
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a raw Uint8Array chunk with AES-256-GCM.
 * Returns base64-encoded ciphertext and IV (to be included in the message).
 */
export async function encryptChunk(
  key: CryptoKey,
  plainBytes: Uint8Array<ArrayBuffer>,
): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes);
  const cipherArr = new Uint8Array(cipherBuf);
  let cipherBinary = "";
  for (let i = 0; i < cipherArr.length; i++) cipherBinary += String.fromCharCode(cipherArr[i]);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(cipherBinary),
  };
}

/**
 * Decrypt a base64 ciphertext chunk.
 * Returns the plaintext re-encoded as base64 (matching the unencrypted wire format).
 */
export async function decryptChunk(
  key: CryptoKey,
  ivB64: string,
  dataB64: string,
): Promise<string> {
  const ivStr = atob(ivB64);
  const iv = new Uint8Array(ivStr.length);
  for (let i = 0; i < ivStr.length; i++) iv[i] = ivStr.charCodeAt(i);
  const encStr = atob(dataB64);
  const enc = new Uint8Array(encStr.length);
  for (let i = 0; i < encStr.length; i++) enc[i] = encStr.charCodeAt(i);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, enc);
  let binary = "";
  const arr = new Uint8Array(plainBuf);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}
