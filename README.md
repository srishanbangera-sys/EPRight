# EPRight

EPRight is a decision-support and verification layer for Indian plastic-packaging Extended Producer Responsibility (EPR) workflows. It helps producers track obligations, review recycling-credit options, manage orders, and keep audit-ready records. It does not replace the official CPCB EPR portal.

> **Demo notice:** Seeded organizations, invoices, certificates, and transactions are sample data. Payments and escrow are simulated. EPRight does not issue legal EPR certificates or integrate with the CPCB portal in this version. Verify compliance figures and requirements with the official portal and applicable guidance.

## Features

- Producer, recycler, and administrator workspaces
- Invoice upload with optional AI-assisted extraction and manual confirmation
- Financial-year obligation tracking and credit management
- Recycler marketplace with listing and order workflows
- Rule-based safety checks, document expiry tracking, and administrative review
- Simulated escrow, audit trail, and filing report generation
- Seeded demo accounts and a guided product walkthrough

## Technology

- Frontend: Next.js, React, TypeScript, and Tailwind CSS
- Backend: Node.js, Express, and the built-in SQLite module
- Database: SQLite, created locally by the backend

## Requirements

- Node.js **22.13 or newer** (required for `node:sqlite`)
- npm

Check your runtime with `node -v`. If you use `nvm`, select a compatible version in each terminal before running the app, for example `nvm use 22`. Ensure `node -v` reports 22.13 or newer.

## Run locally

Open two terminals from the project root.

### 1. Start the backend

```bash
cd backend
npm install
npm run dev
```

The API listens at [http://localhost:4000](http://localhost:4000). Check its health at [http://localhost:4000/health](http://localhost:4000/health). On first run, the backend initializes the local database and loads sample data if the database is empty.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend uses `http://localhost:4000` for the API by default. To use another backend URL, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` before starting Next.js.

## Optional AI invoice extraction

AI-assisted invoice extraction is optional; the application can use sample/manual fallback without an AI key. To configure Gemini or Anthropic, copy `backend/.env.example` to `backend/.env` and add a key to that local file. Do not put credentials in `.env.example`, commit them, or expose them in frontend variables. Backend configuration also supports `PORT`, `JWT_SECRET`, `GEMINI_MODEL`, and `ANTHROPIC_API_KEY`.

## Demo accounts

The seeded demo password is `demo123` for all sample accounts. The login page provides demo account buttons; you can also use these accounts:

| Role | Email |
| --- | --- |
| Producer | `producer@epright.demo` |
| Sample producer | `foods@epright.demo` |
| Recycler | `recycler.a@epright.demo` through `recycler.f@epright.demo` |
| Admin | `admin@epright.demo` |

These are public demo credentials, not for production use.

## Development commands

Run commands from the corresponding directory:

| Directory | Command | Purpose |
| --- | --- | --- |
| `backend` | `npm run dev` | Start the API with watch mode |
| `backend` | `npm start` | Start the API |
| `backend` | `npm test` | Run backend tests |
| `backend` | `npm run seed` | **Destructively reset** the local database and reload sample data |
| `backend` | `npm run samples` | Generate sample invoice files |
| `frontend` | `npm run dev` | Start the frontend in development mode |
| `frontend` | `npm run build` | Build the frontend for production |
| `frontend` | `npm start` | Serve the production frontend build |
| `frontend` | `npm run lint` | Run ESLint |

The backend database and uploaded files are stored locally in `backend/data/` and `backend/uploads/`; these are generated at runtime and should not be committed.

## Project layout

```text
backend/   Express API, SQLite data layer, business rules, and tests
frontend/  Next.js application
sample-invoices/  Sample invoice files for demos
```

## Disclaimer

EPRight is a preparation and decision-support tool. Screening results are not a guarantee of compliance, and all sample figures and records are illustrative. Confirm official obligations, certificates, and filings through the appropriate CPCB processes.