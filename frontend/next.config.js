/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Environment variables are automatically available via process.env
  // No need to explicitly define them in env object for Vercel
  // Vercel will inject environment variables automatically
  output: 'standalone', // Optimized for Vercel deployment
  // Enable image optimization if needed
  images: {
    domains: [],
    unoptimized: false,
  },
  // ESLint configuration
  eslint: {
    // Allow builds to complete even with ESLint warnings
    // Warnings won't block deployment, only errors will
    ignoreDuringBuilds: false,
  },
  // TypeScript configuration
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors. Only enable if absolutely necessary.
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

