import { useState, useCallback } from "react";
import type { ChatMessage, SessionFeedback } from "@/types";

type ConversationState = "idle" | "listening" | "processing" | "speaking";

interface UseVoiceConversationOptions {
  onExaminerResponse: (message: ChatMessage) => void;
  onFeedback: (feedback: SessionFeedback) => void;
  onError: (error: string) => void;
}

export function useVoiceConversation({
  onExaminerResponse,
  onFeedback,
  onError,
}: UseVoiceConversationOptions) {
  const [state, setState] = useState<ConversationState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSessionEnded, setIsSessionEnded] = useState(false);

  const addUserMessage = useCallback((content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    return userMessage;
  }, []);

  const fetchExaminerResponse = useCallback(
    async (currentMessages: ChatMessage[]) => {
      setState("processing");

      try {
        const { apiPost } = await import("@/lib/api-client");
        const data = await apiPost<{ message: string }>("/api/examiner", {
          mode: "ielts_part_1",
          messages: currentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        const examinerMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "examiner",
          content: data.message,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, examinerMessage]);
        setState("speaking");
        onExaminerResponse(examinerMessage);

        return examinerMessage;
      } catch (err) {
        setState("idle");
        onError(
          err instanceof Error ? err.message : "Failed to get response"
        );
        return null;
      }
    },
    [onExaminerResponse, onError]
  );

  const endSession = useCallback(async () => {
    setIsSessionEnded(true);
    setState("processing");

    const endMessage: ChatMessage = {
      id: (Date.now() + 2).toString(),
      role: "examiner",
      content: "Thank you. That is the end of the speaking practice session.",
      createdAt: new Date().toISOString(),
    };
    const finalMessages = [...messages, endMessage];
    setMessages(finalMessages);

    try {
      const { apiPost } = await import("@/lib/api-client");
      const feedbackData = await apiPost<SessionFeedback>("/api/feedback", {
        mode: "ielts_part_1",
        messages: finalMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      setState("idle");
      onFeedback(feedbackData);
      return feedbackData;
    } catch (err) {
      setState("idle");
      onError(
        err instanceof Error ? err.message : "Failed to generate feedback"
      );
      return null;
    }
  }, [messages, onFeedback, onError]);

  const handleUserSpeech = useCallback(
    async (text: string) => {
      if (isSessionEnded) return;

      const userMessage = addUserMessage(text);
      await fetchExaminerResponse([...messages, userMessage]);
    },
    [isSessionEnded, addUserMessage, fetchExaminerResponse, messages]
  );

  const onSpeakingEnd = useCallback(() => {
    if (!isSessionEnded) {
      setState("idle");
    }
  }, [isSessionEnded]);

  return {
    state,
    messages,
    isSessionEnded,
    handleUserSpeech,
    endSession,
    onSpeakingEnd,
    setMessages,
  };
}
