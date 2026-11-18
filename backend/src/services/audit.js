import { db, get, run, all } from '../db.js';
import { computeHash, GENESIS_HASH, verifyChain } from '../lib/auditChain.js';

// Extra column for scoping who can see an event. It is NOT part of the hash; content columns are.
db.exec(`CREATE TABLE IF NOT EXISTS event_scope (event_id INTEGER PRIMARY KEY, org_ids TEXT)`);

let lastTs = '';
function monotonicTimestamp() {
  let ts = new Date().toISOString();
  if (ts <= lastTs) ts = new Date(new Date(lastTs).getTime() + 1).toISOString();
  lastTs = ts;
  return ts;
}

export const SYSTEM = { id: null, role: 'SYSTEM', organization_id: null };

/** Append an event to the tamper-evident chain. */
export function writeEvent(actor, action, entityType, entityId, payload = {}, orgIds = []) {
  const last = get('SELECT hash FROM events ORDER BY id DESC LIMIT 1');
  const prev = last ? last.hash : GENESIS_HASH;
  const timestamp = monotonicTimestamp();
  const payloadJson = JSON.stringify(payload);
  const actorId = actor?.id ?? null;
  const hash = computeHash(prev, timestamp, actorId ?? '', action, payloadJson);
  const r = run(
    'INSERT INTO events (timestamp, actor_id, actor_role, action, entity_type, entity_id, payload, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?)',
    timestamp, actorId, actor?.role ?? 'SYSTEM', action, entityType ?? null, entityId != null ? String(entityId) : null, payloadJson, prev, hash,
  );
  const scope = [...new Set([actor?.organization_id, ...orgIds].filter((x) => x != null))];
  run('INSERT INTO event_scope (event_id, org_ids) VALUES (?, ?)', Number(r.lastInsertRowid), ',' + scope.join(',') + ',');
  return Number(r.lastInsertRowid);
}

export function verifyAll() {
  const events = all('SELECT id, timestamp, actor_id, action, payload, prev_hash, hash, entity_type, entity_id, actor_role FROM events ORDER BY id ASC')
    .map((e) => ({ ...e, actor_id: e.actor_id ?? '' }));
  const res = verifyChain(events);
  const lastEvent = events[events.length - 1];
  return {
    intact: res.intact,
    checked: res.checked,
    reason: res.reason,
    brokenAt: res.brokenAt ? { id: res.brokenAt.id, action: res.brokenAt.action, timestamp: res.brokenAt.timestamp, entity_type: res.brokenAt.entity_type, entity_id: res.brokenAt.entity_id } : null,
    head: lastEvent ? lastEvent.hash : GENESIS_HASH,
    verified_at: new Date().toISOString(),
  };
}
