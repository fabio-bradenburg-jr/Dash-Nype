export function getPlatformApiUrl() {
  return (
    process.env.PLATFORM_BACKEND_URL ||
    process.env.NEXT_PUBLIC_PLATFORM_API_URL ||
    'http://localhost:8000/api/v1'
  )
}
