import { NextResponse } from 'next/server'
import { getHomeOverview } from '@/lib/server/platform-api'

export async function GET() {
  const data = await getHomeOverview()
  return NextResponse.json(data)
}
