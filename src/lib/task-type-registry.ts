import type { PteTaskType } from "@/types"

export type TaskCategory = "speaking" | "writing" | "reading" | "listening"

export type StimulusFormat = "text" | "audio" | "image" | "json" | "none"

export interface TimerConfig {
  prepSeconds?: number
  taskSeconds?: number
  recordSeconds?: number
  minRecSeconds?: number
}

export interface TaskTypeMetadata {
  displayName: string
  category: TaskCategory
  stimulusFormat: StimulusFormat
  timer: TimerConfig
}

export const TASK_TYPE_REGISTRY: Record<PteTaskType, TaskTypeMetadata> = {
  read_aloud: {
    displayName: "Read Aloud",
    category: "speaking",
    stimulusFormat: "text",
    timer: { prepSeconds: 35, recordSeconds: 40, minRecSeconds: 5 },
  },
  repeat_sentence: {
    displayName: "Repeat Sentence",
    category: "speaking",
    stimulusFormat: "audio",
    timer: { recordSeconds: 15, minRecSeconds: 5 },
  },
  answer_short_question: {
    displayName: "Answer Short Question",
    category: "speaking",
    stimulusFormat: "audio",
    timer: { prepSeconds: 3, recordSeconds: 10, minRecSeconds: 5 },
  },
  personal_intro: {
    displayName: "Personal Introduction",
    category: "speaking",
    stimulusFormat: "none",
    timer: { prepSeconds: 25, recordSeconds: 30, minRecSeconds: 5 },
  },
  describe_image: {
    displayName: "Describe Image",
    category: "speaking",
    stimulusFormat: "image",
    timer: { prepSeconds: 25, recordSeconds: 40, minRecSeconds: 5 },
  },
  re_tell_lecture: {
    displayName: "Re-tell Lecture",
    category: "speaking",
    stimulusFormat: "audio",
    timer: { prepSeconds: 10, recordSeconds: 40, minRecSeconds: 5 },
  },
  summarize_written_text: {
    displayName: "Summarize Written Text",
    category: "writing",
    stimulusFormat: "text",
    timer: { taskSeconds: 600 },
  },
  write_essay: {
    displayName: "Write Essay",
    category: "writing",
    stimulusFormat: "text",
    timer: { taskSeconds: 1200 },
  },
  write_from_dictation: {
    displayName: "Write from Dictation",
    category: "writing",
    stimulusFormat: "audio",
    timer: {},
  },
  fill_in_the_blanks_reading: {
    displayName: "Fill in the Blanks (Reading)",
    category: "reading",
    stimulusFormat: "json",
    timer: { taskSeconds: 420 },
  },
  re_order_paragraphs: {
    displayName: "Re-order Paragraphs",
    category: "reading",
    stimulusFormat: "json",
    timer: { taskSeconds: 180 },
  },
  multiple_choice_reading: {
    displayName: "Multiple Choice (Reading)",
    category: "reading",
    stimulusFormat: "json",
    timer: { taskSeconds: 240 },
  },
  summarize_spoken_text: {
    displayName: "Summarize Spoken Text",
    category: "listening",
    stimulusFormat: "audio",
    timer: { taskSeconds: 600 },
  },
  fill_in_the_blanks_listening: {
    displayName: "Fill in the Blanks (Listening)",
    category: "listening",
    stimulusFormat: "json",
    timer: { taskSeconds: 420 },
  },
  highlight_correct_summary: {
    displayName: "Highlight Correct Summary",
    category: "listening",
    stimulusFormat: "json",
    timer: { taskSeconds: 300 },
  },
}

export const ALL_TASK_TYPES = Object.keys(TASK_TYPE_REGISTRY) as PteTaskType[]

export function getTaskTypeMetadata(taskType: PteTaskType): TaskTypeMetadata {
  return TASK_TYPE_REGISTRY[taskType]
}

export function getTaskTypesByCategory(category: TaskCategory): PteTaskType[] {
  return ALL_TASK_TYPES.filter(t => TASK_TYPE_REGISTRY[t].category === category)
}
