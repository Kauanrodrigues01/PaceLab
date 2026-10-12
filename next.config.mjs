/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/medias",
        destination: "/calculadora",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
