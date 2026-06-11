import { NextResponse } from "next/server"
import type {
  PteTaskType,
  TaskFeedback,
  PronunciationAssessmentResult,
  DimensionScores,
  ReadingDimensionScores,
  ListeningDimensionScores,
  JudgeLog,
} from "@/types"

const API_TIMEOUT = 120000
const JUDGE_TIMEOUT = 60000

type LlmResponse = {
  choices?: Array<{ message?: { content?: string } }>
  content?: Array<{ text?: string }>
  response?: string
  message?: string
}

// Speaking task types that receive per-dimension scoring
const SCORED_SPEAKING = new Set<PteTaskType>([
  "read_aloud",
  "repeat_sentence",
  "answer_short_question",
  "describe_image",
  "re_tell_lecture",
])

// Writing task types that receive per-dimension scoring
const SCORED_WRITING = new Set<PteTaskType>([
  "summarize_written_text",
  "write_essay",
])

// Reading task types that receive per-dimension scoring
const SCORED_READING = new Set<PteTaskType>([
  "fill_in_the_blanks_reading",
  "re_order_paragraphs",
  "multiple_choice_reading",
])

// Listening task types that receive per-dimension scoring
const SCORED_LISTENING = new Set<PteTaskType>([
  "summarize_spoken_text",
  "fill_in_the_blanks_listening",
  "highlight_correct_summary",
])

// PTE-specific examiner prompts per task type
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

  fill_in_the_blanks_reading: `You are a PTE Academic examiner evaluating a Fill in the Blanks (Reading) response.
The stimulus shows the passage with the correct answers marked. The response shows which options the learner selected and whether each was correct.
Focus on: accuracy (which blanks were correct and which were wrong), vocabulary understanding in context, and patterns in errors.`,

  re_order_paragraphs: `You are a PTE Academic examiner evaluating a Re-order Paragraphs response.
The stimulus shows the paragraphs in correct order. The response shows the learner's submitted order.
Focus on: how many paragraphs were in the correct position, understanding of discourse markers and paragraph cohesion, and logical flow comprehension.`,

  multiple_choice_reading: `You are a PTE Academic examiner evaluating a Multiple Choice (Reading) response.
The stimulus shows the passage, question, and all options. The response shows the learner's selection and whether it was correct.
Focus on: reading comprehension accuracy, understanding of main idea vs supporting details, and any misconceptions revealed by the wrong choice if applicable.`,

  summarize_spoken_text: `You are a PTE Academic examiner evaluating a Summarize Spoken Text response.
The candidate listened to a short audio passage and then wrote a 50–70 word summary.
The original passage text is shown in the stimulus.
Criteria: Content accuracy (did they capture the main idea and key points?), Writing quality (grammar, vocabulary, summary length 50–70 words).
A strong response identifies the topic, covers the main point and key supporting details in coherent written prose.`,

  fill_in_the_blanks_listening: `You are a PTE Academic examiner evaluating a Fill in the Blanks (Listening) response.
The candidate listened to a passage read aloud and selected words to fill in blanks in the transcript.
The stimulus shows the passage with correct answers marked. The response shows which options the learner selected and whether each was correct.
Focus on: accuracy (which blanks were correct), listening comprehension, and ability to identify content words from audio context.`,

  highlight_correct_summary: `You are a PTE Academic examiner evaluating a Highlight Correct Summary response.
The candidate listened to an audio passage and selected the summary that best matches what was said.
The stimulus shows the passage and all summary options. The response shows the learner's selection and whether it was correct.
Focus on: whether the selected summary accurately captures the main idea and key points, and what was right or wrong about the choice.`,
}

