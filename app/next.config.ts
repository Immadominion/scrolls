import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "export",
    trailingSlash: true,
    reactStrictMode: true,
    images: {
        unoptimized: true, // required for static export (Walrus Sites)
    },
};

export default nextConfig;
