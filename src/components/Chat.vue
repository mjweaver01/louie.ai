<template>
  <div class="current-message">
    <div class="current-message-inner">
      <div
        class="clear"
        v-if="messagesStore?.messages?.length > 0"
        @click="messagesStore?.clearConversation"
      >
        Clear conversation
      </div>
      <div class="ask-question" v-if="userStore?.user?.id">
        <form @submit.prevent="messagesStore?.ask()">
          <div class="input-wrapper">
            <textarea
              rows="1"
              id="question-input"
              name="question"
              placeholder="Ask anything..."
              v-model="messagesStore.question"
              @keydown.enter.exact.prevent="messagesStore?.ask()"
              @keydown.up.exact.prevent="messagesStore?.setPrevousQuestion()"
            />
            <div class="select">
              <select v-model="messagesStore.llm" @change="messagesStore?.setLlm">
                <option value="openai">GPT-4o</option>
                <option value="anthropic">Claude Sonnet</option>
              </select>
            </div>
          </div>
          <button v-if="messagesStore?.streaming" @click="messagesStore?.cancelStream()">
            <i class="pi pi-stop-circle"></i>
          </button>
          <button type="submit" :disabled="messagesStore?.loading" v-else>
            <i class="pi pi-send"></i>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { mapStores } from 'pinia'
import { useUserStore } from '../stores/user'
import { useMessagesStore } from '../stores/messages'

export default {
  computed: {
    ...mapStores(useUserStore, useMessagesStore),
  },
}
</script>

<style scoped></style>