// Task-specific details schema strings (embedded in JSON output template)
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
  fill_in_the_blanks_reading: `"details": { "taskType": "fill_in_the_blanks_reading", "accuracy": "<which blanks were correct and which were wrong, with explanations>", "vocabulary": "<vocabulary-in-context understanding feedback>" }`,
  re_order_paragraphs: `"details": { "taskType": "re_order_paragraphs", "orderAccuracy": "<how many paragraphs were in the correct position and which were misplaced>", "logicFeedback": "<feedback on their understanding of text cohesion and discourse structure>" }`,
  multiple_choice_reading: `"details": { "taskType": "multiple_choice_reading", "answerAccuracy": "<was the answer correct and why the correct option is right>", "readingComprehension": "<feedback on their reading comprehension approach and any misconceptions>" }`,
  summarize_spoken_text: `"details": { "taskType": "summarize_spoken_text", "contentAccuracy": "<did the summary capture the main idea and key points from the audio?>", "writingQuality": "<grammar, vocabulary, and whether summary length is 50–70 words>" }`,
  fill_in_the_blanks_listening: `"details": { "taskType": "fill_in_the_blanks_listening", "accuracy": "<which blanks were correct and which were wrong, with explanations>", "listeningComprehension": "<feedback on their ability to identify content words from audio context>" }`,
  highlight_correct_summary: `"details": { "taskType": "highlight_correct_summary", "answerAccuracy": "<was the selection correct and why the correct summary best matches the passage>", "listeningComprehension": "<feedback on their listening comprehension and understanding of the main idea>" }`,
}

// Build the primary LLM call output schema — includes dimension scores and coach suggestions for scored tasks
function buildPrimarySchema(taskType: PteTaskType): string {
  const details = DETAILS_SCHEMA[taskType]

  if (SCORED_SPEAKING.has(taskType)) {
    return `You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<general tip1>", "<general tip2>"],
  ${details},
  "dimensionScores": { "section": "speaking", "fluency": <0-100>, "pronunciation": <0-100>, "content": <0-100> },
  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]
}`
  }

  if (SCORED_WRITING.has(taskType)) {
    return `You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<general tip1>", "<general tip2>"],
  ${details},
  "dimensionScores": { "section": "writing", "grammar": <0-100>, "vocabulary": <0-100>, "form": <0-100>, "content": <0-100> },
  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]
}`
  }

  if (SCORED_READING.has(taskType)) {
    return `You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<general tip1>", "<general tip2>"],
  ${details},
  "dimensionScores": { "section": "reading", "vocabulary": <0-100>, "comprehension": <0-100> },
  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]
}`
  }

  if (SCORED_LISTENING.has(taskType)) {
    return `You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<general tip1>", "<general tip2>"],
  ${details},
  "dimensionScores": { "section": "listening", "comprehension": <0-100>, "accuracy": <0-100> },
  "coachSuggestions": ["<targeted coaching tip for the weakest dimension>", "<targeted tip for 2nd weakest dimension>"]
}`
  }

  // personal_intro and write_from_dictation: no dimension scores
  return `You MUST respond with valid JSON only. No markdown, no code blocks.
Return exactly:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "suggestions": ["<suggestion1>", "<suggestion2>"],
  ${details}
}`
}

// Build the independent Judge call system prompt — scores dimensions only, no access to primary result
function buildJudgeSystemPrompt(taskType: PteTaskType): string | null {
  if (SCORED_SPEAKING.has(taskType)) {
    return `You are an independent PTE Academic examiner. Score the fluency, pronunciation, and content of the spoken response on a 0–100 scale. Return ONLY valid JSON, no other text:
{"dimensionScores": {"section": "speaking", "fluency": <0-100>, "pronunciation": <0-100>, "content": <0-100>}}`
  }
  if (SCORED_WRITING.has(taskType)) {
    return `You are an independent PTE Academic examiner. Score the grammar, vocabulary, form, and content of the written response on a 0–100 scale. Return ONLY valid JSON, no other text:
{"dimensionScores": {"section": "writing", "grammar": <0-100>, "vocabulary": <0-100>, "form": <0-100>, "content": <0-100>}}`
  }
  if (SCORED_READING.has(taskType)) {
    return `You are an independent PTE Academic examiner. Score the vocabulary and comprehension aspects of the reading response on a 0–100 scale. Return ONLY valid JSON, no other text:
{"dimensionScores": {"section": "reading", "vocabulary": <0-100>, "comprehension": <0-100>}}`
  }
  if (SCORED_LISTENING.has(taskType)) {
    return `You are an independent PTE Academic examiner. Score the comprehension and accuracy of the listening response on a 0–100 scale. Return ONLY valid JSON, no other text:
{"dimensionScores": {"section": "listening", "comprehension": <0-100>, "accuracy": <0-100>}}`
  }
  return null
}

