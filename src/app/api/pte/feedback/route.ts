import { NextResponse } from "next/server"
import type { PteTaskType, TaskFeedback, PronunciationAssessmentResult } from "@/types"

const API_TIMEOUT = 60000

type LlmResponse = {
  choices?: Array<{ message?: { content?: string } }>
  content?: Array<{ text?: string }>
  response?: string
  message?: string
}

// PTE-specific system prompts per task type
const SYSTEM_PROMPTS: Record<PteTaskType, string> = {
  repeat_sentence: `You are a PTE Academic examiner evaluating a Repeat Sentence response.
The candidate listened to a sentence once and attempted to repeat it verbatim.
Criteria: Content accuracy (did they repeat all words correctly?), Oral Fluency, Pronunciation.
Rate harshly on content — omissions or substitutions significantly reduce the score.`,

  answer_short_question: `You are a PTE Academic examiner evaluating an Answer Short Question response.
The candidate heard a factual question and gave a spoken answer.
Focus entirely on Content Accuracy: was the answer correct or close to correct?
The correct answer is shown in the stimulus. Do not penalize grammar or pronunciation heavily.`,

  summarize_written_text: `You are a PTE Academic examiner evaluating a Summarize Written Text response.
The candidate read a passage and wrote a one-sentence summary.
Criteria: Content (does it capture the main idea?), Form (is it one sentence?), Grammar, Vocabulary.`,

  write_essay: `You are a PTE Academic examiner evaluating a Write Essay response.
Criteria: Content (task response, development of ideas), Form (word count, structure), Grammar Range and Accuracy, Vocabulary Range.
A good essay is 200–300 words, well-structured, with varied vocabulary and grammar.`,

  personal_intro: `You are a PTE Academic evaluator reviewing a Personal Introduction.
This is unscored in the real exam, but give helpful feedback on fluency, coherence, and self-expression.
Be encouraging. Focus on what they communicated well and how to make it more natural.`,

  write_from_dictation: `You are a PTE Academic examiner evaluating a Write from Dictation response.
The candidate listened to a sentence and typed what they heard.
Focus on: word accuracy (every word counts), spelling, completeness.
Note every word that was omitted, misspelled, or substituted.`,

  read_aloud: `You are a PTE Academic examiner evaluating a Read Aloud response.
Criteria: Content, Oral Fluency, Pronunciation.`,

  describe_image: `You are a PTE Academic examiner evaluating a Describe Image response.
The candidate was shown an image (chart, graph, map, or photograph) for 25 seconds, then had 40 seconds to describe it aloud.
Criteria: Content Coverage (did they identify the image type and describe the key features, trends, or comparisons?), Oral Fluency, Pronunciation.
A strong response names the image type, identifies the main subject, highlights key data points or comparisons, and draws a brief conclusion.`,

  re_tell_lecture: `You are a PTE Academic examiner evaluating a Re-tell Lecture response.
The candidate listened to a short lecture (~60 seconds), had 10 seconds to prepare, then had 40 seconds to re-tell it aloud.
Criteria: Content Accuracy (did they capture the main points and key details from the lecture?), Oral Fluency, Pronunciation.
A strong response identifies the topic, covers the main argument and supporting points in sequence, and uses appropriate academic language.`,
}

const JSON_SCHEMA = `
You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<suggestion1>", "<suggestion2>"],
  "details": { /* task-specific details per schema below */ }
}`

const DETAILS_SCHEMA: Record<PteTaskType, string> = {
  repeat_sentence: `"details": { "taskType": "repeat_sentence", "oralFluency": "<feedback>", "pronunciation": "<feedback>" }`,
  answer_short_question: `"details": { "taskType": "answer_short_question", "contentAccuracy": "<was the answer correct? what was right/wrong?>" }`,
  summarize_written_text: `"details": { "taskType": "summarize_written_text", "content": "<did it capture main idea?>", "grammar": "<grammar feedback>", "vocabulary": "<vocabulary feedback>", "structure": "<one sentence? word count?>" }`,
  write_essay: `"details": { "taskType": "write_essay", "content": "<task response quality>", "grammar": "<grammar feedback>", "vocabulary": "<vocabulary feedback>", "structure": "<structure and coherence>" }`,
  personal_intro: `"details": { "taskType": "personal_intro", "content": "<what they communicated>", "grammar": "<grammar notes>", "vocabulary": "<vocabulary notes>" }`,
  write_from_dictation: `"details": { "taskType": "write_from_dictation", "wordAccuracy": "<which words were correct, omitted, misspelled, or substituted>" }`,
  read_aloud: `"details": { "taskType": "read_aloud", "oralFluency": "<feedback>", "pronunciation": "<feedback>" }`,
  describe_image: `"details": { "taskType": "describe_image", "contentCoverage": "<did they identify image type and key features/trends/comparisons?>", "fluency": "<oral fluency and delivery feedback>" }`,
  re_tell_lecture: `"details": { "taskType": "re_tell_lecture", "contentAccuracy": "<which key points did they capture or miss from the lecture?>", "fluency": "<oral fluency and delivery feedback>" }`,
}

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
      taskType: PteTaskType
      stimulus: string
      response: string
      pronunciationAssessment?: PronunciationAssessmentResult
    }

    const { taskType, stimulus, response: candidateResponse, pronunciationAssessment } = body

    if (!taskType || !candidateResponse?.trim()) {
      return NextResponse.json({ error: "taskType and response are required" }, { status: 400 })
    }

    const apiKey = process.env.LLM_API_KEY
    const baseUrl = process.env.LLM_BASE_URL
    const model = process.env.LLM_MODEL

    if (!apiKey || !baseUrl || !model) {
      return NextResponse.json({ error: "LLM API configuration missing" }, { status: 500 })
    }

    const systemPrompt = [
      SYSTEM_PROMPTS[taskType],
      JSON_SCHEMA,
      `Use this details schema: ${DETAILS_SCHEMA[taskType]}`,
    ].join("\n\n")

    const pronunciationCtx = pronunciationAssessment
      ? `\n\nAzure Pronunciation scores — Overall: ${pronunciationAssessment.score}, ` +
        `Accuracy: ${pronunciationAssessment.accuracyScore}, Fluency: ${pronunciationAssessment.fluencyScore}, ` +
        `Completeness: ${pronunciationAssessment.completenessScore}`
      : ""

    const userContent = stimulus
      ? `Stimulus:\n${stimulus}\n\nCandidate response:\n${candidateResponse}${pronunciationCtx}`
      : `Candidate response:\n${candidateResponse}${pronunciationCtx}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: 900,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      return NextResponse.json({ error: `LLM API error (${res.status})` }, { status: 502 })
    }

    const data = (await res.json()) as LlmResponse
    const content = extractText(data).trim()

    if (!content) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 502 })
    }

    const parse = (raw: string): TaskFeedback => {
      const parsed = JSON.parse(raw) as TaskFeedback
      if (pronunciationAssessment) parsed.pronunciationAssessment = pronunciationAssessment
      return parsed
    }

    try {
      return NextResponse.json(parse(content))
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try { return NextResponse.json(parse(match[0])) } catch { /* fall through */ }
      }
      return NextResponse.json({ error: "Invalid feedback format from LLM" }, { status: 502 })
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Feedback generation timed out" }, { status: 504 })
    }
    console.error("PTE feedback error:", error)
    return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 })
  }
}
