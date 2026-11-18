// Tamper-evident hash chain (Spec 9.11). Pure functions. Not a blockchain.
import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export function computeHash(prevHash, timestamp, actorId, action, payloadJson) {
  return createHash('sha256')
    .update(String(prevHash) + String(timestamp) + String(actorId ?? '') + String(action) + String(payloadJson))
    .digest('hex');
}

/**
 * Recompute the whole chain. events must be ordered by id ascending; payload is the stored JSON string.
 * @returns {{intact:boolean, checked:number, brokenAt?:object, reason?:string}}
 */
export function verifyChain(events) {
  let prev = GENESIS_HASH;
  for (const e of events) {
    if (e.prev_hash !== prev) {
      return { intact: false, checked: events.length, brokenAt: e, reason: 'prev_hash does not match the previous event hash' };
    }
    const h = computeHash(e.prev_hash, e.timestamp, e.actor_id, e.action, e.payload);
    if (h !== e.hash) {
      return { intact: false, checked: events.length, brokenAt: e, reason: 'stored hash does not match the recomputed hash (event content was changed)' };
    }
    prev = e.hash;
  }
  return { intact: true, checked: events.length };
}
