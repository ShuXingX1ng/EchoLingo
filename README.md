# EchoLingo

AI-powered IELTS Speaking practice app that helps learners practice with an AI examiner, receive structured feedback, and improve their speaking confidence.

## Features

- **AI Examiner**: Practice IELTS Speaking Part 1 with an AI that asks questions and follows up based on your answers
- **Band Score Estimate**: Get an estimated IELTS Speaking band score after each session
- **Detailed Feedback**: Receive feedback on fluency, vocabulary, grammar, and pronunciation
- **Practice History**: Review past sessions with full transcripts and feedback
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI**: OpenAI-compatible Chat Completions API
- **Storage**: Browser localStorage for session history

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- An API key from an OpenAI-compatible provider

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/echolingo.git
cd echolingo
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` with your API configuration:
```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

### Supported API Providers

| Provider | Base URL | Recommended Model |
|----------|----------|-------------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 月之暗面 | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` |

### Running the App

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## How to Test the MVP Flow

1. **Start the app**: Run `npm run dev` and open http://localhost:3000
2. **Landing page**: Verify the EchoLingo title, tagline, and feature cards are displayed
3. **Start practice**: Click "Start Practice" to go to the practice page
4. **Answer questions**: Type answers to the examiner's IELTS Part 1 questions
5. **Continue conversation**: Have 3-5 exchanges with the AI examiner
6. **End session**: Click "End Session" in the header
7. **View feedback**: Wait for feedback generation, then review your band score and suggestions
8. **Check history**: Navigate to History page to see your saved session
9. **Review session**: Click on a session to view the full transcript and feedback

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── examiner/route.ts    # Examiner question generation
│   │   └── feedback/route.ts    # Feedback generation
│   ├── history/
│   │   └── page.tsx             # Session history page
│   ├── practice/
│   │   └── page.tsx             # Main practice page
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Landing page
├── lib/
│   └── history.ts               # localStorage utility
└── types/
    └── index.ts                 # TypeScript types
```

## Current MVP Limitations

- **Text-based only**: No voice input/output (planned for future)
- **Part 1 only**: Currently supports IELTS Speaking Part 1 questions
- **Local storage**: Session history is stored in browser localStorage only
- **No user accounts**: No login or cloud sync (planned for future)
- **Single language**: English only

## Future Improvements

- [ ] Voice-based practice with speech-to-text and text-to-speech
- [ ] IELTS Speaking Part 2 and Part 3 support
- [ ] User accounts with cloud sync
- [ ] Pronunciation scoring with audio analysis
- [ ] Progress tracking and analytics
- [ ] Multi-language support
- [ ] Mobile app

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LLM_API_KEY` | API key for the LLM provider | Yes |
| `LLM_BASE_URL` | Base URL for the LLM API (must be OpenAI-compatible) | Yes |
| `LLM_MODEL` | Model name to use | Yes |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- Built with Next.js and Tailwind CSS
- Powered by OpenAI-compatible APIs
- Inspired by the need for accessible IELTS Speaking practice
