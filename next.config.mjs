/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'betterconnected.me' },
    ],
  },
};

export default nextConfig;
