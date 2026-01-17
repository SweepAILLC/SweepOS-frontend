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
}

module.exports = nextConfig

