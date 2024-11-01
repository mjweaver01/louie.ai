import langfuse from './clients/langfuse'
import { compiledKbToolPrompt, compiledSalesPrompt, compiledPersonalizationPrompt } from './prompts'
import { vector } from './vector/vector'

export const tools = [
  {
    name: 'knowledge_base',
    type: 'function',
    description: compiledKbToolPrompt,
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to search for in the knowledge base',
        },
      },
      required: ['question'],
    },
    function: async (question: string, meta?: any) => {
      const isAnthropic = meta?.configurable?.isAnthropic

      const generation = await langfuse.generation({
        name: 'knowledge_base',
        input: JSON.stringify(question),
        model: 'knowledge_base',
      })

      await generation.update({
        completionStartTime: new Date(),
      })

      try {
        const results = await vector(question, isAnthropic)

        if (results.length > 0) {
          console.log(
            `[knowledge_base] found ${results.length} result${results.length !== 1 ? 's' : ''}`,
          )
        }

        await generation.end({
          output: JSON.stringify(results[0]),
          level: 'DEFAULT',
        })

        return results
      } catch (error) {
        await generation.end({
          output: JSON.stringify(error),
          level: 'ERROR',
        })
        console.log('[knowledge_base] error in kb tool')
        return []
      } finally {
        await langfuse.shutdownAsync()
      }
    },
  },
  {
    name: 'sales_tool',
    type: 'function',
    description: compiledSalesPrompt,
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The product search query',
        },
      },
      required: ['question'],
    },
    function: async (question: string, meta?: any) => {
      const isAnthropic = meta?.configurable?.isAnthropic

      const generation = await langfuse.generation({
        name: 'sales_tool',
        input: JSON.stringify(question),
        model: 'sales_tool',
      })

      await generation.update({
        completionStartTime: new Date(),
      })

      try {
        const results = await vector(question, isAnthropic, true)

        if (results.length > 0) {
          console.log(
            `[sales_tool] found ${results.length} result${results.length !== 1 ? 's' : ''}`,
          )
        }

        await generation.end({
          output: JSON.stringify(results[0]),
          level: 'DEFAULT',
        })

        return results
      } catch (error) {
        await generation.end({
          output: JSON.stringify(error),
          level: 'ERROR',
        })
        console.log('[sales_tool] error in sales tool')
        return []
      } finally {
        await langfuse.shutdownAsync()
      }
    },
  },
]
