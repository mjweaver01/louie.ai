import {
  systemPrompt,
  kbToolPrompt,
  salesToolPrompt,
  anthropicNudge,
  personalizationToolPrompt,
  distillQueryToolPrompt,
} from './constants'
import langfuse from './clients/langfuse'

export const formatMessages = (
  systemMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  input: string,
  agentScratchpad?: string,
  isAnthropic?: boolean,
) => {
  const messages = [{ role: 'system', content: systemMessage }, ...chatHistory]

  if (isAnthropic) {
    messages.push({ role: 'user', content: anthropicNudge })
  }

  if (agentScratchpad) {
    messages.push({ role: 'assistant', content: agentScratchpad })
  }

  messages.push({ role: 'user', content: input })

  return messages
}

// Fetch prompts from langfuse with fallbacks
const SystemPrompt = await langfuse.getPrompt('SYSTEM_PROMPT')
export const compiledSystemPrompt = SystemPrompt.prompt ? SystemPrompt.prompt : systemPrompt
export const systemPromptTemplate = (isAnthropic = false) => compiledSystemPrompt

const KbToolPrompt = await langfuse.getPrompt('KB_TOOL_PROMPT')
export const compiledKbToolPrompt = KbToolPrompt.prompt ? KbToolPrompt.prompt : kbToolPrompt

const salesPrompt = await langfuse.getPrompt('SALES_TOOL_PROMPT')
export const compiledSalesPrompt = salesPrompt.prompt ? salesPrompt.prompt : salesToolPrompt

const personalizationPrompt = await langfuse.getPrompt('PERSONALIZATION_TOOL_PROMPT')
export const compiledPersonalizationPrompt = personalizationPrompt
  ? personalizationPrompt.prompt
  : personalizationToolPrompt

const distillQueryPrompt = await langfuse.getPrompt('DISTILL_QUERY_PROMPT')
export const compiledDistillQueryPrompt = distillQueryPrompt.prompt
  ? distillQueryPrompt.prompt
  : distillQueryToolPrompt
