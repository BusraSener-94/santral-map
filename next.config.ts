import type { NextConfig } from "next";

const repoName = "santral-map";

const nextConfig: NextConfig = {
  output: "export",
  basePath: `/${repoName}`,
  assetPrefix: `/${repoName}`,
  images: {
    unoptimized: true,
  },
  devIndicators: false,
};

export default nextConfig;
