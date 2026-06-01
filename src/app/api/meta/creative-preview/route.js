import { NextResponse } from 'next/server'
import { fetchMetaJson, normalizeMetaError } from '@/lib/server/meta-fetch'
import { resolveWorkspaceMetaAccessToken } from '@/lib/server/meta-connection'
import { createAdminClient } from '@/lib/server/supabase-admin'

function resolveCreativeDescription(creative = {}) {
  const storySpec = creative.object_story_spec || {}

  return (
    storySpec.video_data?.message ||
    storySpec.link_data?.message ||
    storySpec.photo_data?.message ||
    creative.body ||
    ''
  )
}

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

async function saveCreative(clientKey, adId, payload) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('meta_creative_cache')
    .upsert({
      client_key: clientKey,
      ad_id: adId,
      payload,
      fetched_at: new Date().toISOString(),
    })

  if (error) throw error
}

async function fetchCreativePreviewHtml(adId, token, clientKey) {
  const previewFormats = [
    'DESKTOP_FEED_STANDARD',
    'MOBILE_FEED_STANDARD',
    'INSTAGRAM_STANDARD',
  ]

  for (const previewFormat of previewFormats) {
    try {
      const params = new URLSearchParams({
        ad_format: previewFormat,
        access_token: token,
      })
      const previewData = await fetchMetaJson(
        `https://graph.facebook.com/v19.0/${adId}/previews?${params.toString()}`,
        'A Meta demorou para responder ao carregar o preview desse criativo.',
        { cacheContext: { clientKey, resourceKind: 'creative_preview_html' } }
      )
      const body = previewData?.data?.[0]?.body || ''

      if (body) return body
    } catch {
      continue
    }
  }

  return ''
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const adId = searchParams.get('ad_id')
    const clientKey = normalizeClientKey(searchParams.get('ad_account_id'))
    const token = await resolveWorkspaceMetaAccessToken(request)

    if (!token || !adId) {
      return NextResponse.json(
        { error: 'Informe um criativo válido e conecte a Meta para carregar o preview.' },
        { status: 400 }
      )
    }

    const savedCreative = await readSavedCreative(clientKey, adId)
    if (savedCreative?.previewLoaded) {
      return NextResponse.json(savedCreative)
    }

    const fields = 'id,name,creative{name,body,title,thumbnail_url,image_url,effective_object_story_id,object_story_spec}'
    const params = new URLSearchParams({ fields, access_token: token })
    const [adData, previewHtml] = await Promise.all([
      fetchMetaJson(
        `https://graph.facebook.com/v19.0/${adId}?${params.toString()}`,
        'A Meta demorou para responder ao carregar os detalhes desse criativo.',
        { cacheContext: { clientKey, resourceKind: 'creative_detail' } }
      ),
      fetchCreativePreviewHtml(adId, token, clientKey),
    ])
    const creative = adData?.creative || {}

    const payload = {
      adId,
      label: adData?.name || creative.name || 'Criativo sem nome',
      description: resolveCreativeDescription(creative),
      previewHtml,
      imageUrl: creative.image_url || creative.thumbnail_url || '',
      previewLoaded: true,
    }

    await saveCreative(clientKey, adId, payload)

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Meta creative preview error:', error)
    return NextResponse.json(
      { error: normalizeMetaError(error, 'Não foi possível carregar o preview real desse criativo.') },
      { status: 500 }
    )
  }
}
