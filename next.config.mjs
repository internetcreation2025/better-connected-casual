/** @type {import('next').NextConfig} */
const nextConfig = {
  // WordPress permalinks use trailing slashes; match them to avoid redirect hops.
  trailingSlash: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'betterconnected.me' },
    ],
  },
};

export default nextConfig;
