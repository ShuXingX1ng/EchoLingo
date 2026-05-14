import { NextResponse } from "next/server";
import { getTopicById } from "@/lib/topics";

const API_TIMEOUT = 60000; // 60 秒超时

function getSystemPrompt(mode: string, topicId?: string): string {
  const topic = topicId ? getTopicById(topicId) : undefined;

  const basePrompt = `You are an IELTS Speaking examiner conducting a practice session.

Rules:
- Ask only one question at a time.
- Every examiner response must include exactly one IELTS-style question.
- Every examiner response must end with a question mark.
- You may briefly acknowledge the user's answer, but you must immediately ask one follow-up question.
- Do not respond with only a comment such as "That sounds interesting", "That sounds delicious", or "I see".
- Use natural IELTS Speaking examiner language.
- Ask follow-up questions based on the user's previous answer.
- Do not give feedback during the session.
- Do not correct the user's grammar during the session.
- Do not explain the IELTS test unless the user asks.
- Keep your questions clear, short, and suitable for spoken answers.
- Do not be overly friendly or overly casual.
- Keep the practice realistic.`;

  switch (mode) {
    case "part2":
      return `${basePrompt}

The current practice mode is IELTS Speaking Part 2 (Long Turn).

Part 2 Rules:
- First, give the user a cue card with a topic to speak about for 1-2 minutes.
- The cue card should include: the main topic, 3-4 bullet points to cover, and a final question.
- After giving the cue card, say "You have 1 minute to prepare. You can make notes if you wish."
- Then say "Alright, you can start speaking now. You have 1-2 minutes."
- Listen to the user's response.
- After they finish, ask 1-2 brief follow-up questions related to the topic.
${topic ? `\nTopic: ${topic.name}\nCue Card: ${topic.part2CueCard}` : ""}`;

    case "part3":
      return `${basePrompt}

The current practice mode is IELTS Speaking Part 3 (Discussion).

Part 3 Rules:
- Ask abstract, analytical questions related to the Part 2 topic.
- Questions should require deeper thinking and analysis.
- Ask about broader issues, comparisons, predictions, or opinions.
- Follow up on the user's answers to explore their views further.
- Encourage the user to give detailed, well-structured responses.
${topic ? `\nTopic: ${topic.name}\nSample questions:\n${topic.part3Questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}`;

    case "full":
      return `${basePrompt}

The current practice mode is a full IELTS Speaking Test simulation.

Test Structure:
1. Start with Part 1: Ask 3-4 short questions about familiar topics (home, work, studies, hobbies).
2. Then move to Part 2: Give the user a cue card. After they finish, ask 1-2 follow-up questions.
3. Then move to Part 3: Ask 3-4 deeper, analytical questions related to the Part 2 topic.

Transitions:
- When moving from Part 1 to Part 2, say: "Now I'm going to give you a topic to talk about for 1-2 minutes."
- When moving from Part 2 to Part 3, say: "Let's discuss some broader questions related to this topic."
- At the end, say: "That is the end of the speaking test. Thank you."
${topic ? `\nTopic: ${topic.name}\nPart 2 Cue Card: ${topic.part2CueCard}\nPart 3 Questions:\n${topic.part3Questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}`;

    default: // part1
      return `${basePrompt}

The current practice mode is IELTS Speaking Part 1.

Part 1 Rules:
- Start with IELTS Speaking Part 1-style questions.
- Ask about familiar topics: hometown, work/studies, hobbies, daily routine, interests.
- Keep questions simple and direct.
- Ask 1-2 follow-up questions per topic before moving to a new topic.
${topic ? `\nTopic: ${topic.name}\nSample questions:\n${topic.part1Questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMessage(data: any): string {
  // OpenAI / DeepSeek format
  if (data.choices && data.choices.length > 0) {
    return data.choices[0]?.message?.content || "";
  }
  // Some providers return content as array
  if (data.content && Array.isArray(data.content)) {
    return data.content.map((c: any) => c.text || "").join("");
  }
  // Some providers use 'response' field
  if (data.response) {
    return data.response;
  }
  // Some providers use 'message' field
  if (data.message && typeof data.message === "string") {
    return data.message;
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const { messages, mode = "part1", topic } = await request.json();

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

    // Convert messages to OpenAI format
    const systemPrompt = getSystemPrompt(mode, topic);
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role === "examiner" ? "assistant" : "user",
        content: msg.content,
      })),
    ];

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
        body: JSON.stringify({
          model,
          messages: openaiMessages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error("LLM API error:", errorData);

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
      if (response.status === 503) {
        return NextResponse.json(
          { error: "LLM service is temporarily unavailable. Please try again later." },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: `LLM API error (${response.status}). Please try again.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    console.log("LLM response:", JSON.stringify(data).substring(0, 500));

    // Handle different response formats
    let message = "";

    if (data.choices && data.choices.length > 0) {
      // OpenAI format - 同时兼容推理模型（如 DeepSeek）
      const choice = data.choices[0]?.message;
      message = choice?.content || "";
      // 如果 content 为空但有 reasoning_content，说明推理模型未完成回答
      if (!message && choice?.reasoning_content) {
        console.warn("Model returned reasoning but no content. Reasoning:", choice.reasoning_content.substring(0, 200));
      }
    } else if (data.content && Array.isArray(data.content)) {
      // Some providers return content as array
      message = data.content.map((c: any) => c.text || "").join("");
    } else if (data.response) {
      // Some providers use 'response' field
      message = data.response;
    } else if (data.message) {
      // Some providers use 'message' field
      message = data.message;
    }

    if (!message || message.trim() === "") {
      console.error("Empty LLM response, full data:", JSON.stringify(data));
      return NextResponse.json(
        {
          error: "The AI returned an empty response. Please try again.",
          debug: process.env.NODE_ENV === "development" ? data : undefined,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ message: message.trim() });
  } catch (error) {
    console.error("Examiner API error:", error);

    // 处理超时错误
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timed out. The AI took too long to respond. Please try again." },
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
