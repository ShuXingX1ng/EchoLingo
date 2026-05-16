import { NextResponse } from "next/server";

const API_TIMEOUT = 120000; // 120 秒超时（反馈生成需要更长时间）

const EVALUATOR_SYSTEM_PROMPT = `You are an IELTS Speaking evaluator.

Your task is to evaluate the user's speaking practice transcript.

Assess the user's answers based on IELTS Speaking criteria:
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation

Because this MVP is text-based, do not give a real pronunciation score. Instead, state that pronunciation analysis requires voice input.

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Return this exact JSON structure:
{
  "estimatedBand": <number between 0 and 9>,
  "fluencyAndCoherence": "<string feedback>",
  "lexicalResource": "<string feedback>",
  "grammarRangeAndAccuracy": "<string feedback>",
  "pronunciation": "Pronunciation analysis is not available in the text-based MVP.",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "improvementSuggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "improvedSampleAnswer": "<improved version of one of the user's answers>",
  "errorAnnotations": [
    {
      "original": "<exact text from the candidate's response containing the error>",
      "corrected": "<the corrected version of that text>",
      "type": "<one of: grammar, vocabulary, fluency>",
      "explanation": "<brief explanation of why it was wrong and how to fix it>"
    }
  ]
}

For errorAnnotations: Identify 3-8 specific errors from the candidate's responses. For each error:
- "original" must be an exact substring from the candidate's transcript
- "corrected" is the properly corrected version
- "type" classifies the error as grammar, vocabulary, or fluency
- "explanation" gives a concise, helpful correction note
Focus on the most impactful errors. If the candidate made few errors, include fewer annotations.

Be helpful, specific, and realistic. Do not be too harsh, but do not overestimate the user's score.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMessage(data: any): string {
  if (data.choices && data.choices.length > 0) {
    const choice = data.choices[0]?.message;
    return choice?.content || "";
  }
  if (data.content && Array.isArray(data.content)) {
    return data.content.map((c: any) => c.text || "").join("");
  }
  if (data.response) {
    return data.response;
  }
  if (data.message && typeof data.message === "string") {
    return data.message;
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    // 验证输入
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;

    if (!apiKey || !baseUrl || !model) {
      return NextResponse.json(
        { error: "LLM API configuration is missing. Please set LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL in .env.local" },
        { status: 500 }
      );
    }

    // Format transcript for evaluation
    const transcript = messages
      .map(
        (msg: { role: string; content: string }) =>
          `${msg.role === "examiner" ? "Examiner" : "Candidate"}: ${msg.content}`
      )
      .join("\n");

    const openaiMessages = [
      { role: "system", content: EVALUATOR_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Please evaluate this IELTS Speaking practice transcript:\n\n${transcript}`,
      },
    ];

    const requestBody: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      temperature: 0.3,
      max_tokens: 3000,
    };

    // Only add json_object format for providers that support it
    requestBody.response_format = { type: "json_object" };

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Feedback LLM API error:", errorData);

      // 根据状态码提供更具体的错误信息
      if (response.status === 401) {
        return NextResponse.json(
          { error: "Invalid API key. Please check your LLM_API_KEY in .env.local" },
          { status: 502 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment and try again." },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: `LLM API error (${response.status}). Please try again.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    console.log("Feedback LLM response:", JSON.stringify(data).substring(0, 500));

    const content = extractMessage(data);

    if (!content || content.trim() === "") {
      console.error("Empty feedback response, full data:", JSON.stringify(data));
      return NextResponse.json(
        { error: "The AI returned an empty response. Please try again." },
        { status: 502 }
      );
    }

    // Parse the JSON response
    try {
      const feedback = JSON.parse(content);
      return NextResponse.json(feedback);
    } catch (parseError) {
      console.error("Failed to parse LLM response as JSON:", content);
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const feedback = JSON.parse(jsonMatch[0]);
          return NextResponse.json(feedback);
        } catch {
          // Fall through to error
        }
      }
      return NextResponse.json(
        { error: "Invalid feedback format from LLM" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Feedback API error:", error);

    // 处理超时错误
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Feedback generation timed out. Please try again with a shorter conversation." },
        { status: 504 }
      );
    }

    // 处理网络错误
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        { error: "Network error. Please check your internet connection and try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
