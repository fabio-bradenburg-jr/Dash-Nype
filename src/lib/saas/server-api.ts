export function getPlatformApiUrl() {
  const url =
    process.env.PLATFORM_BACKEND_URL ||
    process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    'http://localhost:8000/api/v1'

  return url.replace(/\/$/, '')
}
