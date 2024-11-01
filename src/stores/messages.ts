import { nextTick } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import { useConversationsStore } from './conversations'
import { useRouter } from 'vue-router'
import { models } from '../../server/constants'

export const useMessagesStore = defineStore('messages', {
  state: () => ({
    messages: [],
    question: '',
    conversationId: '',
    loading: false,
    model: 'gpt-4o',
    router: useRouter(),
    nocache: localStorage.getItem('nocache') === 'true',
    nosupa: localStorage.getItem('nosupa') === 'true',
    streaming: false,
    userScrolledUp: false,
  }),
  actions: {
    async ask(sentQuestion = '') {
      const user = useUserStore()
      const conversations = useConversationsStore()

      const question =
        sentQuestion?.trim() !== ''
          ? sentQuestion?.trim()
          : this.question.trim() !== ''
          ? this.question.trim()
          : false
      if (!question || question.length <= 0) return

      this.loading = true
      this.userScrolledUp = false
      this.scrollToBottom()
      this.question = ''

      this.messages.push({
        content: question,
        isUser: true,
      })

      // set nocache on each question for ability to turn it on and off
      if (window.location.search.includes('nocache=true')) {
        this.nocache = true
      } else if (window.location.search.includes('nocache=false')) {
        this.nocache = false
      }

      // Initialize the AbortController
      this.abortController = new AbortController()

      const response = await fetch(`/.netlify/functions/ask${window.location.search}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          conversationId: this.conversationId,
          model: this.model,
          user: this.isDefaultQuestion ? 'anonymous' : user?.user?.id,
          nocache: this.nocache,
          nosupa: this.nosupa,
        }),
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        this.loading = false
        this.messages.push({
          text: "I'm sorry, I'm having trouble understanding you. Please try again.",
        })
        return
      }

      // Check if the response is JSON (cached) or stream
      const contentType = response.headers.get('Content-Type')
      if (contentType && contentType.includes('application/json')) {
        // Handle cached response
        const cachedData = await response.json()
        this.loading = false
        this.messages.push({
          text: cachedData.answer,
          isUser: false,
        })
        if (cachedData.conversationId) {
          this.conversationId = cachedData.conversationId
          this.router.push(`/chat/${cachedData.conversationId}`)
          this.mathjax()
        }

        conversations.getConversations()
        return
      }

      // Handle streaming response
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let aiMessage = { text: '', isUser: false }
      this.messages.push(aiMessage)
      let receivedConversationId = null
      this.streaming = true

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          this.streaming = false
          this.mathjax()
          break
        }
        const chunk = decoder.decode(value)
        if (chunk.length > 0) {
          this.loading = false

          const match = chunk.match(/(\{.*?\})(.*)/)
          if (match) {
            try {
              const jsonData = JSON.parse(match[1])
              if (jsonData.conversationId) {
                receivedConversationId = jsonData.conversationId
              }
              this.messages[this.messages.length - 1].text += this.fixIncompleteMarkdownLinks(
                match[2],
              )
            } catch (e) {
              console.error('Error parsing JSON:', e)
              this.messages[this.messages.length - 1].text += this.fixIncompleteMarkdownLinks(chunk)
            }
          } else {
            this.messages[this.messages.length - 1].text += this.fixIncompleteMarkdownLinks(chunk)
          }
          this.scrollToBottom()
        }
      }

      // Finalize the last message
      this.messages[this.messages.length - 1].text = this.finalizeMarkdown(
        this.messages[this.messages.length - 1].text,
      )

      // when it's done
      this.loading = false
      this.scrollToBottom()

      if (receivedConversationId) {
        this.conversationId = receivedConversationId
        this.router.push(`/chat/${receivedConversationId}`)
      }

      conversations.getConversations()
    },

    setPrevousQuestion() {
      if (this.messages.length > 1) {
        const prevUserQuestion = this.messages[this.messages.length - 2]
        this.question = prevUserQuestion.content
      }
    },

    cancelStream() {
      if (this.abortController) {
        this.abortController.abort()
        this.loading = false
        this.streaming = false
        this.messages.push({
          text: 'Stream has been canceled.',
          isUser: false,
        })
        this.scrollToBottom()
      }
    },

    mathjax() {
      if (typeof window !== 'undefined' && window.MathJax) {
        nextTick(() => {
          window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub])
        })
      }
    },

    fixIncompleteMarkdownLinks(text) {
      return text.replace(/\[([^\]]+)\]\(([^)]+)$/g, (match, p1, p2) => `[${p1}](${p2})`)
    },

    finalizeMarkdown(text) {
      // This regex matches any markdown link that's not closed properly
      const incompleteLink = /\[([^\]]+)\]\(([^)]+)$/
      const match = text.match(incompleteLink)
      if (match) {
        // If there's an incomplete link at the end, close it
        return text + ')'
      }

      // remove quotes on either end
      return text.replaceAll('^"|"$', '')
    },

    async getConversation(sentConversation) {
      const user = useUserStore()
      fetch(`/.netlify/functions/get-conversation${window.location.search}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: sentConversation,
          user: this.isDefaultQuestion ? 'anonymous' : user?.user?.id,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.conversation && data.conversation.messages) {
            this.setConversation(data.conversation, true)
          } else {
            this.clearConversation()
          }
        })
    },

    scrollToBottom() {
      nextTick(() => {
        document.getElementById('question-input')?.focus()
        const chat = document.querySelector('.chat-page')

        if (chat && !this.userScrolledUp) {
          chat.scrollTop = chat.scrollHeight
        }
      })
    },

    scrollToTop() {
      nextTick(() => {
        const chat = document.querySelector('.chat-page')
        if (chat) {
          chat.scrollTop = 0
        }
      })
    },

    clearConversation() {
      this.messages = []
      this.question = ''
      this.conversationId = ''
      this.router.push(`/`)
    },

    setConversation(sentConversation, scrollToTop = false) {
      this.messages = sentConversation.messages
      this.model = this.resolveModel(sentConversation.model)
      this.conversationId = sentConversation.id
      this.router.push(`/chat/${this.conversationId}`)
      if (scrollToTop) {
        this.scrollToTop()
      } else {
        this.scrollToBottom()
      }
      this.mathjax()
    },

    resolveModel(model) {
      return models[model] ? model : 'gpt-4o'
    },

    sanitizeMessage(message) {
      return this.converter.makeHtml(message)
    },
  },
})
