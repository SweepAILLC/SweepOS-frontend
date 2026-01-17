# Vercel Deployment Guide

This guide will help you deploy the SweepOS frontend to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. Your backend API deployed and accessible
3. Git repository connected to Vercel (or manual deployment)

## Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

### Required Variables

- `NEXT_PUBLIC_API_BASE_URL` - Your backend API URL
  - Production: `https://api.yourdomain.com` or `https://your-backend.vercel.app`
  - Development: `http://localhost:8000` (for preview deployments)

### Example Values

```
NEXT_PUBLIC_API_BASE_URL=https://api.sweepai.site
```

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your Git repository
4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend` (if deploying from monorepo)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)
5. Add environment variables (see above)
6. Click "Deploy"

### Option 2: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

3. Login to Vercel:
   ```bash
   vercel login
   ```

4. Deploy:
   ```bash
   vercel
   ```

5. For production deployment:
   ```bash
   vercel --prod
   ```

## Configuration Files

- `vercel.json` - Vercel configuration (already created)
- `.env.example` - Example environment variables
- `next.config.js` - Next.js configuration (optimized for Vercel)

## Build Settings

The project is configured with:
- **Framework**: Next.js 14
- **Node Version**: Auto-detected (recommended: 18.x or 20.x)
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

## Custom Domain

To add a custom domain:
1. Go to Project Settings → Domains
2. Add your domain
3. Follow DNS configuration instructions

## Preview Deployments

Every push to a branch creates a preview deployment. Preview deployments:
- Use the same environment variables as production (unless overridden)
- Are accessible via unique URLs
- Can be used for testing before merging

## Troubleshooting

### Build Fails

- Check that all environment variables are set
- Verify `NEXT_PUBLIC_API_BASE_URL` is correct
- Check build logs in Vercel dashboard

### API Connection Issues

- Ensure `NEXT_PUBLIC_API_BASE_URL` points to your backend
- Check CORS settings on your backend
- Verify backend is accessible from Vercel's servers

### Environment Variables Not Working

- Variables must start with `NEXT_PUBLIC_` to be available in the browser
- Redeploy after adding/changing environment variables
- Check variable names match exactly (case-sensitive)

## Post-Deployment

After deployment:
1. Test the application at your Vercel URL
2. Verify API connections work
3. Test OAuth flows (Stripe, Brevo)
4. Update any hardcoded URLs in your backend to point to the Vercel frontend URL

## Monorepo Setup

If deploying from a monorepo:
- Set **Root Directory** to `frontend` in Vercel settings
- Vercel will automatically detect it's a Next.js app

