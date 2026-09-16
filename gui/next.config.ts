import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // The dashboard reads ../index_data/exports at request time; make sure those
  // files are traced into serverless bundles when deployed from the monorepo.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/*": ["../index_data/exports/**/*"],
  },
};

export default nextConfig;
