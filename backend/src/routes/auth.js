import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run, tx } from '../db.js';
import { auth, signToken, upload, fileUrl, bad, str, num, date, HttpError } from '../http.js';
import { getOrg, recomputeOrgStatus, settings, addAlert } from '../services/domain.js';
import { writeEvent } from '../services/audit.js';

const r = Router();

function session(user) {
  const org = user.organization_id ? getOrg(user.organization_id) : null;
  return { token: signToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role, organization_id: user.organization_id, is_demo: !!user.is_demo }, organization: org };
}

r.post('/login', (req, res) => {
  const email = str(req.body.email, 'Email').toLowerCase();
  const password = str(req.body.password, 'Password');
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Email or password is incorrect');
  writeEvent({ id: user.id, role: user.role, organization_id: user.organization_id }, 'LOGIN', 'user', user.id, { email });
  res.json(session(user));
});

// Role switcher for presenters: only seeded demo accounts, no password needed.
r.get('/demo-accounts', (_req, res) => {
  res.json(all(`SELECT u.email, u.name, u.role, o.name AS org_name, o.status AS org_status FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.is_demo = 1 ORDER BY CASE u.role WHEN 'PRODUCER' THEN 0 WHEN 'RECYCLER' THEN 1 ELSE 2 END, u.id`));
});

r.post('/demo-login', (req, res) => {
  const email = str(req.body.email, 'Email').toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ? AND is_demo = 1', email);
  if (!user) throw new HttpError(404, 'Demo account not found');
  writeEvent({ id: user.id, role: user.role, organization_id: user.organization_id }, 'DEMO_ROLE_SWITCH', 'user', user.id, { email });
  res.json(session(user));
});

r.get('/me', auth, (req, res) => {
  const org = req.user.organization_id ? getOrg(req.user.organization_id) : null;
  res.json({ user: { ...req.user, is_demo: !!req.user.is_demo }, organization: org });
});

// Sign up a producer or recycler with registration documents (Stage 1).
r.post('/signup', upload.fields([{ name: 'registration_file', maxCount: 1 }, { name: 'consent_file', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const type = String(b.type || '').toUpperCase();
  if (!['PRODUCER', 'RECYCLER'].includes(type)) throw bad('Account type must be producer or recycler');
  const email = str(b.email, 'Email').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Enter a valid email');
  const password = str(b.password, 'Password');
  if (password.length < 6) throw bad('Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw bad('An account with this email already exists');
  const name = str(b.company_name, 'Company name', { max: 200 });
  const gst = str(b.gst_no, 'GST number', { max: 20 }).toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(gst)) throw bad('GST number must be 15 letters/digits');
  const cpcb = str(b.cpcb_reg_id, 'CPCB registration ID', { max: 60 });
  const contact = str(b.contact, 'Contact', { required: false, max: 200 });
  const regFrom = date(b.registration_valid_from, 'Registration valid-from');
  const regTo = date(b.registration_valid_to, 'Registration valid-to');
  if (regTo <= regFrom) throw bad('Registration valid-to must be after valid-from');
  let categories = [];
  let capacity = null;
  let location = str(b.location, 'Location', { required: type === 'RECYCLER', max: 200 });
  if (type === 'RECYCLER') {
    categories = (Array.isArray(b.categories) ? b.categories : String(b.categories || '').split(',')).map((s) => s.trim()).filter(Boolean);
    const valid = settings.categoryCodes();
    if (!categories.length || categories.some((c) => !valid.includes(c))) throw bad('Choose at least one valid category');
    capacity = num(b.monthly_capacity_t, 'Monthly capacity', { min: 1, max: 100000 });
    if (!req.files?.consent_file?.[0]) throw bad('Upload your consent-to-operate document');
  }
  if (!req.files?.registration_file?.[0]) throw bad('Upload your registration certificate');
  const cFrom = type === 'RECYCLER' ? date(b.consent_valid_from, 'Consent valid-from') : null;
  const cTo = type === 'RECYCLER' ? date(b.consent_valid_to, 'Consent valid-to') : null;

  const user = tx(() => {
    const o = run('INSERT INTO organizations (type, name, gst_no, cpcb_reg_id, location, contact, categories, monthly_capacity_t, status) VALUES (?,?,?,?,?,?,?,?,?)',
      type, name, gst, cpcb, location, contact, JSON.stringify(categories), capacity, 'PENDING');
    const orgId = Number(o.lastInsertRowid);
    run('INSERT INTO documents (organization_id, type, number, valid_from, valid_to, file_url, status) VALUES (?,?,?,?,?,?,?)',
      orgId, 'REGISTRATION_CERTIFICATE', cpcb, regFrom, regTo, fileUrl(req.files.registration_file[0]), 'PENDING');
    if (type === 'RECYCLER') {
      run('INSERT INTO documents (organization_id, type, number, valid_from, valid_to, file_url, status) VALUES (?,?,?,?,?,?,?)',
        orgId, 'CONSENT_TO_OPERATE', str(b.consent_number, 'Consent number', { required: false }) || `CTO-${cpcb}`, cFrom, cTo, fileUrl(req.files.consent_file[0]), 'PENDING');
    }
    const u = run('INSERT INTO users (email, name, password_hash, role, organization_id) VALUES (?,?,?,?,?)', email, str(b.name, 'Your name', { required: false }) || name, bcrypt.hashSync(password, 10), type, orgId);
    const user = get('SELECT * FROM users WHERE id = ?', Number(u.lastInsertRowid));
    writeEvent({ id: user.id, role: type, organization_id: orgId }, 'ORG_SIGNUP', 'organization', orgId, { type, name, gst_no: gst, cpcb_reg_id: cpcb, categories, monthly_capacity_t: capacity });
    recomputeOrgStatus(orgId);
    addAlert({ audience_role: 'ADMIN', type: 'VERIFICATION_PENDING', severity: 'info', message: `New ${type.toLowerCase()} "${name}" is waiting for document verification.`, link: '/admin/verifications' });
    return user;
  });
  res.status(201).json(session(user));
});

export default r;
