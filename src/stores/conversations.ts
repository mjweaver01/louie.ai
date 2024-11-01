import { defineStore } from 'pinia'
import { useUserStore } from './user'
import { useClientStore } from './client'
import { useMessagesStore } from './messages'

export const useConversationsStore = defineStore('conversations', {
  state: () => {
    return {
      nosupa: localStorage.getItem('nosupa') === 'true',
      conversations: localStorage.getItem('conversations')
        ? JSON.parse(localStorage.getItem('conversations'))
        : [],
    }
  },
  actions: {
    getConversations() {
      if (this.nosupa) return
      const client = useClientStore()
      const user = useUserStore()

      if (!client.client || !user.user) return

      client.client
        .from('conversations')
        .select('*')
        .eq('user', user.user.id)
        .order('created_at', { ascending: false })
        .then((res) => {
          this.conversations = res.data
          localStorage.setItem('conversations', JSON.stringify(res.data))
        })
    },

    setConversation(sentConversation) {
      if (this.nosupa) return
      const messages = useMessagesStore()
      messages.setConversation(sentConversation, true)
    },

    async deleteConversation(conversationId) {
      if (this.nosupa) return
      const client = useClientStore()
      const user = useUserStore()

      if (!client.client || !user.user) return

      try {
        await client.client
          .from('conversations')
          .delete()
          .eq('id', conversationId)
          .eq('user', user.user.id)

        this.conversations = this.conversations.filter((conv) => conv.id !== conversationId)
        localStorage.setItem('conversations', JSON.stringify(this.conversations))

        // Clear the current conversation if it's the one being deleted
        const messagesStore = useMessagesStore()
        if (messagesStore?.conversationId === conversationId) {
          messagesStore?.clearConversation()
        }
      } catch (error) {
        console.error('Error deleting conversation:', error)
      }
    },
  },
})
