// Order state machine (Spec 8). Only listed transitions by the listed roles are allowed.

export const ORDER_STATUSES = [
  'PLACED', 'ACCEPTED', 'PAID_ESCROW', 'IN_PROGRESS', 'DELIVERED', 'RECEIVED', 'VALIDATED', 'COMPLETED',
  'REJECTED', 'CANCELLED', 'FLAGGED', 'DISPUTED', 'OVERDUE', 'REFUNDED', 'EXPIRED',
];

const DISPUTABLE = ['PAID_ESCROW', 'IN_PROGRESS', 'DELIVERED', 'RECEIVED', 'OVERDUE', 'FLAGGED', 'VALIDATED'];

// [from, to, roles]
const T = [
  ['PLACED', 'ACCEPTED', ['RECYCLER']],
  ['PLACED', 'REJECTED', ['RECYCLER']],
  ['PLACED', 'CANCELLED', ['PRODUCER']],
  ['ACCEPTED', 'CANCELLED', ['PRODUCER']],
  ['ACCEPTED', 'PAID_ESCROW', ['PRODUCER']],
  ['PAID_ESCROW', 'IN_PROGRESS', ['RECYCLER']],
  ['IN_PROGRESS', 'DELIVERED', ['RECYCLER']],
  ['OVERDUE', 'DELIVERED', ['RECYCLER']],
  ['OVERDUE', 'IN_PROGRESS', ['RECYCLER']],
  ['PAID_ESCROW', 'OVERDUE', ['SYSTEM']],
  ['IN_PROGRESS', 'OVERDUE', ['SYSTEM']],
  ['DELIVERED', 'RECEIVED', ['PRODUCER']],
  ['RECEIVED', 'VALIDATED', ['SYSTEM']],
  ['RECEIVED', 'FLAGGED', ['SYSTEM']],
  ['FLAGGED', 'VALIDATED', ['ADMIN']],
  ['FLAGGED', 'REFUNDED', ['ADMIN']],
  ['VALIDATED', 'COMPLETED', ['ADMIN', 'SYSTEM']],
  ['DISPUTED', 'REFUNDED', ['ADMIN']],
  ['DISPUTED', 'COMPLETED', ['ADMIN']],
  ['PAID_ESCROW', 'EXPIRED', ['SYSTEM', 'ADMIN']],
  ['IN_PROGRESS', 'EXPIRED', ['SYSTEM', 'ADMIN']],
  ['OVERDUE', 'EXPIRED', ['SYSTEM', 'ADMIN']],
  ['OVERDUE', 'REFUNDED', ['ADMIN']],
  ['EXPIRED', 'REFUNDED', ['ADMIN']],
  ...DISPUTABLE.map((s) => [s, 'DISPUTED', ['PRODUCER', 'RECYCLER']]),
];

export function canTransition(from, to, role) {
  // Admin "request more proof" on a dispute returns the order to its pre-dispute state.
  if (from === 'DISPUTED' && role === 'ADMIN' && DISPUTABLE.includes(to)) return true;
  return T.some(([f, t, roles]) => f === from && t === to && roles.includes(role));
}

export function allowedNext(from, role) {
  return T.filter(([f, , roles]) => f === from && roles.includes(role)).map(([, t]) => t);
}

export const TRANSITIONS = T;
