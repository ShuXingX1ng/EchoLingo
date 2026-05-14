import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center animate-fade-in">
        <div className="text-6xl font-bold text-blue-500 mb-4">404</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Page Not Found
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg active:scale-[0.98]"
          >
            Go Home
          </Link>
          <Link
            href="/practice"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            Start Practice
          </Link>
        </div>
      </div>
    </div>
  );
}
