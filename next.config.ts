import type { NextConfig } from "next";

const repoName = "santral-map";

const nextConfig: NextConfig = {
  output: "export",
  basePath: `/${repoName}`,
  assetPrefix: `/${repoName}/`,
  env: {
    NEXT_PUBLIC_BASE_PATH: `/${repoName}`,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
};

export default nextConfig;
