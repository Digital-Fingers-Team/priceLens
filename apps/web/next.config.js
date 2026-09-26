const path = require('path');

/**
 * Security headers for every page (S-08). The API sets its own (helmet).
 *
 * script-src keeps 'unsafe-inline': the App Router inlines its bootstrap and
 * RSC payload scripts, and removing it needs per-request nonces (middleware),
 * planned with the Next 15 upgrade. Everything else is locked down:
 * no framing (clickjacking), no plugins, no foreign form targets, and fetches
 * only to this site and the API.
 */
function securityHeaders() {
  const isDev = process.env.NODE_ENV !== 'production';
  const apiOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
    } catch {
      return '';
    }
  })();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Product images load straight from the retailer CDNs (S-03).
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ' ' + apiOrigin : ''}${isDev ? ' ws:' : ''}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The monorepo root. Without it Next 15 guesses from whichever lockfile it
  // finds first, and the server has an unrelated one in the home directory.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  images: {
    // The optimizer (/_next/image) decodes remote images with sharp/libheif;
    // Next 14 has an unpatched RCE there via AVIF (GHSA-2xp9-vwfh-vxw4, S-03).
    // Images load straight from the retailer CDNs until the Next 15 upgrade.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dummyimage.com',
      },
      // Retailer image CDNs — product images are scraped live, so hostnames
      // are wildcarded per known retailer domain rather than pinned exactly.
      {
        protocol: 'https',
        hostname: '**.jumia.is',
      },
      {
        protocol: 'https',
        hostname: '**.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.ssl-images-amazon.com',
      },
      {
        protocol: 'https',
        hostname: '**.nooncdn.com',
      },
      {
        protocol: 'https',
        hostname: '**.alicdn.com',
      },
      {
        protocol: 'https',
        hostname: '**.aliexpress-media.com',
      },
      {
        protocol: 'https',
        hostname: '**.carrefouruae.com',
      },
      {
        protocol: 'https',
        hostname: '**.mafrservices.com',
      },
      // 2B and ELARABY serve product images from their apex/store domains directly.
      {
        protocol: 'https',
        hostname: '2b.com.eg',
      },
      {
        protocol: 'https',
        hostname: '**.2b.com.eg',
      },
      {
        protocol: 'https',
        hostname: '**.elarabygroup.com',
      },
    ],
  },
};

module.exports = nextConfig;
