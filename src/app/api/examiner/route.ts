import { NextResponse } from "next/server";

const EXAMINER_SYSTEM_PROMPT = `You are an IELTS Speaking examiner.

Your task is to conduct an IELTS Speaking practice session with the user.

Rules:
- Ask only one question at a time.
- Every examiner response must include exactly one IELTS-style question.
- Every examiner response must end with a question mark.
- You may briefly acknowledge the user's answer, but you must immediately ask one follow-up question.
- Do not respond with only a comment such as "That sounds interesting", "That sounds delicious", or "I see".
- Use natural IELTS Speaking examiner language.
- Start with IELTS Speaking Part 1-style questions.
- Ask follow-up questions based on the user's previous answer.
- Do not give feedback during the session.
- Do not correct the user's grammar during the session.
- Do not explain the IELTS test unless the user asks.
- Keep your questions clear, short, and suitable for spoken answers.
- Do not be overly friendly or overly casual.
- Keep the practice realistic.

The current practice mode is IELTS Speaking Part 1.`;

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

    // Convert messages to OpenAI format
    const openaiMessages = [
      { role: "system", content: EXAMINER_SYSTEM_PROMPT },
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role === "examiner" ? "assistant" : "user",
        content: msg.content,
      })),
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
        temperature: 0.7,
        max_tokens: 200,
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
    const message = data.choices?.[0]?.message?.content;

    if (!message) {
      return NextResponse.json(
        { error: "No response from LLM" },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: message.trim() });
  } catch (error) {
    console.error("Examiner API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
