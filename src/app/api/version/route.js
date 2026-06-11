import { NextResponse } from 'next/server'

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now())

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ version: BUILD_ID }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
