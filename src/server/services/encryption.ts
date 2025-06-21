const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

export function encrypt(text: string): string {
  const key = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  
  // Simple XOR encryption for demo (use proper crypto in production)
  const textBytes = new TextEncoder().encode(text);
  const encrypted = new Uint8Array(textBytes.length);
  
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ key[i % key.length] ^ iv[i % iv.length];
  }
  
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export function decrypt(encryptedText: string): string {
  const key = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
  const combined = new Uint8Array(atob(encryptedText).split('').map(c => c.charCodeAt(0)));
  
  const iv = combined.slice(0, 16);
  const encrypted = combined.slice(16);
  const decrypted = new Uint8Array(encrypted.length);
  
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length] ^ iv[i % iv.length];
  }
  
  return new TextDecoder().decode(decrypted);
}