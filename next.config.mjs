/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/saas',
        destination: '/',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
