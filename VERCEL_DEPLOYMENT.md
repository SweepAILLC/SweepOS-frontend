# Vercel deployment (SweepOS-frontend)

This repository is the **standalone frontend** — Next.js lives at the **repo root** (`package.json`, `pages/`, etc.).

## Required Vercel setting

In [Vercel](https://vercel.com) → your project → **Settings** → **General** → **Root Directory**:

| Repo | Root Directory |
|------|----------------|
| `SweepOS-frontend` (this repo) | **`.`** (empty / leave blank) |
| Monorepo with `frontend/` folder | `frontend` |

If Root Directory is still `frontend`, builds fail with:

> The specified Root Directory "frontend" does not exist.

After changing it, **Redeploy** (or push a new commit).

## Environment variables

**Settings** → **Environment Variables**:

```
NEXT_PUBLIC_API_BASE_URL=https://api.sweepai.site
```

## Build settings (defaults)

- **Framework**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

See `vercel.json` in this repo.
