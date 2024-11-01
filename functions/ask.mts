import { supabase } from '../server/clients/supabase'
import type { Context } from '@netlify/functions'
import { getCache } from '../server/cache'
import { askQuestion } from '../server/ask'
import random from '../server/idGenerator'

export default async (req: Request, context: Context) => {
  const body = await req.json()
  const qs = new URL(req.url).searchParams
  const nocache = body?.nocache ?? qs.get('nocache') === 'true' ?? false
  const nosupa = body?.nosupa ?? qs.get('nosupa') === 'true' ?? false
  const model = body?.model ?? qs.get('model') ?? 'openai'
  const user = body?.user ?? qs.get('user') ?? 'anonymous'
  const input = body?.question?.trim() ?? null
  const conversationId = body?.conversationId ?? qs.get('conversationId') ?? null

  if (!input) {
    return Response.json({ error: 'No question provided' }, { status: 400 })
  }

  if (!nocache && !nosupa) {
    const cachedData = await getCache(model, conversationId, user, input)
    const latestCacheHit = cachedData?.[0]

    if (latestCacheHit && latestCacheHit.answer && !conversationId) {
      console.log(`[ask] cache hit`)

      const cid = random()

      try {
        await supabase.from('conversations').upsert({
          id: parseInt(cid),
          conversationId: parseInt(cid),
          model,
          user,
          messages: [
            { role: 'user', content: input },
            { role: 'assistant', content: latestCacheHit.answer },
          ],
        })
      } catch {}

      return Response.json({
        ...latestCacheHit,
        conversationId: cid,
        isCached: true,
      })
    }
  }

  try {
    const stream = await askQuestion(input, user, conversationId, model, nocache, nosupa)

    let fullAnswer = ''
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        fullAnswer += chunk
        controller.enqueue(chunk)
      },
    })

    return new Response(stream.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (e) {
    console.error(e)
    return Response.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 },
    )
  }
}
