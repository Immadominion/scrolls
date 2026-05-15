import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "export",
    reactStrictMode: true,
    images: {
        unoptimized: true, // required for static export (Walrus Sites)
    },
};

export default nextConfig;
