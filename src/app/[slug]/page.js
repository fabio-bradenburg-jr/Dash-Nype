import { notFound } from 'next/navigation'

import IntegracaoPage, { metadata as integracaoMetadata } from '../integracao/page'

export const metadata = integracaoMetadata

function normalizeSlug(value) {
  try {
    return decodeURIComponent(String(value || '')).normalize('NFC').toLowerCase()
  } catch {
    return String(value || '').normalize('NFC').toLowerCase()
  }
}

export default async function SlugPage({ params }) {
  const resolvedParams = await params
  const slug = normalizeSlug(resolvedParams?.slug)

  if (slug === 'integração') {
    return <IntegracaoPage />
  }

  notFound()
}
