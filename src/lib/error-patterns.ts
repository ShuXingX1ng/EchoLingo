// User error pattern analysis and storage for personalized learning

export interface ErrorPattern {
  id: string;
  userId: string;
  type: "grammar" | "vocabulary" | "fluency" | "pronunciation";
  pattern: string;
  examples: string[];
  frequency: number;
  lastOccurred: string;
  improvement?: string;
}

export interface UserProfile {
  userId: string;
  commonErrors: ErrorPattern[];
  strengths: string[];
  weakAreas: string[];
  practiceCount: number;
  averageBand: number;
  lastUpdated: string;
}

// Local storage key
const PROFILE_KEY = "echolingo_user_profile";

// Get user profile from localStorage
export function getUserProfile(userId: string): UserProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(`${PROFILE_KEY}_${userId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// Save user profile to localStorage
export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      `${PROFILE_KEY}_${profile.userId}`,
      JSON.stringify(profile)
    );
  } catch (error) {
    console.error("Failed to save user profile:", error);
  }
}

export function getAllUserProfiles(): UserProfile[] {
  if (typeof window === "undefined") return [];

  const profiles: UserProfile[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`${PROFILE_KEY}_`)) continue;

    try {
      const data = localStorage.getItem(key);
      if (data) {
        profiles.push(JSON.parse(data));
      }
    } catch {
      // Skip malformed profile entries instead of blocking backup creation.
    }
  }

  return profiles;
}

export function restoreUserProfiles(profiles: UserProfile[]): number {
  let restored = 0;

  for (const profile of profiles) {
    saveUserProfile(profile);
    restored++;
  }

  return restored;
}

// Update error patterns based on feedback
export function updateErrorPatterns(
  userId: string,
  feedback: {
    grammarRangeAndAccuracy: string;
    lexicalResource: string;
    fluencyAndCoherence: string;
    pronunciation: string;
    weaknesses: string[];
  }
): UserProfile {
  const existing = getUserProfile(userId) || {
    userId,
    commonErrors: [],
    strengths: [],
    weakAreas: [],
    practiceCount: 0,
    averageBand: 0,
    lastUpdated: new Date().toISOString(),
  };

  // Extract error patterns from weaknesses
  const newPatterns: ErrorPattern[] = [];

  feedback.weaknesses.forEach((weakness) => {
    // Check if this pattern already exists
    const existingPattern = existing.commonErrors.find(
      (p) => p.pattern.toLowerCase() === weakness.toLowerCase()
    );

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.lastOccurred = new Date().toISOString();
    } else {
      // Determine type based on keywords
      let type: ErrorPattern["type"] = "fluency";
      const lowerWeakness = weakness.toLowerCase();

      if (
        lowerWeakness.includes("grammar") ||
        lowerWeakness.includes("tense") ||
        lowerWeakness.includes("sentence structure")
      ) {
        type = "grammar";
      } else if (
        lowerWeakness.includes("vocabulary") ||
        lowerWeakness.includes("word") ||
        lowerWeakness.includes("lexical")
      ) {
        type = "vocabulary";
      } else if (
        lowerWeakness.includes("pronunciation") ||
        lowerWeakness.includes("accent") ||
        lowerWeakness.includes("sound")
      ) {
        type = "pronunciation";
      }

      newPatterns.push({
        id: `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type,
        pattern: weakness,
        examples: [],
        frequency: 1,
        lastOccurred: new Date().toISOString(),
      });
    }
  });

  // Merge new patterns
  existing.commonErrors = [...existing.commonErrors, ...newPatterns]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20); // Keep top 20 most frequent errors

  // Update practice count
  existing.practiceCount++;
  existing.lastUpdated = new Date().toISOString();

  // Save updated profile
  saveUserProfile(existing);

  return existing;
}

// Get personalized suggestions based on error patterns
export function getPersonalizedSuggestions(userId: string): string[] {
  const profile = getUserProfile(userId);
  if (!profile || profile.commonErrors.length === 0) {
    return [];
  }

  const suggestions: string[] = [];
  const topErrors = profile.commonErrors.slice(0, 5);

  topErrors.forEach((error) => {
    switch (error.type) {
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
  });

  return suggestions;
}

// Get error statistics
export function getErrorStats(userId: string): {
  totalErrors: number;
  byType: Record<string, number>;
  mostFrequent: ErrorPattern | null;
} {
  const profile = getUserProfile(userId);
  if (!profile) {
    return { totalErrors: 0, byType: {}, mostFrequent: null };
  }

  const byType: Record<string, number> = {
    grammar: 0,
    vocabulary: 0,
    fluency: 0,
    pronunciation: 0,
  };

  profile.commonErrors.forEach((error) => {
    byType[error.type] = (byType[error.type] || 0) + error.frequency;
  });

  return {
    totalErrors: profile.commonErrors.reduce(
      (sum, e) => sum + e.frequency,
      0
    ),
    byType,
    mostFrequent:
      profile.commonErrors.length > 0 ? profile.commonErrors[0] : null,
  };
}
