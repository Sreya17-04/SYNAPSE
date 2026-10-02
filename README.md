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

`GET /api/posts` accepts `?limit=` (1–100) and `?category=`. The admin list
endpoints accept `?page=` and `?limit=` (≤200).

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

**Tokens are revocable.** Each token embeds the user's `tokenVersion`;
`POST /api/auth/logout` increments it, retiring every token issued to that user
on every device. The cost is that logout is "log out everywhere", not a single
session.

**Flagged users are actually blocked.** `isFlagged` is enforced in
`authMiddleware`, so a suspended account loses all mutating permissions. It is
not a cosmetic label.

**Rate limiting.** `/api/*` has a broad 600/15min backstop. Login is limited to
10 attempts per 15 minutes keyed by IP + submitted email, registration to 5 per
hour per IP.

**The API base URL is derived, not hardcoded.** `frontend/config.js` computes it
from `window.location.origin`, so the app works on any port or host. Adding a
custom domain only requires listing it in `CORS_ORIGINS`, which feeds both the
CORS check and the CSP `connect-src`.

## Known limitations

- No test suite.
- No moderation audit trail — who flagged or deleted what is not recorded.
- Comments cannot be edited or deleted by their author.
- There is no student-facing "report" flow; the `flagged` post status is only
  ever set by an admin.
- Saved posts live in `localStorage`, so they are per-device and not synced.
- The CSP still allows `'unsafe-inline'` scripts because the auth pages carry
  inline `<script>` blocks. Moving those into files would let it be tightened.
