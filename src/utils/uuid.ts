/**
 * Runtime-safe unique ID generation.
 *
 * React Native's Hermes runtime does not provide the `crypto` global, so
 * `crypto.randomUUID()` throws a ReferenceError on device. These IDs are used
 * only as opaque unique keys (device IDs, row IDs, local track IDs), not for
 * anything security-sensitive, so a non-cryptographic generator is sufficient.
 *
 * `Math.random()` is backed by Hermes' PRNG and is seeded per process. To keep
 * collision risk negligible across many IDs, we combine a random segment with a
 * monotonic counter and the current timestamp.
 */

let counter = 0;

export function generateUuid(): string {
  // Prefer the native implementation when the runtime happens to expose it.
  const cryptoObj = (globalThis as any)?.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // Fall through to the JS implementation below.
    }
  }

  counter = (counter + 1) % 0x1000000;

  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  const time = Date.now().toString(16).padStart(12, "0");
  const seq = counter.toString(16).padStart(6, "0");

  // Shape: 8-4-4-4-12, matching RFC 4122 formatting.
  const hex = `${time}${random()}${seq}${random()}${random()}${random()}${random()}${random()}${random()}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
