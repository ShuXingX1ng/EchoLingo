import { NextResponse } from "next/server"
import type { PronunciationAssessmentResult, TaskFeedback } from "@/types"

const API_TIMEOUT = 60000

type LlmResponse = {
  choices?: Array<{ message?: { content?: string } }>
  content?: Array<{ text?: string }>
  response?: string
  message?: string
}

const FEEDBACK_SYSTEM_PROMPT = `You are a PTE Academic examiner evaluating a Read Aloud response.

The candidate was shown a written passage and asked to read it aloud. Evaluate their spoken performance
against the three PTE Read Aloud criteria:

- Content (40 %): How accurately did they read each word? Note substitutions, additions, omissions.
- Oral Fluency (30 %): Natural rhythm and phrasing, smooth connected speech, appropriate pace.
- Pronunciation (30 %): Clear articulation, correct stress patterns, intelligibility.

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Return exactly this structure:
{
  "summary": "<2-3 sentence overall assessment covering all three criteria>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<actionable suggestion1>", "<actionable suggestion2>"],
  "details": {
    "taskType": "read_aloud",
    "oralFluency": "<specific feedback on fluency, rhythm, pacing, connected speech>",
    "pronunciation": "<specific feedback on pronunciation, stress, articulation, intelligibility>"
  }
}`

function extractText(data: LlmResponse): string {
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content
  if (Array.isArray(data.content)) return data.content.map((c) => c.text ?? "").join("")
  if (data.response) return data.response
  if (typeof data.message === "string") return data.message
  return ""
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      stimulus: string
      transcript: string
      pronunciationAssessment?: PronunciationAssessmentResult
    }

    const { stimulus, transcript, pronunciationAssessment } = body

    if (!stimulus?.trim() || !transcript?.trim()) {
      return NextResponse.json({ error: "stimulus and transcript are required" }, { status: 400 })
    }

    const apiKey = process.env.LLM_API_KEY
    const baseUrl = process.env.LLM_BASE_URL
    const model = process.env.LLM_MODEL

    if (!apiKey || !baseUrl || !model) {
      return NextResponse.json({ error: "LLM API configuration missing" }, { status: 500 })
    }

    const pronunciationCtx = pronunciationAssessment
      ? `\n\nAzure Pronunciation Assessment (use these scores to calibrate your feedback):\n` +
        `  Overall: ${pronunciationAssessment.score}/100\n` +
        `  Accuracy: ${pronunciationAssessment.accuracyScore}/100\n` +
        `  Fluency: ${pronunciationAssessment.fluencyScore}/100\n` +
        `  Completeness: ${pronunciationAssessment.completenessScore}/100`
      : ""

    const userContent =
      `Stimulus passage:\n${stimulus}\n\n` +
      `Candidate transcript (what they actually said):\n${transcript}` +
      pronunciationCtx

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: FEEDBACK_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      return NextResponse.json({ error: `LLM API error (${response.status})` }, { status: 502 })
    }

    const data = (await response.json()) as LlmResponse
    const content = extractText(data).trim()

    if (!content) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 502 })
    }

    const parseAndMerge = (raw: string): TaskFeedback => {
      const parsed = JSON.parse(raw)
      if (pronunciationAssessment) {
        parsed.pronunciationAssessment = pronunciationAssessment
      }
      return parsed as TaskFeedback
    }

    try {
      return NextResponse.json(parseAndMerge(content))
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return NextResponse.json(parseAndMerge(match[0]))
        } catch {
          // fall through
        }
      }
      return NextResponse.json({ error: "Invalid feedback format from LLM" }, { status: 502 })
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Feedback generation timed out" }, { status: 504 })
    }
    console.error("Read Aloud feedback error:", error)
    return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 })
  }
}
