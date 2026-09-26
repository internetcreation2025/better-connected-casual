// Shared across our apps — see security-headers.mjs.
import { securityHeaders } from "./security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // WordPress permalinks use trailing slashes; match them to avoid redirect hops.
  trailingSlash: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'betterconnected.me' },
    ],
  },

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({
          // The login page pulls Poppins from Google Fonts with an @import, so
          // the stylesheet and the font files come from two different hosts.
          // Miss either and the page renders in a fallback face.
          style: ['https://fonts.googleapis.com'],
          font: ['https://fonts.gstatic.com'],
          // Images still served from the old WordPress domain (see remotePatterns).
          img: ['https://betterconnected.me'],
        }),
      },
    ];
  },
};

export default nextConfig;
