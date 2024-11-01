<template>
  <div
    class="chat-page top"
    :class="{ empty: messagesStore?.messages?.length <= 0 }"
    @scroll="setUserScrolledUp"
  >
    <Hero v-if="!messagesStore?.loading && messagesStore?.messages?.length <= 0" />
    <Questions v-if="userStore?.user?.id" />
    <Messages v-if="userStore?.user?.id" :messages="messagesStore?.messages" />
  </div>
  <Chat v-if="userStore?.user?.id" />
</template>

<script>
import { mapStores } from 'pinia'
import { useUserStore } from '../stores/user'
import { useMessagesStore } from '../stores/messages'
import Hero from '../components/Hero.vue'
import Questions from '../components/Questions.vue'
import Messages from '../components/Messages.vue'
import Chat from '../components/Chat.vue'

export default {
  components: {
    Hero,
    Questions,
    Messages,
    Chat,
  },
  computed: {
    ...mapStores(useUserStore, useMessagesStore),
  },
  beforeMount() {
    const conversationId = this.$route.params.id
    if (conversationId?.length > 0) this.messagesStore?.getConversation(conversationId)

    const params = new URLSearchParams(window.location.search)
    const selectedModel = params.get('model')
    if (selectedModel?.length > 0) this.messagesStore.model = selectedModel
  },
  methods: {
    setUserScrolledUp(e) {
      let height = e.target.clientHeight
      let scrollHeight = e.target.scrollHeight - height
      let scrollTop = e.target.scrollTop
      let percent = Math.floor((scrollTop / scrollHeight) * 100)
      if (percent <= 99) {
        this.messagesStore.userScrolledUp = true
      } else {
        this.messagesStore.userScrolledUp = false
      }
    },
  },
}
</script>
