import { createClient } from "./supabase";
import type { ErrorAnnotation } from "@/types";

export interface SupabaseErrorPattern {
  id: string;
  user_id: string;
  error_type: "grammar" | "vocabulary" | "fluency" | "pronunciation";
  pattern: string;
  examples: string[];
  frequency: number;
  last_occurred_at: string;
  improvement?: string;
  created_at: string;
  updated_at: string;
}

export interface UserWeakAreas {
  user_id: string;
  weak_skills: string[];
  top_errors: Record<string, string>;
  last_updated: string;
}

// Get error patterns for a user from Supabase
export async function getErrorPatterns(userId: string): Promise<SupabaseErrorPattern[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_error_patterns")
    .select("*")
    .eq("user_id", userId)
    .order("frequency", { ascending: false });

  if (error || !data) return [];
  return data as SupabaseErrorPattern[];
}

// Get weak areas summary for a user
export async function getWeakAreas(userId: string): Promise<UserWeakAreas | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_weak_areas")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as UserWeakAreas;
}

// Get weak skills array for recommendations
export async function getWeakSkills(userId: string): Promise<string[]> {
  const weakAreas = await getWeakAreas(userId);
  return weakAreas?.weak_skills || [];
}

// Get top error for a specific skill type
export async function getTopErrorForSkill(userId: string, skill: string): Promise<string | null> {
  const weakAreas = await getWeakAreas(userId);
  return weakAreas?.top_errors?.[skill] || null;
}

// Save or update an error pattern
export async function saveErrorPattern(
  userId: string,
  errorType: "grammar" | "vocabulary" | "fluency" | "pronunciation",
  pattern: string,
  examples: string[] = [],
  improvement?: string
): Promise<void> {
  const supabase = createClient();

  // Try to find existing pattern
  const { data: existing } = await supabase
    .from("user_error_patterns")
    .select("id, frequency, examples")
    .eq("user_id", userId)
    .eq("pattern", pattern)
    .single();

  if (existing) {
    // Update existing pattern
    const newExamples = [...new Set([...existing.examples, ...examples])].slice(-5);
    await supabase
      .from("user_error_patterns")
      .update({
        frequency: existing.frequency + 1,
        examples: newExamples,
        last_occurred_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(improvement && { improvement }),
      })
      .eq("id", existing.id);
  } else {
    // Insert new pattern
    await supabase.from("user_error_patterns").insert({
      user_id: userId,
      error_type: errorType,
      pattern,
      examples,
      frequency: 1,
      last_occurred_at: new Date().toISOString(),
      improvement,
    });
  }
}

// Update error patterns from session feedback
export async function updateErrorPatternsFromFeedback(
  userId: string,
  feedback: {
    grammarRangeAndAccuracy: string;
    lexicalResource: string;
    fluencyAndCoherence: string;
    pronunciation: string;
    weaknesses: string[];
    errorAnnotations?: ErrorAnnotation[];
    improvementSuggestions?: string[];
  }
): Promise<void> {
  // Extract error patterns from weaknesses
  for (const weakness of feedback.weaknesses) {
    const errorType = inferTypeFromText(weakness);
    await saveErrorPattern(userId, errorType, weakness);
  }

  // Extract error patterns from errorAnnotations (richer signal)
  if (feedback.errorAnnotations) {
    for (const annotation of feedback.errorAnnotations) {
      const patternText = annotation.corrected || annotation.original;
      await saveErrorPattern(
        userId,
        annotation.type,
        patternText,
        annotation.original ? [annotation.original] : [],
        annotation.explanation
      );
    }
  }

  // Enrich patterns with improvement suggestions where missing
  if (feedback.improvementSuggestions && feedback.improvementSuggestions.length > 0) {
    const patterns = await getErrorPatterns(userId);
    for (const pattern of patterns) {
      if (!pattern.improvement) {
        const matchingSuggestion = feedback.improvementSuggestions.find((s) =>
          s.toLowerCase().includes(pattern.error_type)
        );
        if (matchingSuggestion) {
          await supabaseUpdateImprovement(pattern.id, matchingSuggestion);
        }
      }
    }
  }
}

// Helper to update improvement field
async function supabaseUpdateImprovement(patternId: string, improvement: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("user_error_patterns")
    .update({ improvement, updated_at: new Date().toISOString() })
    .eq("id", patternId);
}

// Infer error type from text
function inferTypeFromText(text: string): "grammar" | "vocabulary" | "fluency" | "pronunciation" {
  const lower = text.toLowerCase();

  if (
    lower.includes("grammar") ||
    lower.includes("tense") ||
    lower.includes("sentence structure")
  ) {
    return "grammar";
  }
  if (
    lower.includes("vocabulary") ||
    lower.includes("word") ||
    lower.includes("lexical")
  ) {
    return "vocabulary";
  }
  if (
    lower.includes("pronunciation") ||
    lower.includes("accent") ||
    lower.includes("sound")
  ) {
    return "pronunciation";
  }
  return "fluency";
}

// Get personalized suggestions based on Supabase error patterns
export async function getPersonalizedSuggestions(userId: string): Promise<string[]> {
  const patterns = await getErrorPatterns(userId);
  if (patterns.length === 0) return [];

  const suggestions: string[] = [];
  const topErrors = patterns.slice(0, 5);

  for (const error of topErrors) {
    switch (error.error_type) {
      case "grammar":
        suggestions.push(
          `Focus on improving: ${error.pattern}. Try practicing grammar exercises related to this.`
        );
        break;
      case "vocabulary":
        suggestions.push(
          `Expand your vocabulary around: ${error.pattern}. Try learning synonyms and related words.`
        );
        break;
      case "fluency":
        suggestions.push(
          `Work on fluency by practicing: ${error.pattern}. Try speaking more smoothly without long pauses.`
        );
        break;
      case "pronunciation":
        suggestions.push(
          `Practice pronunciation of: ${error.pattern}. Try listening to native speakers and mimicking.`
        );
        break;
    }
  }

  return suggestions;
}

// Get error statistics from Supabase
export async function getErrorStats(userId: string): Promise<{
  totalErrors: number;
  byType: Record<string, number>;
  mostFrequent: SupabaseErrorPattern | null;
}> {
  const patterns = await getErrorPatterns(userId);

  if (patterns.length === 0) {
    return { totalErrors: 0, byType: {}, mostFrequent: null };
  }

  const byType: Record<string, number> = {
    grammar: 0,
    vocabulary: 0,
    fluency: 0,
    pronunciation: 0,
  };

  patterns.forEach((error) => {
    byType[error.error_type] = (byType[error.error_type] || 0) + error.frequency;
  });

  return {
    totalErrors: patterns.reduce((sum, e) => sum + e.frequency, 0),
    byType,
    mostFrequent: patterns[0] || null,
  };
}
