# EchoLingo

AI-powered IELTS Speaking practice app for text, voice, mock-exam, and shadowing practice.

## Features

- **AI examiner**: Practice IELTS Speaking Part 1, Part 2, and Part 3 with an OpenAI-compatible LLM examiner.
- **Full mock exam**: Run a Part 1 -> Part 2 -> Part 3 flow with stage indicators and Part 2 preparation/speaking timers.
- **Structured feedback**: Receive estimated IELTS band scores, skill-dimension feedback, strengths, weaknesses, improved sample answers, and grammar/vocabulary/fluency/pronunciation error annotations.
- **Voice practice**: Use browser STT for speech input and Azure Neural TTS for examiner speech output.
- **Pronunciation assessment**: Use Azure Pronunciation Assessment for overall, accuracy, fluency, completeness, word-level, and phoneme-level feedback.
- **Shadowing practice**: Listen to standard pronunciation, record a repeat, and review a pronunciation summary plus sentence-level results.
- **Practice history**: Store sessions locally, sync authenticated sessions with Supabase, search/filter history, export/import data, and replay saved recordings.
- **Progress tools**: Track statistics, goals, streaks, exam countdown, daily reminders, and personalized learning recommendations.
- **Platform features**: Supabase email/Google auth, admin topic/user management, dark mode, PWA support, and English/Chinese UI.

## Tech Stack

- **Frontend**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **AI**: OpenAI-compatible Chat Completions API
- **Speech**: Azure Speech SDK for Neural TTS and Pronunciation Assessment, Web Speech API for STT
- **Storage**: Supabase PostgreSQL/Auth plus browser localStorage and IndexedDB

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- An API key from an OpenAI-compatible provider
- Azure Speech Services key and region for TTS/pronunciation features
- Supabase project URL and anon key for auth/cloud sync

### Installation

```bash
git clone https://github.com/yourusername/echolingo.git
cd echolingo
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus

NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supported LLM Providers

| Provider | Base URL | Example Model |
|----------|----------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Tongyi Qianwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| Zhipu AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |
| Ollama local | `http://localhost:11434/v1` | `qwen2.5:7b` |

### Running the App

```bash
npm run dev
```

Open http://localhost:3000.

## Main Routes

| Route | Purpose |
|-------|---------|
| `/` | Home dashboard with entry points, countdown, and practice status |
| `/practice` | Core practice flow |
| `/practice/setup` | Practice mode/topic setup |
| `/practice/exam` | Full IELTS mock exam |
| `/practice/shadowing` | Shadowing and pronunciation practice |
| `/history` | Session history, filtering, export/import, recordings |
| `/stats` | Practice statistics, goals, trends, recommendations |
| `/settings` | Voice, language, reminders, and app settings |
| `/login` | Supabase email/Google auth |
| `/admin` | Protected admin area |
| `/debug` | Development/debug utilities |

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── examiner/route.ts
│   │   ├── feedback/route.ts
│   │   ├── pronunciation/route.ts
│   │   └── tts/route.ts
│   ├── admin/
│   ├── history/
│   ├── login/
│   ├── practice/
│   ├── settings/
│   └── stats/
├── components/
│   ├── ErrorAnnotations.tsx
│   ├── PronunciationFeedback.tsx
│   ├── VoiceControls.tsx
│   └── ...
├── hooks/
├── lib/
├── locales/
└── types/
```

## Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `LLM_API_KEY` | API key for the OpenAI-compatible LLM provider | AI examiner and feedback |
| `LLM_BASE_URL` | Base URL for the OpenAI-compatible API | AI examiner and feedback |
| `LLM_MODEL` | Chat model name | AI examiner and feedback |
| `AZURE_SPEECH_KEY` | Azure Speech Services subscription key | TTS and pronunciation assessment |
| `AZURE_SPEECH_REGION` | Azure Speech Services region, for example `eastus` | TTS and pronunciation assessment |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Auth and cloud sync |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key | Auth and cloud sync |

## Current Limitations

- Azure voice features require valid Speech Services credentials and network access.
- Speech recognition depends on browser Web Speech API support.
- Supabase-backed features require the database schema/migrations to be applied.
- Payments, plans, social features, and other commercial operations are future/backlog items, not implemented runtime features.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
