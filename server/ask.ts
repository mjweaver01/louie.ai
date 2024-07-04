import langfuse from './langfuse'
import { supabase } from './supabase'
import { tools, kbTools } from './llm/tools'
import {
  gptSystemPromptTemplate,
  gistSystemPromptTemplate,
  kbSystemPromptTemplate,
} from './llm/prompts'
import { modelWithFunctions, kbModelWithFunctions } from './llm/openai'
import {
  llm as anthropicLlm,
  modelWithTools as anthropicModelWithTools,
  kbModelWithTools as anthropicKbModelWithTools,
} from './llm/anthropic'
import { defaultQuestion } from './constants'
import random from './idGenerator'

// langchain stuff
import { RunnableSequence } from '@langchain/core/runnables'
import { AgentExecutor, createToolCallingAgent, type AgentStep } from 'langchain/agents'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { formatToOpenAIFunctionMessages } from 'langchain/agents/format_scratchpad'
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser'
import { Runnable } from '@langchain/core/runnables'

export const ask = async (
  input: string,
  source: SourceType,
  user: string,
  conversationId?: string,
  model?: string,
): Promise<Answer> => {
  const isGist = source === 'gist'
  const isKb = source === 'kb'
  const isAnthropic = model === 'anthropic'

  console.log(`[${source}] Asking ${model || 'openai'}: ${JSON.stringify(input).substring(0, 100)}`)

  const currentPromptTemplate = isKb
    ? kbSystemPromptTemplate(isAnthropic)
    : isGist
    ? gistSystemPromptTemplate
    : gptSystemPromptTemplate
  const currentModelWithFunctions = isKb
    ? isAnthropic
      ? anthropicKbModelWithTools
      : kbModelWithFunctions
    : isAnthropic
    ? anthropicModelWithTools
    : modelWithFunctions

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('source', source)
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

  const runnableAgent = isAnthropic
    ? createToolCallingAgent({ llm: anthropicLlm(), tools: kbTools, prompt: currentPromptTemplate })
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
      ])

  const executor = isAnthropic
    ? new AgentExecutor({ agent: runnableAgent, tools: kbTools })
    : AgentExecutor.fromAgentAndTools({
        agent: runnableAgent,
        tools: isKb ? kbTools : tools,
      })
  const invokee = await executor.invoke(
    {
      input,
      chat_history: chatHistory,
    },
    {
      configurable: { sessionId: conversationId, isAnthropic: isAnthropic },
    },
  )

  // save to supabase
  if (conversationId && messages.length > 0) {
    const { error } = await supabase
      .from('conversations')
      .update([
        {
          messages: [
            ...messages,
            { role: 'user', content: invokee.input },
            { role: 'ai', content: invokee.output },
          ],
        },
      ])
      .eq('id', conversationId)
      .eq('user', user)
      .eq('source', source)

    if (error) {
      console.error(error.message)
    }
  } else {
    const { error } = await supabase.from('conversations').upsert({
      id: conversationId,
      source,
      user,
      messages: [
        ...messages,
        { role: 'user', content: invokee.input },
        { role: 'ai', content: invokee.output },
      ],
    })

    if (error) {
      console.error(error.message)
    }
  }

  return {
    ...(invokee as any),
    conversationId,
    source,
  }
}

export async function askQuestion(
  input: string = defaultQuestion,
  source: SourceType,
  user: string,
  conversationId?: string,
  model?: string,
): Promise<Answer> {
  const sessionId = conversationId || random()
  const trace = langfuse.trace({
    name: `ask-${source}`,
    input: JSON.stringify(input),
    sessionId,
    metadata: {
      source,
    },
  })

  const response = await ask(input, source, user, sessionId, model)

  trace.update({
    output: JSON.stringify(response?.output ?? response),
  })

  await langfuse.shutdownAsync()

  return response
}
