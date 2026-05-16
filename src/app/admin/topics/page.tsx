"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { TOPICS, type Topic } from "@/lib/topics";
import { createTopic, updateTopic, deleteTopic } from "@/lib/supabase-topics";
import TopicForm from "@/components/admin/TopicForm";

export default function AdminTopicsPage() {
  const { t } = useTranslation();
  const [topics, setTopics] = useState<Topic[]>(TOPICS);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filteredTopics = topics.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async (data: {
    id: string;
    name: string;
    category: string;
    part1_questions: string[];
    part2_cue_card: string;
    part3_questions: string[];
    is_active: boolean;
  }) => {
    let success: boolean;

    if (editingTopic) {
      success = await updateTopic(editingTopic.id, data);
    } else {
      success = await createTopic(data);
    }

    if (success) {
      // Update local state
      const updatedTopic: Topic = {
        id: data.id,
        name: data.name,
        category: data.category,
        part1Questions: data.part1_questions,
        part2CueCard: data.part2_cue_card,
        part3Questions: data.part3_questions,
      };

      if (editingTopic) {
        setTopics((prev) =>
          prev.map((t) => (t.id === editingTopic.id ? updatedTopic : t))
        );
      } else {
        setTopics((prev) => [...prev, updatedTopic]);
      }

      setMessage({ type: "success", text: editingTopic ? "Topic updated!" : "Topic created!" });
      setShowForm(false);
      setEditingTopic(null);
    } else {
      setMessage({ type: "error", text: "Failed to save topic." });
    }

    setTimeout(() => setMessage(null), 3000);
  };

  const handleDelete = async (topicId: string) => {
    if (!window.confirm(t("admin.confirmDelete"))) return;

    const success = await deleteTopic(topicId);
    if (success) {
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
      setMessage({ type: "success", text: "Topic deleted." });
    } else {
      setMessage({ type: "error", text: "Failed to delete topic." });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.topics")}
        </h2>
        <button
          onClick={() => {
            setEditingTopic(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          {t("admin.addTopic")}
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingTopic ? t("admin.editTopic") : t("admin.addTopic")}
          </h3>
          <TopicForm
            topic={editingTopic || undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingTopic(null);
            }}
          />
        </div>
      )}

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search topics..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  {t("admin.name")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  {t("admin.category")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  Part 1
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  Part 3
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTopics.map((topic) => (
                <tr
                  key={topic.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                    {topic.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {topic.category}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {topic.part1Questions.length}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {topic.part3Questions.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingTopic(topic);
                          setShowForm(true);
                        }}
                        className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                      >
                        {t("admin.editTopic")}
                      </button>
                      <button
                        onClick={() => handleDelete(topic.id)}
                        className="px-3 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        {t("admin.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
