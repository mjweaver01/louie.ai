import { tools } from './tools'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { createChatCompletion } from './clients/openai'
import { openai } from './clients/openai'
import { compiledDistillQueryPrompt } from './prompts'
import { threeModel } from './constants'

async function distillQuery(question: string, toolName: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: threeModel,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: compiledDistillQueryPrompt,
      },
      {
        role: 'user',
        content: question,
      },
    ],
  })

  console.log('[distillQuery]', completion.choices[0]?.message?.content)

  return completion.choices[0]?.message?.content?.toLowerCase() ?? question
}

export async function handleToolCalls(
  toolCalls: any,
  messages: ChatCompletionMessageParam[],
  model: string,
  currentToolCall: { id: string; name: string; arguments: string },
) {
  if (!toolCalls || !Array.isArray(toolCalls)) return null

  for (const call of toolCalls) {
    if (call.function?.name && call.function.name.length > 0) {
      currentToolCall.name = call.function.name
    }
    if (call.id && call.id.length > 0) {
      currentToolCall.id = call.id
    }
    if (call.function?.arguments && call.function.arguments.length > 0) {
      currentToolCall.arguments += call.function.arguments
    }
  }

  // Only proceed if we have a complete tool call with valid JSON
  if (
    currentToolCall.name &&
    currentToolCall.arguments &&
    currentToolCall.arguments.includes('}')
  ) {
    try {
      const tool = tools.find((t) => t.name === currentToolCall.name)
      if (!tool) {
        throw new Error(`Tool ${currentToolCall.name} not found`)
      }

      // Parse and execute the tool
      const args = JSON.parse(currentToolCall.arguments)
      const distilledQuery = await distillQuery(args.question, currentToolCall.name)
      const result = await tool.function(distilledQuery)

      // First add the assistant's message with the tool call
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: currentToolCall.id,
            type: 'function',
            function: {
              name: currentToolCall.name,
              arguments: currentToolCall.arguments,
            },
          },
        ],
      })

      // Add the tool response to messages
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: currentToolCall.id,
      })

      // Reset the tool call state after successful execution
      currentToolCall.id = ''
      currentToolCall.name = ''
      currentToolCall.arguments = ''

      // Get a new completion with the tool results
      return await createChatCompletion(messages, model, true)
    } catch (error) {
      console.error('Error executing tool:', error)
      return null
    }
  }

  return null
}
