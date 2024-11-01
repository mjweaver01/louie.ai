import { embeddings } from '../clients/openai'
import { searchShopify } from '../clients/shopify'
// import { sitemapVector } from './sitemapVector'

const OPEN_AI_LIMIT = 5
const ANTHROPIC_LIMIT = 10

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  return dotProduct / (magnitudeA * magnitudeB)
}

export async function vector(text: string, isAnthropic = false, isSales = false) {
  try {
    // Ensure text is not undefined or empty
    if (!text || typeof text !== 'string') {
      console.error('[vector] Invalid input text:', text)
      return []
    }

    console.log(`[vector:${isSales ? 'sales_tool' : 'knowledge_base'}] searching "${text}"`)
    const vectorLimit = isAnthropic ? ANTHROPIC_LIMIT : OPEN_AI_LIMIT

    let currentDocs = await searchShopify(text, isSales)
    if (!Array.isArray(currentDocs) || currentDocs.length === 0) {
      console.warn('[vector] No valid documents returned from search')
      return []
    }

    // we don't really need this right now, and it fails a lot
    // try {
    //   // Get embeddings for the question
    //   const questionEmbedding = await embeddings(text)
    //   if (!Array.isArray(questionEmbedding)) {
    //     console.error('[vector] Invalid question embedding format')
    //     return []
    //   }

    //   // Get embeddings for documents
    //   const docEmbeddings = await Promise.all(
    //     currentDocs.map(async (doc) => {
    //       try {
    //         const embedding = await embeddings(JSON.stringify(doc))
    //         return {
    //           ...doc,
    //           embedding,
    //         }
    //       } catch (err) {
    //         console.error('[vector] Error getting document embedding:', err)
    //         return currentDocs
    //       }
    //     }),
    //   )

    //   // Filter out failed embeddings and calculate similarity
    //   const results = docEmbeddings
    //     .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    //     .map((doc) => ({
    //       ...doc,
    //       similarity: cosineSimilarity(questionEmbedding, doc.embedding),
    //     }))
    //     .sort((a, b) => b.similarity - a.similarity)
    //     .slice(0, vectorLimit)

    //   return results
    // } catch (error) {
    //   console.error('[vector] Error, returning raw docs:', error)
    //   return currentDocs
    // }

    return currentDocs
  } catch (error) {
    console.error('[vector] Error:', error)
    return []
  }
}
