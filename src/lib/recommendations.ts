import { TOPICS, type Topic, getCategories } from "./topics";
import { getUserProgress, type LearningProgress } from "./supabase-progress";
import { getWeakSkills as getSupabaseWeakSkills, getTopErrorForSkill as getSupabaseTopError } from "./supabase-error-patterns";
import type { PteTaskType, TaskTypeWeakness } from "@/types";
import { getTasks } from "./unified-task-history";
import { deriveTaskTypeWeakness, rankWeaknesses, ALL_TASK_TYPES } from "./task-weakness";

export interface Recommendation {
  topic: Topic;
  reason: string;
  priority: number; // lower = higher priority
  focusArea?: string;
}

// Get weak skill dimensions from Supabase error patterns
async function getWeakSkills(userId: string): Promise<string[]> {
  return getSupabaseWeakSkills(userId);
}

// Get a specific error pattern for a skill type from Supabase
async function getTopErrorForSkill(userId: string, skill: string): Promise<string | null> {
  return getSupabaseTopError(userId, skill);
}

// Get topics the user hasn't practiced yet
function getUnpracticedTopics(progress: LearningProgress[]): Topic[] {
  const practicedIds = new Set(progress.map((p) => p.topic_id));
  return TOPICS.filter((t) => !practicedIds.has(t.id));
}

// Get topics where the user has low scores
function getLowScoreTopics(progress: LearningProgress[]): { topic: Topic; band: number }[] {
  const topicBest: Record<string, number> = {};
  for (const p of progress) {
    const current = topicBest[p.topic_id] || 0;
    topicBest[p.topic_id] = Math.max(current, p.best_band || 0);
  }

  const results: { topic: Topic; band: number }[] = [];
  for (const [topicId, band] of Object.entries(topicBest)) {
    const topic = TOPICS.find((t) => t.id === topicId);
    if (topic && band < 7.0) {
      results.push({ topic, band });
    }
  }

  return results.sort((a, b) => a.band - b.band);
}

// Get categories the user hasn't explored much
function getUnexploredCategories(progress: LearningProgress[]): string[] {
  const practicedTopicIds = new Set(progress.map((p) => p.topic_id));
  const practicedCategories = new Set(
    TOPICS.filter((t) => practicedTopicIds.has(t.id)).map((t) => t.category)
  );
  return getCategories().filter((c) => !practicedCategories.has(c));
}

