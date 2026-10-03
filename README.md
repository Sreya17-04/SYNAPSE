# SYNAPSE — Department Community Platform

A discussion forum for a single college department: students post questions and
opportunities, comment and like, and admins moderate.

- **Backend** — Node.js, Express 5, MongoDB/Mongoose 9, JWT auth
- **Frontend** — vanilla HTML/CSS/JS, no build step, no framework
- One process serves both: the API and the static frontend on `PORT` (5000)

## Quick start

```bash
cd backend
npm install
cp .env.example .env      # then fill in MONGO_URI and JWT_SECRET
npm run seed              # optional: creates the admin + demo accounts
npm run dev               # nodemon; use `npm start` for plain node
```

Open <http://localhost:5000/login.html>.

### Seed accounts

`npm run seed` creates two accounts. Passwords come from `SEED_ADMIN_PASSWORD`
and `SEED_STUDENT_PASSWORD`; if unset, a random password is generated and
printed once, so no usable default is ever committed.

| Role | Email | Page |
| --- | --- | --- |
| Admin | `admin@synapse.edu` | `/admin-login.html` |
| Student | `student@synapse.edu` | `/login.html` |

Registration always creates a `student`. There is no self-service path to
`admin`, and admin accounts cannot be flagged.

### Database

`MONGO_URI` is required. `MONGO_URI_LOCAL` is an optional fallback tried when
the primary fails — useful when Atlas's IP access list blocks your network:

```env
MONGO_URI_LOCAL=mongodb://127.0.0.1:27017/DeptCommunity
```

Atlas requires your IP on the allowlist (Network Access → IP Access List).
The seeder and server share one connection helper, so both behave the same.

## Publishing on GitHub Pages

GitHub Pages is **static only** — it can host `docs/` but not Express/MongoDB.
The site therefore ships in two halves:

| Half | Lives in | Hosted on |
| --- | --- | --- |
| Frontend | `docs/` (a copy of `frontend/`) | GitHub Pages |
| API + DB | `backend/` | Render (or any Node host) + MongoDB Atlas |

`frontend/` is the source of truth; `docs/` is what Pages publishes and what
the backend serves locally. After editing `frontend/`, re-sync:

```powershell
Copy-Item frontend\* docs\ -Recurse -Force
```

### 1. Deploy the backend

- Push the repo, then create a **Render Blueprint** from `render.yaml`
  (Render → New → Blueprint), or run the backend anywhere Node runs.
- Set `MONGO_URI` to your Atlas string and make sure your IP (or `0.0.0.0/0`
  for a free cluster) is on the Atlas IP access list.
- `CORS_ORIGINS` must list the Pages origin:
  `https://sreya17-04.github.io` (already the default in `app.js`).
- Check `https://<your-service>.onrender.com/api/health` returns
  `{"status":"ok", ... "database":"connected"}`.

### 2. Point the frontend at it

Put the API URL in **one** place — `docs/config.js` (and `frontend/config.js`):

```js
const SYNAPSE_DEPLOYED_API_URL = "https://synapse-api.onrender.com";
```

Leave it `""` and the app keeps using `window.location.origin`, which is
correct when the backend serves the pages itself (local dev).

### 3. Turn on Pages

1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`. `.github/workflows/deploy-pages.yml` uploads `docs/`.
3. The site is live at `https://sreya17-04.github.io/SYNAPSE/`.

All asset and navigation links are relative, so the `/SYNAPSE/` sub-path works
without any changes.

## Configuration


