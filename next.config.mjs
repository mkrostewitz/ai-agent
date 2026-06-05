/** @type {import('next').NextConfig} */
const widgetCorsHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value: "*",
  },
];

const nextConfig = {
  async headers() {
    return [
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
