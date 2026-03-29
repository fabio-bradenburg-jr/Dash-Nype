import type {
  AssistantAiAccessLevel,
  AssistantConversationDetail,
  AssistantConversationMessage,
  AssistantConversationSummary,
} from '@/lib/types/ai'

type LooseRecord = Record<string, any>

function toConversationSummary(record: LooseRecord): AssistantConversationSummary {
  return {
    id: String(record?.id || ''),
    title: String(record?.title || 'Nova conversa'),
    updatedAt: String(record?.updated_at || ''),
    lastMessageAt: String(record?.last_message_at || record?.updated_at || ''),
    preview: String(record?.preview || '').trim(),
  }
}

function buildConversationTitle(message: string): string {
  const normalized = String(message || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return 'Nova conversa'
  return normalized.length > 72 ? `${normalized.slice(0, 69).trim()}...` : normalized
}

export async function listAssistantConversations(
  adminSupabase: any,
  workspaceId: string,
  userId: string
): Promise<AssistantConversationSummary[]> {
  const { data, error } = await adminSupabase
    .from('assistant_conversations')
    .select('id, title, updated_at, last_message_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) throw error

  const conversationRows = Array.isArray(data) ? data : []
  if (!conversationRows.length) return []

  const conversationIds = conversationRows.map((row) => row.id)
  const { data: messageRows, error: messageError } = await adminSupabase
    .from('assistant_messages')
    .select('conversation_id, content, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  if (messageError) throw messageError

  const previewByConversationId = new Map<string, string>()
  ;(messageRows || []).forEach((row: LooseRecord) => {
    const conversationId = String(row?.conversation_id || '')
    if (!conversationId || previewByConversationId.has(conversationId)) return
    previewByConversationId.set(conversationId, String(row?.content || '').trim())
  })

  return conversationRows.map((row) =>
    toConversationSummary({
      ...row,
      preview: previewByConversationId.get(String(row.id)) || '',
    })
  )
}

export async function getAssistantConversationDetail(
  adminSupabase: any,
  workspaceId: string,
  userId: string,
  conversationId: string
): Promise<AssistantConversationDetail | null> {
  const { data: conversation, error: conversationError } = await adminSupabase
    .from('assistant_conversations')
    .select('id, title, updated_at, last_message_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError) throw conversationError
  if (!conversation) return null

  const { data: messages, error: messagesError } = await adminSupabase
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (messagesError) throw messagesError

  const normalizedMessages: AssistantConversationMessage[] = Array.isArray(messages)
    ? messages.map((message: LooseRecord) => ({
        id: String(message?.id || ''),
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        content: String(message?.content || ''),
        createdAt: String(message?.created_at || ''),
      }))
    : []

  return {
    conversation: toConversationSummary({
      ...conversation,
      preview: normalizedMessages[normalizedMessages.length - 1]?.content || '',
    }),
    messages: normalizedMessages,
  }
}

export async function createAssistantConversation(
  adminSupabase: any,
  workspaceId: string,
  userId: string,
  aiAccessLevel: AssistantAiAccessLevel | string,
  title = 'Nova conversa'
): Promise<AssistantConversationSummary> {
  const normalizedAiAccessLevel = aiAccessLevel === 'master' ? 'master' : 'team'

  const { data, error } = await adminSupabase
    .from('assistant_conversations')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      ai_access_level: normalizedAiAccessLevel,
      title,
    })
    .select('id, title, updated_at, last_message_at')
    .single()

  if (error) throw error

  return toConversationSummary({
    ...data,
    preview: '',
  })
}

export async function appendAssistantConversationTurn(
  adminSupabase: any,
  params: {
    workspaceId: string
    userId: string
    aiAccessLevel: AssistantAiAccessLevel | string
    conversationId?: string
    userMessage: string
    assistantMessage: string
    metadata?: LooseRecord
  }
): Promise<AssistantConversationSummary> {
  const {
    workspaceId,
    userId,
    aiAccessLevel,
    conversationId,
    userMessage,
    assistantMessage,
    metadata = {},
  } = params

  const normalizedUserMessage = String(userMessage || '').trim()
  const normalizedAssistantMessage = String(assistantMessage || '').trim()

  if (!normalizedUserMessage || !normalizedAssistantMessage) {
    throw new Error('Nao foi possivel salvar a conversa sem as mensagens do turno.')
  }

  let activeConversationId = String(conversationId || '').trim()
  let title = buildConversationTitle(normalizedUserMessage)
  const normalizedAiAccessLevel = aiAccessLevel === 'master' ? 'master' : 'team'

  if (activeConversationId) {
    const { data: existingConversation, error: existingConversationError } = await adminSupabase
      .from('assistant_conversations')
      .select('id, title')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('id', activeConversationId)
      .maybeSingle()

    if (existingConversationError) throw existingConversationError
    if (!existingConversation) {
      throw new Error('A conversa selecionada nao pertence a este usuario.')
    }

    title = String(existingConversation.title || title)
  } else {
    const createdConversation = await createAssistantConversation(
      adminSupabase,
      workspaceId,
      userId,
      normalizedAiAccessLevel,
      title
    )
    activeConversationId = createdConversation.id
    title = createdConversation.title
  }

  const rows = [
    {
      conversation_id: activeConversationId,
      workspace_id: workspaceId,
      user_id: userId,
      role: 'user',
      content: normalizedUserMessage,
      metadata,
    },
    {
      conversation_id: activeConversationId,
      workspace_id: workspaceId,
      user_id: userId,
      role: 'assistant',
      content: normalizedAssistantMessage,
      metadata,
    },
  ]

  const { error: insertError } = await adminSupabase
    .from('assistant_messages')
    .insert(rows)

  if (insertError) throw insertError

  const nowIso = new Date().toISOString()
  const { data: updatedConversation, error: updateError } = await adminSupabase
    .from('assistant_conversations')
    .update({
      title,
      ai_access_level: normalizedAiAccessLevel,
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', activeConversationId)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select('id, title, updated_at, last_message_at')
    .single()

  if (updateError) throw updateError

  return toConversationSummary({
    ...updatedConversation,
    preview: normalizedAssistantMessage,
  })
}
