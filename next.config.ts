import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Content-Security-Policy', value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-src 'self' https://www.youtube.com https://youtu.be",
    ].join('; ') }
];

const nextConfig: NextConfig = {
  output: 'standalone', // kleinere Lambda bundles (Vercel / Docker)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    optimizePackageImports: ['react', 'react-dom']
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders }
    ];
  },
  // Images optional konfigurieren (erweitern falls externe Domains genutzt)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' }
    ]
  }
};

export default nextConfig;
