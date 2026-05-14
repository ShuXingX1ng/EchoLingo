import Link from "next/link";
import MuteButton from "@/components/MuteButton";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      {/* Navigation */}
      <nav className="w-full px-6 py-4" aria-label="Main navigation">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gray-900 dark:text-white">
            EchoLingo
          </Link>
          <div className="flex items-center gap-4">
            <MuteButton />
            <Link
              href="/practice"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Practice
            </Link>
            <Link
              href="/history"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              History
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main id="main-content" className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            EchoLingo
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-4 max-w-2xl mx-auto">
            Practice IELTS Speaking with an AI examiner anytime.
          </p>
          <p className="text-base sm:text-lg text-gray-500 dark:text-gray-400 mb-10 max-w-xl mx-auto">
            Get realistic practice, receive detailed feedback on fluency,
            vocabulary, grammar, and track your estimated band score.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-card-in">
            <Link
              href="/practice"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-600 text-white font-medium transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Quick Start
            </Link>
            <Link
              href="/practice/setup"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-500 text-white font-medium transition-all hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              Choose Mode
            </Link>
            <Link
              href="/history"
              className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-8 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium transition-all hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              View History
            </Link>
          </div>

          {/* Feature Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto" aria-label="Features">
            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">🎯</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Realistic Practice
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Practice with an AI examiner that asks IELTS Part 1 questions and
                follows up based on your answers.
              </p>
            </div>

            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Band Score Estimate
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Get an estimated IELTS Speaking band score after each practice
                session based on official criteria.
              </p>
            </div>

            <div className="stagger-item bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">💡</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Detailed Feedback
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Receive feedback on fluency, vocabulary, grammar, and specific
                suggestions for improvement.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
        <p>EchoLingo - AI-powered IELTS Speaking practice</p>
      </footer>
    </div>
  );
}
