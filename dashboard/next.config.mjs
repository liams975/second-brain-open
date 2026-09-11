/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Cloudflare Pages (no server runtime; the API is the Worker).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
