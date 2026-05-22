import { NextResponse } from 'next/server'
import { getExecutiveOverview } from '@/lib/server/platform-api'

export async function GET() {
  const data = await getExecutiveOverview()
  return NextResponse.json(data)
}