// Main recommendation engine
export async function getRecommendations(userId: string): Promise<Recommendation[]> {
  const progress = await getUserProgress(userId);
  const recommendations: Recommendation[] = [];
  const usedTopicIds = new Set<string>();

  const weakSkills = await getWeakSkills(userId);
  const unpracticed = getUnpracticedTopics(progress);
  const lowScore = getLowScoreTopics(progress);
  const unexploredCategories = getUnexploredCategories(progress);

  // Priority 1: Unpracticed topics from unexplored categories
  for (const category of unexploredCategories.slice(0, 2)) {
    const categoryTopics = unpracticed.filter((t) => t.category === category);
    for (const topic of categoryTopics.slice(0, 2)) {
      if (!usedTopicIds.has(topic.id)) {
        recommendations.push({
          topic,
          reason: `Try a new category: ${category}`,
          priority: 1,
          focusArea: category,
        });
        usedTopicIds.add(topic.id);
      }
    }
  }

  // Priority 2: Topics targeting weak skills
  if (weakSkills.length > 0) {
    const topWeakSkill = weakSkills[0];
    let targetTopics: Topic[] = [];

    switch (topWeakSkill) {
      case "grammar":
        // Recommend topics with complex Part 3 questions
        targetTopics = TOPICS.filter(
          (t) =>
            t.part3Questions.length >= 4 &&
            !usedTopicIds.has(t.id)
        ).slice(0, 2);
        break;
      case "vocabulary":
        // Recommend diverse categories
        targetTopics = unpracticed.filter((t) => !usedTopicIds.has(t.id)).slice(0, 2);
        break;
      case "fluency":
        // Recommend Part 1 focused practice
        targetTopics = TOPICS.filter(
          (t) => t.part1Questions.length >= 5 && !usedTopicIds.has(t.id)
        ).slice(0, 2);
        break;
      case "pronunciation":
        // Recommend varied topics for broad practice
        targetTopics = TOPICS.filter((t) => !usedTopicIds.has(t.id)).slice(0, 2);
        break;
    }

    const topError = await getTopErrorForSkill(userId, topWeakSkill);

    for (const topic of targetTopics) {
      if (!usedTopicIds.has(topic.id)) {
        const reason = topError
          ? `Work on ${topWeakSkill}: "${topError}"`
          : `Improve your ${topWeakSkill}`;
        recommendations.push({
          topic,
          reason,
          priority: 2,
          focusArea: topWeakSkill,
        });
        usedTopicIds.add(topic.id);
      }
    }
  }

  // Priority 3: Low score topics to retry
  for (const { topic, band } of lowScore.slice(0, 2)) {
    if (!usedTopicIds.has(topic.id)) {
      recommendations.push({
        topic,
        reason: `Retry for a higher score (current best: Band ${band})`,
        priority: 3,
      });
      usedTopicIds.add(topic.id);
    }
  }

  // Priority 4: Fill with unpracticed topics
  for (const topic of unpracticed.slice(0, 3)) {
    if (!usedTopicIds.has(topic.id) && recommendations.length < 6) {
      recommendations.push({
        topic,
        reason: "New topic to explore",
        priority: 4,
      });
      usedTopicIds.add(topic.id);
    }
  }

  // Sort by priority and return top 6
  return recommendations.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

// ── PTE recommendations ───────────────────────────────────────────────────────

export const PTE_TASK_LABELS: Record<PteTaskType, string> = {
  read_aloud: "Read Aloud",
  repeat_sentence: "Repeat Sentence",
  answer_short_question: "Answer Short Question",
  summarize_written_text: "Summarize Written Text",
  write_essay: "Write Essay",
  personal_intro: "Personal Introduction",
  write_from_dictation: "Write from Dictation",
  describe_image: "Describe Image",
  re_tell_lecture: "Re-tell Lecture",
  fill_in_the_blanks_reading: "Fill in the Blanks (Reading)",
  re_order_paragraphs: "Re-order Paragraphs",
  multiple_choice_reading: "Multiple Choice (Reading)",
  summarize_spoken_text: "Summarize Spoken Text",
  fill_in_the_blanks_listening: "Fill in the Blanks (Listening)",
  highlight_correct_summary: "Highlight Correct Summary",
}

export interface PteRecommendation {
  taskType: PteTaskType
  label: string
  reason: string
  priority: number
  weakness?: TaskTypeWeakness
}

// Returns task types the logged-in user should practise next, ranked by weakness.
// Falls back to the full ordered task list when there is no PracticeTask history.
export async function getPteRecommendations(userId: string): Promise<PteRecommendation[]> {
  const tasks = await getTasks()

  if (tasks.length === 0) {
    return ALL_TASK_TYPES.map((taskType, i) => ({
      taskType,
      label: PTE_TASK_LABELS[taskType],
      reason: "Start practising this task type",
      priority: i + 1,
    }))
  }

  const weaknesses = deriveTaskTypeWeakness(tasks)
  const ranked = rankWeaknesses(weaknesses)

  return ranked.map((w, i) => {
    let reason: string
    if (w.recentCount === 0) {
      reason = "You haven't tried this task type yet"
    } else if (w.score < 40) {
      reason = `Needs work — low recent performance (score ${w.score}/100)`
    } else if (w.score < 65) {
      reason = `Room to improve (score ${w.score}/100)`
    } else {
      reason = `Keep practising to maintain your progress`
    }

    return {
      taskType: w.taskType,
      label: PTE_TASK_LABELS[w.taskType],
      reason,
      priority: i + 1,
      weakness: w,
    }
  })
}
