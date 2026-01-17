# Fix Vercel "No Next.js version detected" Error

## Problem
Vercel is not detecting Next.js even though `package.json` has `next` in dependencies.

## Solution

### Step 1: Check Vercel Project Settings

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **General**
3. Scroll down to **Root Directory**
4. **IMPORTANT**: Set Root Directory to `.` (a single dot) or leave it **empty**
   - If it's set to `frontend` or any other path, clear it
   - The frontend repo should have all files at the root after the split

### Step 2: Verify Repository Structure

Your frontend repository (`SweepOS-Frontend`) should have this structure at the root:
```
SweepOS-Frontend/
├── package.json          ← Must be here
├── next.config.js
├── vercel.json
├── pages/
├── components/
├── lib/
└── ...
```

### Step 3: Clear Build Cache and Redeploy

1. In Vercel dashboard, go to **Settings** → **General**
2. Scroll to **Build Cache**
3. Click **Clear Build Cache**
4. Go to **Deployments** tab
5. Click **Redeploy** on the latest deployment

### Step 4: Verify package.json

Ensure your `package.json` has `next` in `dependencies` (not just `devDependencies`):

```json
{
  "dependencies": {
    "next": "14.0.4",
    ...
  }
}
```

### Alternative: Use Vercel CLI

If dashboard settings don't work, try deploying via CLI:

```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```

The CLI will prompt you for settings and can auto-detect the correct configuration.

## Still Not Working?

If the issue persists:

1. **Check Git Repository**: Ensure your frontend repo has `package.json` at the root
2. **Verify Commit**: Make sure your latest commit includes `package.json` with `next` dependency
3. **Check Branch**: Ensure Vercel is deploying from the correct branch (usually `main` or `master`)
4. **Contact Support**: If none of the above works, contact Vercel support with your project URL

