import type { PteTaskType } from "@/types"

const STORAGE_KEY = "echolingo_task_bank"
const MAX_PER_TYPE = 10

type Bank = Partial<Record<PteTaskType, string[]>>

function readBank(): Bank {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeBank(bank: Bank): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank))
  } catch {
    // quota exceeded — skip caching
  }
}

// Returns a random cached stimulus for the given task type, or null if the bank is empty.
export function getStimulusFromBank(taskType: PteTaskType): string | null {
  const pool = readBank()[taskType]
  if (!pool || pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// Adds a stimulus to the bank. Deduplicates and caps pool at MAX_PER_TYPE.
export function addStimulusToBank(taskType: PteTaskType, text: string): void {
  const bank = readBank()
  const pool = bank[taskType] ?? []
  if (pool.includes(text)) return
  pool.push(text)
  if (pool.length > MAX_PER_TYPE) pool.shift()
  bank[taskType] = pool
  writeBank(bank)
}

export function getBankSize(taskType: PteTaskType): number {
  return readBank()[taskType]?.length ?? 0
}

export function clearBankForType(taskType: PteTaskType): void {
  const bank = readBank()
  delete bank[taskType]
  writeBank(bank)
}

export function clearAllBank(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
