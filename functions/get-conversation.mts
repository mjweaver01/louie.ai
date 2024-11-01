import type { Context } from '@netlify/functions'
import { getConversation } from '../server/cache'

export default async (req: Request, context: Context) => {
  const { conversationId, user, nosupa } = await req.json()

  if (nosupa) {
    return Response.json({
      code: 400,
      message: 'No supabase',
      error: true,
    })
  }

  const conversation = await getConversation(conversationId, user)

  if (!conversationId || conversationId.length <= 0 || !conversation) {
    return Response.json({
      code: 404,
      message: 'Conversation not found',
      error: true,
    })
  }

  return Response.json({
    code: 200,
    message: 'Conversation found',
    conversation: conversation,
  })
}
