import { TOPICS, type Topic, getCategories } from "./topics";
import { getUserProgress, type LearningProgress } from "./supabase-progress";
import { getUserProfile } from "./error-patterns";

export interface Recommendation {
  topic: Topic;
  reason: string;
  priority: number; // lower = higher priority
  focusArea?: string;
}

// Analyze weak skill dimensions from error patterns
function getWeakSkills(userId: string): string[] {
  const profile = getUserProfile(userId);
  if (!profile) return [];

  const skillCounts: Record<string, number> = {
    grammar: 0,
    vocabulary: 0,
    fluency: 0,
    pronunciation: 0,
  };

  for (const error of profile.commonErrors) {
    skillCounts[error.type] = (skillCounts[error.type] || 0) + error.frequency;
  }

  // Return skills sorted by weakness (most errors first)
  return Object.entries(skillCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);
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

  const weakSkills = getWeakSkills(userId);
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

    for (const topic of targetTopics) {
      if (!usedTopicIds.has(topic.id)) {
        recommendations.push({
          topic,
          reason: `Improve your ${topWeakSkill}`,
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
