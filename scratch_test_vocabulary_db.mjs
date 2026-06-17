import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testVocabulary() {
  console.log("Testing vocabulary table...")
  
  // Try to select from vocabulary
  // We are anon, so we expect to get an empty array or maybe an RLS policy restriction,
  // but importantly we should NOT get a 'relation "vocabulary" does not exist' error.
  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .limit(1)

  if (error) {
    console.error("Query failed with error:", error.message)
    if (error.message.includes("relation") && error.message.includes("does not exist")) {
      console.error("❌ Table 'vocabulary' does not exist. Migration was not run or failed.")
      process.exit(1)
    }
  } else {
    console.log("✅ Query succeeded! Data:", data)
    console.log("The 'vocabulary' table exists and is accessible.")
  }
}

testVocabulary()
