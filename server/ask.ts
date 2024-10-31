import { Stream } from 'openai/streaming'
import type { ChatCompletionChunk, ChatCompletionMessage } from 'openai/resources/chat/completions'
import { supabase } from './clients/supabase'
import { systemPromptTemplate } from './prompts'
import { defaultQuestion } from './constants'
import random from './idGenerator'
import { saveToCache } from './cache'
import { saveToZep } from './clients/zep'
import { createChatCompletion } from './clients/openai'
import { oOneModel, fourOModel, threeModel } from './constants'
import { handleToolCalls } from './handleToolCalls'

export const ask = async (
  input: string,
  user: string,
  conversationId?: string,
  model?: string,
  nocache?: boolean,
): Promise<ReadableStream> => {
  const sessionId = (conversationId || random()).toString()
  const messages: ChatCompletionMessage[] = []

  // Get existing conversation if available
  if (conversationId) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', parseInt(conversationId))

    if (data?.[0]?.messages) {
      messages.push(
        ...data[0].messages.map((msg) => ({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
        })),
      )
    }
  }

  // Add system prompt
  messages.unshift({
    role: 'assistant',
    content: systemPromptTemplate(model === 'anthropic'),
    refusal: '',
  })

  // Add user input
  messages.push({
    role: 'user' as any,
    content: input,
    refusal: '',
  })

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        const completion = await createChatCompletion(
          messages,
          model === 'gpt-4o' ? fourOModel : model === 'o1-preview' ? oOneModel : threeModel,
          true,
        )

        let outputCache = ''

        for await (const chunk of completion as any) {
          const content = chunk.choices[0]?.delta?.content
          const toolCalls = chunk.choices[0]?.delta?.tool_calls

          if (content) {
            controller.enqueue(encoder.encode(content))
            outputCache += content
          }

          if (toolCalls) {
            const toolResponse = await handleToolCalls(toolCalls, messages, model)
            if (toolResponse) {
              for await (const toolChunk of toolResponse) {
                const toolContent = toolChunk.choices[0]?.delta?.content
                if (toolContent) {
                  controller.enqueue(encoder.encode(toolContent))
                  outputCache += toolContent
                }
              }
            }
          }
        }

        // Cache the conversation if needed
        if (!nocache && outputCache.length > 0) {
          // Save conversation in background
          Promise.all([
            supabase.from('conversations').upsert({
              id: parseInt(sessionId),
              conversationId: parseInt(sessionId),
              model,
              user,
              messages: [
                ...messages.filter((message) => message.role !== 'assistant'),
                { role: 'user', content: input },
                { role: 'assistant', content: outputCache },
              ],
            }),
            // saveToCache(Date.now(), input, outputCache, model, user),
            saveToZep(sessionId, [
              { role: 'user', content: input },
              { role: 'assistant', content: outputCache },
            ]),
          ]).catch(console.error)
        }

        controller.close()
      } catch (error) {
        console.error('Error in stream:', error)
        controller.error(error)
      }
    },
  })
}

export async function askQuestion(
  input: string = defaultQuestion,
  user: string,
  conversationId?: string,
  model?: string,
  nocache?: boolean,
): Promise<ReadableStream> {
  const response = await ask(input, user, conversationId, model, nocache)

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
    },
  })

  return response.pipeThrough(transformStream)
}
