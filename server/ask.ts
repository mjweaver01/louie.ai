import type { ChatCompletionMessage, ChatCompletionRole } from 'openai/resources/chat/completions'
import { supabase } from './clients/supabase'
import { systemPromptTemplate } from './prompts'
import { defaultQuestion } from './constants'
import random from './idGenerator'
import { saveToCache } from './cache'
import { createChatCompletion } from './clients/openai'
import { models } from './constants'
import { handleToolCalls } from './handleToolCalls'

export const ask = async (
  input: string,
  user: string,
  conversationId?: string,
  model?: string,
  nocache?: boolean,
  nosupa?: boolean,
): Promise<ReadableStream> => {
  const sessionId = (conversationId || random()).toString()
  const messages = []

  // Create a persistent tool call object outside the stream
  let currentToolCall = {
    id: '',
    name: '',
    arguments: '',
  }

  // Get existing conversation if available
  if (conversationId && !nosupa) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', parseInt(conversationId))

    if (data?.[0]?.messages) {
      messages.push(
        ...data[0].messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      )
    }
  }

  if (messages.length === 0) {
    // Add system prompt
    messages.unshift({
      role: 'system',
      content: systemPromptTemplate(model === 'anthropic'),
      refusal: '',
    })
  }

  // Add user input
  messages.push({
    role: 'user',
    content: input,
    refusal: '',
  })

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        const completion = await createChatCompletion(messages, models[model], true)

        let outputCache = ''

        for await (const chunk of completion as any) {
          const content = chunk.choices[0]?.delta?.content
          const toolCalls = chunk.choices[0]?.delta?.tool_calls

          if (content) {
            controller.enqueue(encoder.encode(content))
            outputCache += content
          }

          // Handle the tool calls with persistent state
          // second stream will be handled here
          if (toolCalls) {
            const toolResult = await handleToolCalls(
              toolCalls,
              messages,
              models[model],
              currentToolCall,
            )
            if (toolResult) {
              for await (const chunk of toolResult as any) {
                const content = chunk.choices[0]?.delta?.content
                if (content) {
                  controller.enqueue(encoder.encode(content))
                  outputCache += content
                }
              }
            }
          }
        }

        // Cache the conversation if needed
        if (!nosupa && outputCache.length > 0) {
          // Save conversation in background
          await Promise.allSettled([
            (async () => {
              const { data: existingConversation } = await supabase
                .from('conversations')
                .select('messages')
                .eq('id', parseInt(conversationId))
                .single()

              if (existingConversation) {
                await supabase
                  .from('conversations')
                  .update({
                    messages: [
                      ...messages.filter(
                        (msg: ChatCompletionMessage, index: number) =>
                          msg.content &&
                          msg.content.length > 0 &&
                          msg.role !== ('system' as ChatCompletionRole) &&
                          msg.role !== ('tool' as ChatCompletionRole),
                      ),
                      { role: 'assistant', content: outputCache },
                    ],
                  })
                  .eq('id', parseInt(conversationId))
              } else {
                await supabase.from('conversations').insert({
                  id: parseInt(sessionId),
                  conversationId: parseInt(sessionId),
                  model: models[model],
                  user,
                  messages: [
                    ...messages.filter(
                      (msg: ChatCompletionMessage, index: number) =>
                        msg.content &&
                        msg.content.length > 0 &&
                        msg.role !== ('system' as ChatCompletionRole) &&
                        msg.role !== ('tool' as ChatCompletionRole),
                    ),
                    { role: 'assistant', content: outputCache },
                  ],
                })
              }
            })(),
            (async () =>
              !nocache && (await saveToCache(Date.now(), input, outputCache, model, user)))(),
          ])
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
  nosupa?: boolean,
): Promise<ReadableStream> {
  const response = await ask(input, user, conversationId, model, nocache, nosupa)

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
    },
  })

  return response.pipeThrough(transformStream)
}
