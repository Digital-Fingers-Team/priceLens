const path = require('path');

// Shared with apps/api from the repo root — see /.env.example
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
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
