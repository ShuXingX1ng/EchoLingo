import { NextResponse } from "next/server";

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
  "improvedSampleAnswer": "<improved version of one of the user's answers>"
}

Be helpful, specific, and realistic. Do not be too harsh, but do not overestimate the user's score.`;

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("LLM API error:", errorData);
      return NextResponse.json(
        { error: "Failed to get response from LLM API" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No response from LLM" },
        { status: 502 }
      );
    }

    // Parse the JSON response
    try {
      const feedback = JSON.parse(content);
      return NextResponse.json(feedback);
    } catch {
      console.error("Failed to parse LLM response as JSON:", content);
      return NextResponse.json(
        { error: "Invalid feedback format from LLM" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
