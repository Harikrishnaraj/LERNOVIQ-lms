import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to 1 MB. Course thumbnails may be up to 2 MB (validated in the action);
    // videos and attachments never pass through Next (signed direct-to-storage uploads).
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
