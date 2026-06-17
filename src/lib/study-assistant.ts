import { apiPost } from "@/lib/api-client"

export interface StudyAssistantLink {
  label: string
  route: string
}

export interface StudyAssistantPractice {
  taskType: string
  taskSlug: string
  topic: string
  source: "exemplars" | "news"
  route: string
}

export interface StudyAssistantReply {
  reply: string
  links: StudyAssistantLink[]
  practice: StudyAssistantPractice | null
}

export interface StudyAssistantMessage {
  role: "user" | "assistant"
  content: string
}

export async function askStudyAssistant(
  messages: StudyAssistantMessage[],
  locale: "en" | "zh"
): Promise<StudyAssistantReply> {
  return apiPost<StudyAssistantReply>("/api/study-assistant/chat", { messages, locale })
}