function extractText(data: LlmResponse): string {
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content
  if (Array.isArray(data.content)) return data.content.map((c) => c.text ?? "").join("")
  if (data.response) return data.response
  if (typeof data.message === "string") return data.message
  return ""
}

async function callLLM(
  systemPrompt: string,
  userContent: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  maxTokens = 8000,
  timeoutMs = API_TIMEOUT,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`LLM API error (${res.status})`)
    const data = (await res.json()) as LlmResponse
    return extractText(data).trim()
  } finally {
    clearTimeout(timeoutId)
  }
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>
      } catch { /* fall through */ }
    }
  }
  return null
}

function extractDimensionScores(parsed: Record<string, unknown>): DimensionScores | null {
  const ds = parsed.dimensionScores as Record<string, unknown> | undefined
  if (!ds || typeof ds !== "object") return null

  if (
    ds.section === "speaking" &&
    typeof ds.fluency === "number" &&
    typeof ds.pronunciation === "number" &&
    typeof ds.content === "number"
  ) {
    return { section: "speaking", fluency: ds.fluency, pronunciation: ds.pronunciation, content: ds.content }
  }

  if (
    ds.section === "writing" &&
    typeof ds.grammar === "number" &&
    typeof ds.vocabulary === "number" &&
    typeof ds.form === "number" &&
    typeof ds.content === "number"
  ) {
    return { section: "writing", grammar: ds.grammar, vocabulary: ds.vocabulary, form: ds.form, content: ds.content }
  }

  if (
    ds.section === "reading" &&
    typeof ds.vocabulary === "number" &&
    typeof ds.comprehension === "number"
  ) {
    return { section: "reading", vocabulary: ds.vocabulary, comprehension: ds.comprehension } as ReadingDimensionScores
  }

  if (
    ds.section === "listening" &&
    typeof ds.comprehension === "number" &&
    typeof ds.accuracy === "number"
  ) {
    return { section: "listening", comprehension: ds.comprehension, accuracy: ds.accuracy } as ListeningDimensionScores
  }

  return null
}

