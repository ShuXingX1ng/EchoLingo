import { NextResponse } from "next/server"
import type { PteTaskType } from "@/types"

const API_TIMEOUT = 30000

type LlmResponse = {
  choices?: Array<{ message?: { content?: string } }>
  content?: Array<{ text?: string }>
  response?: string
  message?: string
}

const PROMPTS: Partial<Record<PteTaskType, string>> = {
  repeat_sentence:
    "Generate one clear, natural-sounding sentence (12–16 words) from an academic or professional context. " +
    "Respond with ONLY the sentence. No labels or punctuation other than the sentence itself.",

  answer_short_question:
    "Generate one PTE Academic Answer Short Question — a factual question with a single clear answer (1–4 words). " +
    "Format: Question on first line, Answer on second line, no other text. Example:\n" +
    "What is the chemical symbol for water?\nH2O",

  summarize_written_text:
    "Generate a 100–150 word academic passage on a topic from science, technology, environment, or society. " +
    "The passage should be self-contained and suitable for summarization. " +
    "Respond with ONLY the passage. No title, no labels.",

  write_essay:
    "Generate a PTE Academic Write Essay prompt (40–60 words). " +
    "Include the essay question and 2–3 discussion points or angles. " +
    "Topics: technology, environment, education, society, or globalisation. " +
    "Respond with ONLY the prompt text, no labels.",

  write_from_dictation:
    "Generate one academic sentence (10–14 words) suitable for dictation. " +
    "Clear vocabulary, no contractions, no ambiguous words. " +
    "Respond with ONLY the sentence.",

  personal_intro: "",

  re_tell_lecture:
    "Generate a short academic lecture excerpt (110–130 words) on a topic from science, technology, environment, health, or society. " +
    "It should sound like natural spoken academic English — use discourse markers (Firstly, However, In conclusion, etc.) and a clear main point with two or three supporting details. " +
    "Respond with ONLY the lecture text. No title, no labels, no speaker attribution.",
}

function extractText(data: LlmResponse): string {
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content
  if (Array.isArray(data.content)) return data.content.map((c) => c.text ?? "").join("")
  if (data.response) return data.response
  if (typeof data.message === "string") return data.message
  return ""
}

export async function POST(request: Request) {
  const { taskType } = await request.json() as { taskType: PteTaskType }

  if (!taskType) {
    return NextResponse.json({ error: "taskType is required" }, { status: 400 })
  }

  // Personal Introduction has a fixed prompt — no generation needed
  if (taskType === "personal_intro") {
    return NextResponse.json({ text: "" })
  }

  const userPrompt = PROMPTS[taskType]
  if (!userPrompt) {
    return NextResponse.json({ error: `No stimulus prompt for taskType: ${taskType}` }, { status: 400 })
  }

  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL

  if (!apiKey || !baseUrl || !model) {
    return NextResponse.json({ error: "LLM API configuration missing" }, { status: 500 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a PTE Academic test content creator. Follow instructions exactly." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 300,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return NextResponse.json({ error: `LLM API error (${res.status})` }, { status: 502 })
    }

    const data = (await res.json()) as LlmResponse
    const text = extractText(data).trim()

    if (!text) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 502 })
    }

    return NextResponse.json({ text })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Stimulus generation timed out" }, { status: 504 })
    }
    console.error("PTE stimulus error:", error)
    return NextResponse.json({ error: "Failed to generate stimulus" }, { status: 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
