import langfuse from './langfuse'
import { supabase } from './supabase'
import { kbTools } from './llm/tools'
import { kbSystemPromptTemplate } from './llm/prompts'
import { kbModelWithFunctions } from './llm/openai'
import { llm as anthropicLlm, kbModelWithTools as anthropicKbModelWithTools } from './llm/anthropic'
import { defaultQuestion } from './constants'
import random from './idGenerator'
import { saveToCache } from './cache'

// langchain stuff
import { RunnableSequence } from '@langchain/core/runnables'
import { AgentExecutor, createToolCallingAgent, type AgentStep } from 'langchain/agents'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { formatToOpenAIFunctionMessages } from 'langchain/agents/format_scratchpad'
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser'
import { Runnable, RunnablePassthrough } from '@langchain/core/runnables'

export const ask = async (
  input: string,
  user: string,
  conversationId?: string,
  model?: string,
): Promise<ReadableStream> => {
  console.log(`[ask] Asking ${model || 'openai'}: ${JSON.stringify(input).substring(0, 100)}`)
  const isAnthropic = model === 'anthropic'
  const currentPromptTemplate = kbSystemPromptTemplate(isAnthropic)
  const currentModelWithFunctions = isAnthropic ? anthropicKbModelWithTools : kbModelWithFunctions
  const sessionId = (conversationId || random()).toString()

  let query = supabase.from('conversations').select('*').eq('id', parseInt(sessionId))
  if (user && user !== 'anonymous') {
    query = query.eq('user', user)
  }
  const { data } = await query
  const messages = data?.[0]?.messages ?? []
  const chatHistory: BaseMessage[] = messages.map((message: { role: string; content: string }) => {
    if (message.role === 'ai') {
      return new AIMessage(JSON.stringify(message.content))
    } else {
      return new HumanMessage(JSON.stringify(message.content))
    }
  })

  const trace = langfuse.trace({
    name: `ask`,
    input: JSON.stringify(input),
    sessionId,
    metadata: {
      model,
    },
  })

  const runnableAgent = isAnthropic
    ? createToolCallingAgent({
        llm: anthropicLlm(),
        tools: kbTools as any,
        prompt: currentPromptTemplate,
      })
    : RunnableSequence.from([
        {
          input: (i: { input: string; steps: AgentStep[] }) => i.input,
          agent_scratchpad: (i: { input: string; steps: AgentStep[] }) =>
            formatToOpenAIFunctionMessages(i.steps),
          chat_history: (i: any) => i.chat_history,
        },
        currentPromptTemplate,
        currentModelWithFunctions as Runnable,
        new OpenAIFunctionsAgentOutputParser(),
      ] as any)
  const executor = isAnthropic
    ? new AgentExecutor({ agent: runnableAgent, tools: kbTools as any })
    : AgentExecutor.fromAgentAndTools({
        agent: runnableAgent,
        tools: kbTools as any,
      })

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()
  let outputCache = ''

  executor.invoke(
    {
      input,
      chat_history: chatHistory,
    },
    {
      configurable: { sessionId: sessionId, isAnthropic: isAnthropic },
      callbacks: [
        {
          handleLLMNewToken(token: string) {
            writer.write(encoder.encode(token))
            outputCache += token
          },
          async handleAgentEnd() {
            writer.write(encoder.encode(JSON.stringify({ conversationId: sessionId })))

            // need to check conversationId exists here, not sessionId
            if (conversationId && messages.length > 0) {
              const { error } = await supabase
                .from('conversations')
                .update([
                  {
                    messages: [
                      ...messages,
                      { role: 'user', content: input },
                      { role: 'ai', content: outputCache },
                    ],
                  },
                ])
                .eq('id', parseInt(sessionId))
                .eq('user', user)

              if (error) {
                console.error(error.message)
              }
            } else {
              const { error } = await supabase.from('conversations').upsert({
                id: parseInt(sessionId),
                user,
                messages: [
                  ...messages,
                  { role: 'user', content: input },
                  { role: 'ai', content: outputCache },
                ],
              })
              if (error) {
                console.error(error.message)
              }
            }

            await saveToCache(Date.now(), input, outputCache, model, user)

            trace.update({
              output: 'Streaming response completed' + JSON.stringify(outputCache),
            })
            langfuse.shutdownAsync()

            writer.close()
          },
        },
      ],
    },
  )

  return stream.readable
}

export async function askQuestion(
  input: string = defaultQuestion,
  user: string,
  conversationId?: string,
  model?: string,
): Promise<ReadableStream> {
  const response = await ask(input, user, conversationId, model)

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk)
    },
  })

  return response.pipeThrough(transformStream)
}
