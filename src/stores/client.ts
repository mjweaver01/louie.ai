import { createClient } from '@supabase/supabase-js'
import { defineStore } from 'pinia'

export const useClientStore = defineStore('client', {
  state: () => ({
    client:
      localStorage.getItem('nosupa') === 'true'
        ? null
        : createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_PRIVATE_KEY,
          ),
  }),
})
