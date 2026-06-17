/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // postgres.js, ioredis and bullmq are server-only native-ish deps; keep them
  // external to the server bundle so Next does not try to bundle them.
  serverExternalPackages: ["postgres", "ioredis", "bullmq"],
};

export default nextConfig;
