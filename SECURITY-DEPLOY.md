# Lashbury Cup secure API deployment

This branch replaces the public `data.json` model with a Cloudflare Worker + Workers KV API.

## 1. Create the KV namespace

From the repository root:

```bash
cd worker
npx wrangler kv namespace create TOURNAMENT --jurisdiction=eu
```

Copy the returned namespace ID into `worker/wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

## 2. Set the initial PINs

Choose three different PINs:

- `ADMIN_PIN` — allows scoring/editing.
- `OWNER_PIN` — full owner/setup access.
- `GUEST_PIN` — competitor read-only access.

Set them as Worker secrets:

```bash
npx wrangler secret put ADMIN_PIN
npx wrangler secret put OWNER_PIN
npx wrangler secret put GUEST_PIN
```

The PIN values are never committed to GitHub.

## 3. Deploy the API

From `worker/`:

```bash
npx wrangler deploy
```

The Worker is configured for the custom domain `api.lashbury.co.uk`. Cloudflare Custom Domains can create the DNS record and certificate automatically.

Test:

```bash
curl https://api.lashbury.co.uk/health
```

Expected response:

```json
{"ok":true}
```

## 4. Import the existing tournament data

Do this before removing the old public data from the live site.

From the repository root, get the current production data from the `main` branch:

```git
git show main:data.json > /tmp/lashbury-data.json
```

Then, from the repository root:

```bash
npx wrangler kv key put tournament:data --path /tmp/lashbury-data.json --binding TOURNAMENT --remote
```

The data is now stored in private Workers KV rather than served as a public file.

## 5. Verify authentication

The Worker exposes:

- `POST /auth/login` — PIN login; creates a secure HttpOnly session cookie.
- `GET /api/session` — checks the current session.
- `GET /api/data` — returns tournament data only to an authenticated session.
- `PUT /api/data` — writes tournament data for admin/owner sessions.
- `PUT /api/pins` — changes PINs for the owner.
- `POST /auth/logout` — destroys the session.

## 6. Only then publish the frontend

The `security-v1` branch contains the frontend changes, but it is deliberately not being merged to `main` yet.

Once the Worker is live and the data import is verified, merge this branch into `main`. The frontend will then stop requesting GitHub's public `data.json`.

The old `data.json` should remain deleted from `main` after the cut-over.

## Important

Do not commit the PINs, Cloudflare API tokens, or any exported tournament data into the repository.

