/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
