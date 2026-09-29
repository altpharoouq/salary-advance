import type { NextConfig } from "next";

const config: NextConfig = {
  // The approval PDF reads fonts and the logo from disk, so make sure they ship with the serverless function.
  outputFileTracingIncludes: {
    "/api/requests/[id]/download": ["./assets/fonts/**/*", "./public/logo.png"],
  },
};
export default config;
