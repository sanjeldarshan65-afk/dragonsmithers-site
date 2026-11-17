/* Shared by /private/ (vault.js) and /private/study/ (study.js): one password scheme, one implementation.
   A locked file is {v:1, salt, iv, iter, ct} made by tools/lock.html: PBKDF2-SHA256 -> AES-256-GCM.
   A wrong password fails the AES-GCM check and throws. */
window.VaultCrypto = (() => {
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /** Fetch a locked file. Resolves to the payload, or null if it is missing or not locked yet. */
  const load = (url) => fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => (d && d.v === 1 && d.ct ? d : null));

  async function decrypt(data, password) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(data.salt), iterations: data.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(data.iv) }, key, unb64(data.ct));
    return new TextDecoder().decode(plain);
  }

  return { load, decrypt };
})();
