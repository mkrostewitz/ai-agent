/** @type {import('next').NextConfig} */
const widgetCorsHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value: "*",
  },
];

const avatarAssetHeaders = [
  ...widgetCorsHeaders,
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/avatars/:path*",
        headers: avatarAssetHeaders,
      },
      {
        source: "/uploads/:path*",
        headers: avatarAssetHeaders,
      },
      {
        source: "/data/:path*",
        headers: widgetCorsHeaders,
      },
      {
        source: "/locales/:path*",
        headers: widgetCorsHeaders,
      },
      {
        source: "/scripts/chat-widget.js",
        headers: widgetCorsHeaders,
      },
      {
        source: "/styles/chat-widget.css",
        headers: widgetCorsHeaders,
      },
    ];
  },
};

export default nextConfig;
