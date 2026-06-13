import { NextResponse } from "next/server"

// Word Lookup proxy. The dictionary (ECDICT) lives in the Python backend, so
// unlike the LLM-only routes this one forwards to the FastAPI service rather
// than calling DeepSeek directly. See ADR 0006.

const API_TIMEOUT = 30000

export async function POST(request: Request) {
  const backend = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!backend) {
    return NextResponse.json(
      { error: "Word Lookup backend is not configured." },
      { status: 503 }
    )
  }

  let query: string
  try {
    const body = (await request.json()) as { query?: string }
    query = (body.query ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const res = await fetch(`${backend}/api/word-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const detail =
        (data && (data.detail || data.error)) || "Lookup failed"
      return NextResponse.json({ error: detail }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError"
    return NextResponse.json(
      { error: aborted ? "Lookup timed out" : "Lookup failed" },
      { status: 502 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
