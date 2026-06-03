/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Derives a cryptographic key from a plain text room secret/key.
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('SyncSpaceSalt2026'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts clear text with AES-GCM using the given room password.
 */
export async function encryptText(text: string, secret: string): Promise<string> {
  if (!text || !secret) return text;
  try {
    const key = await deriveKey(secret);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(text)
    );
    
    // Combine IV (fixed size 12) + Ciphertext as a single byte array
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to a base64 string
    let binary = '';
    const bytes = new Uint8Array(combined);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Encryption failed:', error);
    return text;
  }
}

/**
 * Decrypts base64 encoded cipher text with AES-GCM using the given room password.
 */
export async function decryptText(cipherTextBase64: string, secret: string): Promise<string> {
  if (!cipherTextBase64 || !secret) return cipherTextBase64;
  try {
    const binaryString = atob(cipherTextBase64);
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }
    
    if (combined.length < 13) {
      return '[Decryption Error: Data packet truncated]';
    }
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const key = await deriveKey(secret);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.warn('Decryption failed, key is probably incorrect.');
    return '[Encrypted Message - Locked]';
  }
}
