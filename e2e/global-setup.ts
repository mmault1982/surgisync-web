/**
 * Fail fast with instructions rather than letting specs hang.
 *
 * A missing backend or missing seed data is by far the most common reason
 * these tests fail, and a 30s timeout per spec tells you nothing useful.
 */
export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

  const response = await fetch(`${base}/api/v1/web/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ email: 'invalid@example.com', password: 'invalid' }),
  }).catch(() => null);

  if (!response) {
    throw new Error(
      `Cannot reach the API through ${base}.\n` +
        `Start the backend (docker compose up -d in surgiscribe-backend) and the dev server.`,
    );
  }

  if (response.status === 403) {
    throw new Error(
      `The API rejected this origin (${base}).\n` +
        `Add it to CORS_ALLOWED_ORIGINS in the backend's .env — it is the trusted-origin\n` +
        `allowlist for /api/v1/web/, not just a CORS setting.`,
    );
  }

  if (response.status === 429) {
    throw new Error(
      'The login endpoint is rate limited (web_login is 10/min and IP-keyed).\n' +
        'This suite spends ~6 logins per run, so two runs inside a minute exhaust it.\n' +
        'Wait a minute, or raise it for local development:\n' +
        '  THROTTLE_RATE_WEB_LOGIN=100/min in the backend .env, then restart it.',
    );
  }

  if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
    throw new Error(
      'Set E2E_EMAIL and E2E_PASSWORD to a seeded, approved user.\n' +
        'A seed command is being added backend-side; until then create one by hand.',
    );
  }
}
