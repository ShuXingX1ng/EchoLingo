"use client";

import { useState, useEffect } from "react";
import {
  getRecordingsBySession,
  type Recording,
} from "@/lib/recordings";
import AudioPlayback from "./AudioPlayback";

interface RecordingsListProps {
  sessionId: string;
}

export default function RecordingsList({ sessionId }: RecordingsListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecordings = async () => {
      try {
        const data = await getRecordingsBySession(sessionId);
        setRecordings(data);
      } catch (error) {
        console.error("Failed to load recordings:", error);
      }
      setLoading(false);
    };

    loadRecordings();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading recordings...
      </div>
    );
  }

  if (recordings.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Your Recordings
      </h4>
      <div className="space-y-2">
        {recordings.map((recording) => (
          <div key={recording.id} className="border rounded-lg p-3">
            <AudioPlayback blob={recording.blob} />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(recording.timestamp).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
