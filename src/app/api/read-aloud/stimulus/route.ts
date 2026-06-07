import { NextResponse } from "next/server"

const API_TIMEOUT = 30000

type LlmResponse = {
  choices?: Array<{ message?: { content?: string } }>
  content?: Array<{ text?: string }>
  response?: string
  message?: string
}

const STIMULUS_SYSTEM_PROMPT = `You are a PTE Academic test content creator.

Generate a Read Aloud stimulus passage for the PTE Academic Speaking section.

Requirements:
- Length: 50–70 words exactly
- Academic register: formal, informative, suitable for educated adult readers
- Topics: science, technology, environment, history, society, medicine, or economics
- Clear sentence structure with natural spoken rhythm
- Avoid idioms, contractions, or informal language
- No questions, no bullet points, no headings — flowing prose only

Respond with ONLY the passage text. No titles, no labels, no extra commentary.`

function extractText(data: LlmResponse): string {
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content
  if (Array.isArray(data.content)) return data.content.map((c) => c.text ?? "").join("")
  if (data.response) return data.response
  if (typeof data.message === "string") return data.message
  return ""
}

export async function POST() {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ error: "LLM API configuration missing" }, { status: 500 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: STIMULUS_SYSTEM_PROMPT },
          { role: "user", content: "Generate a Read Aloud passage now." },
        ],
        temperature: 0.85,
        max_tokens: 200,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return NextResponse.json({ error: `LLM API error (${response.status})` }, { status: 502 })
    }

    const data = (await response.json()) as LlmResponse
    const text = extractText(data).trim()

    if (!text) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 502 })
    }

    return NextResponse.json({ text })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Stimulus generation timed out" }, { status: 504 })
    }
    console.error("Stimulus generation error:", error)
    return NextResponse.json({ error: "Failed to generate stimulus" }, { status: 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
