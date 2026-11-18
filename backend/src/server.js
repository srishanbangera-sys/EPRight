import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { get, UPLOAD_DIR } from './db.js';
import { auth, requireRole, HttpError } from './http.js';
import { seed } from './seed.js';
import { runExpiryCheck } from './services/domain.js';
import { SYSTEM } from './services/audit.js';
import authRoutes from './routes/auth.js';
import invoiceRoutes from './routes/invoices.js';
import marketplaceRoutes from './routes/marketplace.js';
import orderRoutes from './routes/orders.js';
import creditRoutes from './routes/credits.js';
import generalRoutes from './routes/general.js';
import adminRoutes from './routes/admin.js';

const PORT = Number(process.env.PORT || 4000);
const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough: true }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'epright-api', time: new Date().toISOString() }));

app.use('/auth', authRoutes);
app.use(auth);
app.use('/invoices', invoiceRoutes);
app.use('/orders', orderRoutes);
app.use('/credits', creditRoutes);
app.use('/admin', adminRoutes);
app.post('/jobs/check-expiry', requireRole('ADMIN'), (req, res) => res.json(runExpiryCheck(req.user)));
// Presenter helper: rebuild the SAMPLE demo data from scratch.
app.post('/demo/reset', (_req, res) => {
  if (process.env.DEMO_MODE === 'false') throw new HttpError(403, 'Demo reset is disabled');
  seed({ quiet: true });
  res.json({ ok: true });
});
app.use(marketplaceRoutes);
app.use(generalRoutes);

app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message, ...(err.details || {}) });
});

if (!get('SELECT id FROM users LIMIT 1')) {
  console.log('Empty database: loading SAMPLE demo data...');
  seed();
}

// Daily expiry job (also triggerable from the admin console).
runExpiryCheck(SYSTEM);
setInterval(() => runExpiryCheck(SYSTEM), 24 * 60 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`EPRight API listening on http://localhost:${PORT}`));
