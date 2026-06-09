/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Where to proxy /api/* during local development (the local mytonstorage-backend).
const backendProxyTarget =
  process.env.BACKEND_PROXY_TARGET || "http://localhost:9092";

const nextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // Static export is only used for production builds. In dev we keep a real
  // server so that rewrites (the /api proxy below) work.
  output: isDev ? undefined : "export",
  // Prevent the trailingSlash redirect from turning POST /api/... into a 308,
  // which would break the proxied backend calls.
  skipTrailingSlashRedirect: true,
  turbopack: {},
  async rewrites() {
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendProxyTarget}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${backendProxyTarget}/health`,
      },
    ];
  },
};

export default nextConfig;
