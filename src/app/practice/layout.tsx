import WordLookup from "@/components/WordLookup"

// Wraps the Task Practice pages only. The Mock Exam lives under /mock, so the
// Word Lookup helper is excluded from it by construction (see ADR 0006: the
// helper must never appear in a Mock Exam).

export default function PracticeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <WordLookup />
    </>
  )
}
