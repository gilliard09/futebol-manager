import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Variáveis do Supabase não configuradas. Copie .env.example para .env.local e informe a chave publishable.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
