"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import type { Topic } from "@/lib/topics";
import { getCategories } from "@/lib/topics";

interface TopicFormProps {
  topic?: Topic;
  onSave: (topic: {
    id: string;
    name: string;
    category: string;
    part1_questions: string[];
    part2_cue_card: string;
    part3_questions: string[];
    is_active: boolean;
  }) => void;
  onCancel: () => void;
}

export default function TopicForm({ topic, onSave, onCancel }: TopicFormProps) {
  const { t } = useTranslation();
  const categories = getCategories();

  const [id, setId] = useState(topic?.id || "");
  const [name, setName] = useState(topic?.name || "");
  const [category, setCategory] = useState(topic?.category || categories[0] || "");
  const [part1Questions, setPart1Questions] = useState(
    topic?.part1Questions.join("\n") || ""
  );
  const [part2CueCard, setPart2CueCard] = useState(topic?.part2CueCard || "");
  const [part3Questions, setPart3Questions] = useState(
    topic?.part3Questions.join("\n") || ""
  );
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: id.trim(),
      name: name.trim(),
      category,
      part1_questions: part1Questions
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean),
      part2_cue_card: part2CueCard.trim(),
      part3_questions: part3Questions
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean),
      is_active: isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            ID
          </label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            disabled={!!topic}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white disabled:opacity-50"
            placeholder="e.g. my-topic"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("admin.name")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            placeholder="e.g. My Topic"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("admin.category")}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {isActive ? t("admin.active") : t("admin.inactive")}
            </span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("admin.part1Questions")}
        </label>
        <textarea
          value={part1Questions}
          onChange={(e) => setPart1Questions(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="One question per line"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("admin.part2CueCard")}
        </label>
        <textarea
          value={part2CueCard}
          onChange={(e) => setPart2CueCard(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="Describe a..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("admin.part3Questions")}
        </label>
        <textarea
          value={part3Questions}
          onChange={(e) => setPart3Questions(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          placeholder="One question per line"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t("admin.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t("admin.cancel")}
        </button>
      </div>
    </form>
  );
}