function findDivergences(
  primary: DimensionScores,
  judge: DimensionScores,
): Array<{ dimension: string; primaryScore: number; judgeScore: number }> {
  if (primary.section !== judge.section) return []

  const diverged: Array<{ dimension: string; primaryScore: number; judgeScore: number }> = []

  if (primary.section === "speaking" && judge.section === "speaking") {
    for (const dim of ["fluency", "pronunciation", "content"] as const) {
      const diff = Math.abs(primary[dim] - judge[dim])
      if (diff > 15) diverged.push({ dimension: dim, primaryScore: primary[dim], judgeScore: judge[dim] })
    }
  } else if (primary.section === "writing" && judge.section === "writing") {
    for (const dim of ["grammar", "vocabulary", "form", "content"] as const) {
      const diff = Math.abs(primary[dim] - judge[dim])
      if (diff > 15) diverged.push({ dimension: dim, primaryScore: primary[dim], judgeScore: judge[dim] })
    }
  } else if (primary.section === "reading" && judge.section === "reading") {
    for (const dim of ["vocabulary", "comprehension"] as const) {
      const diff = Math.abs(primary[dim] - judge[dim])
      if (diff > 15) diverged.push({ dimension: dim, primaryScore: primary[dim], judgeScore: judge[dim] })
    }
  } else if (primary.section === "listening" && judge.section === "listening") {
    for (const dim of ["comprehension", "accuracy"] as const) {
      const diff = Math.abs(primary[dim] - judge[dim])
      if (diff > 15) diverged.push({ dimension: dim, primaryScore: primary[dim], judgeScore: judge[dim] })
    }
  }

  return diverged
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
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

    const isScored = SCORED_SPEAKING.has(taskType) || SCORED_WRITING.has(taskType) || SCORED_READING.has(taskType) || SCORED_LISTENING.has(taskType)

    const primarySystemPrompt = [
      SYSTEM_PROMPTS[taskType],
      buildPrimarySchema(taskType),
      isScored
        ? "Dimension scores are 0–100 internal reference values only — they do not represent official PTE Academic scores."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")

    const pronunciationCtx = pronunciationAssessment
      ? `\n\nAzure Pronunciation scores — Overall: ${pronunciationAssessment.score}, ` +
        `Accuracy: ${pronunciationAssessment.accuracyScore}, Fluency: ${pronunciationAssessment.fluencyScore}, ` +
        `Completeness: ${pronunciationAssessment.completenessScore}`
      : ""

    const userContent = stimulus
      ? `Stimulus:\n${stimulus}\n\nCandidate response:\n${candidateResponse}${pronunciationCtx}`
      : `Candidate response:\n${candidateResponse}${pronunciationCtx}`

    const judgeSystemPrompt = buildJudgeSystemPrompt(taskType)

    // Primary call and Judge call run in parallel; Judge failure is non-fatal
    const [primaryContent, judgeContent] = await Promise.all([
      callLLM(primarySystemPrompt, userContent, apiKey, baseUrl, model, 8000),
      judgeSystemPrompt
        ? callLLM(judgeSystemPrompt, userContent, apiKey, baseUrl, model, 2000, JUDGE_TIMEOUT).catch(
            () => null,
          )
        : Promise.resolve(null),
    ])

    if (!primaryContent) {
      return NextResponse.json({ error: "Empty response from LLM" }, { status: 502 })
    }

    let primaryParsed = tryParseJson(primaryContent)
    if (!primaryParsed) {
      return NextResponse.json({ error: "Invalid feedback format from LLM" }, { status: 502 })
    }

    // LLM-as-Judge: compare dimension scores; retry primary if any dimension diverges > 15 points
    let judgeLog: JudgeLog | undefined
    if (judgeContent && judgeSystemPrompt) {
      const judgeParsed = tryParseJson(judgeContent)
      if (judgeParsed) {
        const primaryScores = extractDimensionScores(primaryParsed)
        const judgeScores = extractDimensionScores(judgeParsed)
        if (primaryScores && judgeScores) {
          const diverged = findDivergences(primaryScores, judgeScores)
          if (diverged.length > 0) {
            judgeLog = { taskType, divergedDimensions: diverged, timestamp: new Date().toISOString() }
            console.log("[LLM-as-Judge] Dimension disagreement — retrying primary:", judgeLog)
            try {
              const retryContent = await callLLM(
                primarySystemPrompt,
                userContent,
                apiKey,
                baseUrl,
                model,
                8000,
              )
              const retryParsed = tryParseJson(retryContent)
              if (retryParsed) primaryParsed = retryParsed
            } catch {
              // Retry failed — original primary result is kept; judgeLog is still attached
            }
          }
        }
      }
    }

    const feedback = primaryParsed as TaskFeedback
    if (pronunciationAssessment) feedback.pronunciationAssessment = pronunciationAssessment
    if (judgeLog) feedback.judgeLog = judgeLog

    return NextResponse.json(feedback)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Feedback generation timed out" }, { status: 504 })
    }
    console.error("PTE feedback error:", error)
    return NextResponse.json({ error: "Failed to generate feedback" }, { status: 500 })
  }
}
