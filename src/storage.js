import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const storage = {
  async set(key, value, shared = false) {
    const table = key.startsWith("report_") ? "reports" : "submissions"
    const { error } = await supabase
      .from(table)
      .upsert({ id: key, data: JSON.parse(value) })
    if (error) throw new Error(error.message)
    return { key, value, shared }
  },

  async get(key, shared = false) {
    const table = key.startsWith("report_") ? "reports" : "submissions"
    const { data, error } = await supabase
      .from(table)
      .select("data")
      .eq("id", key)
      .single()
    if (error || !data) return null
    return { key, value: JSON.stringify(data.data), shared }
  },

  async list(prefix = "", shared = false) {
    const table = prefix.startsWith("report_") ? "reports" : "submissions"
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .like("id", `${prefix}%`)
    if (error || !data) return { keys: [] }
    return { keys: data.map(r => r.id), prefix, shared }
  },

  async delete(key, shared = false) {
    const table = key.startsWith("report_") ? "reports" : "submissions"
    const { error } = await supabase.from(table).delete().eq("id", key)
    if (error) throw new Error(error.message)
    return { key, deleted: true, shared }
  }
}