| Variable | Required | Notes |
| --- | --- | --- |
| `JWT_SECRET` | yes | ≥32 chars. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MONGO_URI` | yes | Atlas SRV or local connection string |
| `MONGO_URI_LOCAL` | no | Fallback tried after `MONGO_URI` |
| `PORT` | no | Default `5000` |
| `CORS_ORIGINS` | no | Comma-separated. Also feeds the CSP `connect-src` |
| `JWT_EXPIRES_IN` | no | Default `12h` |
| `SEED_ADMIN_PASSWORD` | no | ≥8 chars, applies only at account creation |
| `SEED_STUDENT_PASSWORD` | no | ≥8 chars, applies only at account creation |

## API

Public unless marked. Mutating routes need `Authorization: Bearer <token>`.

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/health` | — |
| `POST` | `/api/auth/register` | — (rate limited) |
| `POST` | `/api/auth/login` | — (rate limited) |
| `POST` | `/api/auth/logout` | token |
| `GET` | `/api/auth/me` | token |
| `GET` | `/api/posts` | optional token |
| `POST` | `/api/posts` | token |
| `PUT` | `/api/posts/:id` | owner or admin |
| `DELETE` | `/api/posts/:id` | owner or admin |
| `PATCH` | `/api/posts/:id/like` | token |
| `POST` | `/api/posts/:id/comment` | token |
| `POST` | `/api/posts/:id/report` | token (rate limited) |
| `GET` | `/api/top-discussions` | — |
| `GET` | `/api/announcements` | — |
| `GET` | `/api/stats` | — |
| `GET` | `/api/admin/stats` | admin |
| `GET` | `/api/admin/posts` | admin |
| `GET` | `/api/admin/announcements` | admin |
| `POST` | `/api/admin/announcements` | admin |
| `DELETE` | `/api/admin/announcements/:id` | admin |
| `PATCH` | `/api/admin/posts/:id/status` | admin |
| `DELETE` | `/api/admin/posts/:id` | admin |
| `GET` | `/api/admin/users` | admin |
| `PATCH` | `/api/admin/users/:id/flag` | admin |
| `DELETE` | `/api/admin/users/:id` | admin |
| `GET` | `/api/admin/reports` | admin |
| `PATCH` | `/api/admin/reports/:id` | admin |

`GET /api/posts` accepts `?limit=` (1–100) and `?category=`. The admin list
endpoints accept `?page=` and `?limit=` (≤200). `GET /api/admin/reports` also
accepts `?status=` (`open`, `resolved`, `dismissed` or `all`).

## Design notes

**The public feed does not expose emails.** `GET /api/posts` returns author
names but strips `authorEmail` from both posts and comments. Ownership is
exposed as an `isOwner` boolean, computed only when the request carries a valid
token — so logged-in students still see their own delete button without member
email addresses leaking to anonymous callers.

**Author identity is denormalised.** `Post.author` / `Post.authorEmail` are
plain strings, not Mongoose references. This is simple and fast for a forum
where names rarely change, but it means a rename does not cascade and there is
no referential integrity.

**Deleting an account cascades by hand.** Because those references are strings,
`DELETE /api/admin/users/:id` explicitly removes the account's posts, its
comments on other posts, its likes (recomputing the `likes` counter), and any
`savedPosts` entries pointing at its posts. Admin accounts cannot be deleted,
and the action is recorded in the audit log as `user.deleted`.

**Tokens are revocable.** Each token embeds the user's `tokenVersion`;
`POST /api/auth/logout` increments it, retiring every token issued to that user
on every device. The cost is that logout is "log out everywhere", not a single
session.

**Flagged users are actually blocked.** `isFlagged` is enforced in
`authMiddleware`, so a suspended account loses all mutating permissions. It is
not a cosmetic label.

**Rate limiting.** `/api/*` has a broad 600/15min backstop. Login is limited to
10 attempts per 15 minutes keyed by IP + submitted email, registration to 5 per
hour per IP, and reports to 10 per hour per IP.

**The API base URL is derived, not hardcoded.** `frontend/config.js` computes it
from `window.location.origin`, so the app works on any port or host. Adding a
custom domain only requires listing it in `CORS_ORIGINS`, which feeds both the
CORS check and the CSP `connect-src`.

## Known limitations

- No test suite.
- No moderation audit trail — who flagged or deleted what is not recorded.
- Comments cannot be edited or deleted by their author.
- Students can file a report from the feed (`POST /api/posts/:id/report`), but
  the moderation queue it feeds has no admin UI yet — reports are only
  readable through the API. The `flagged` post status is still only ever set
  by an admin.
- Saved posts live in `localStorage`, so they are per-device and not synced.
- The CSP still allows `'unsafe-inline'` scripts because the auth pages carry
  inline `<script>` blocks. Moving those into files would let it be tightened.
