import { describe, expect, it } from "vitest";
import {
  TOPICS,
  getCategories,
  getRandomTopic,
  getTopicById,
  getTopicsByCategory,
} from "./topics";

describe("topics", () => {
  it("finds topics by id", () => {
    expect(getTopicById("hometown")?.name).toBe("Hometown");
    expect(getTopicById("missing-topic")).toBeUndefined();
  });

  it("returns unique categories in source order", () => {
    const categories = getCategories();

    expect(categories.length).toBe(new Set(categories).size);
    expect(categories[0]).toBe(TOPICS[0].category);
    expect(categories).toContain("Abstract");
  });

  it("filters topics by category", () => {
    const placeTopics = getTopicsByCategory("Place");

    expect(placeTopics.length).toBeGreaterThan(0);
    expect(placeTopics.every((topic) => topic.category === "Place")).toBe(true);
  });

  it("returns a random topic from the topic list", () => {
    expect(TOPICS).toContain(getRandomTopic());
  });
});
