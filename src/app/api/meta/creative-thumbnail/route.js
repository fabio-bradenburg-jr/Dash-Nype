import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'
import { createAdminClient } from '@/lib/server/supabase-admin'

function normalizeClientKey(value) {
  return String(value || 'unassigned').replace(/^act_/, '') || 'unassigned'
}

async function readSavedCreative(clientKey, adId) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('meta_creative_cache')
    .select('payload')
    .eq('client_key', clientKey)
    .eq('ad_id', adId)
    .maybeSingle()

  if (error) throw error
  return data?.payload || null
}

async function saveCreativeThumbnail(clientKey, adId, savedCreative, imageUrl) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('meta_creative_cache')
    .upsert({
      client_key: clientKey,
      ad_id: adId,
      payload: {
        ...savedCreative,
        adId,
        imageUrl,
      },
      fetched_at: new Date().toISOString(),
    })

  if (error) throw error
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adId = searchParams.get('ad_id')
    const clientKey = normalizeClientKey(searchParams.get('ad_account_id'))
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adId) {
      return NextResponse.json({ error: 'Informe um criativo válido.' }, { status: 400 })
    }

    let imageUrl = null

    const savedCreative = await readSavedCreative(clientKey, adId)
    if (savedCreative?.imageUrl) {
      // Try cached URL first; if expired, fall through to re-fetch
      const probe = await fetch(savedCreative.imageUrl, { method: 'HEAD' }).catch(() => null)
      if (probe?.ok) {
        imageUrl = savedCreative.imageUrl
      }
    }

    if (!imageUrl) {
      const params = new URLSearchParams({
        fields: 'creative{thumbnail_url,image_url}',
        access_token: token,
      })
      const adData = await fetchMetaJson(
        `https://graph.facebook.com/v19.0/${adId}?${params.toString()}`,
        'A Meta demorou para responder ao carregar a imagem desse criativo.',
        { cacheContext: { clientKey, resourceKind: 'creative_thumbnail' } }
      )
      const creative = adData?.creative || {}
      imageUrl = creative.image_url || creative.thumbnail_url || ''

      if (!imageUrl) {
        return new NextResponse(null, { status: 404 })
      }

      await saveCreativeThumbnail(clientKey, adId, savedCreative, imageUrl)
    }

    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      return new NextResponse(null, { status: 404 })
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
    const buffer = await imageResponse.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Meta creative thumbnail error:', error)
    return NextResponse.json(
      { error: normalizeMetaError(error, 'Não foi possível carregar a imagem desse criativo.') },
      { status: 500 }
    )
  }
}
