# EchoLingo Product Specification

## 1. Product Overview

EchoLingo is an AI-powered IELTS Speaking practice application.

The goal of EchoLingo is to help IELTS learners practice speaking in a more natural, interactive, and personalized way. Instead of only reading sample answers or memorizing templates, users can practice with an AI examiner that asks IELTS-style questions, follows up based on the user's answers, and provides useful feedback after the session.

The first version of EchoLingo should focus on a simple text-based IELTS Speaking practice experience. Real-time voice interaction will be added later after the core practice workflow is stable.

---

## 2. Core Problem

Many IELTS learners struggle with speaking practice because:

- They do not always have a real partner or teacher to practice with.
- They are not familiar with IELTS Speaking Part 1, Part 2, and Part 3 question styles.
- They often repeat simple vocabulary and sentence patterns.
- They need feedback on fluency, grammar, vocabulary, and coherence.
- They may feel nervous when speaking with a real examiner.

EchoLingo aims to solve this by providing an always-available AI practice partner that can simulate an IELTS examiner and give structured feedback.

---

## 3. Target Users

The main target users are:

- IELTS students preparing for the Speaking test.
- International students who want to improve English speaking confidence.
- Learners who want low-pressure speaking practice before talking with real teachers or examiners.
- Users who want feedback on their answers, vocabulary, grammar, and estimated IELTS band score.

---

## 4. MVP Goal

The MVP should be simple, stable, and easy to extend.

The first goal is not to build a complete IELTS platform. The first goal is to build a working practice loop:

1. User starts a speaking practice session.
2. AI examiner asks IELTS-style questions.
3. User types answers.
4. AI continues with follow-up questions.
5. After several turns, AI gives feedback.
6. User can see an estimated band score and improvement suggestions.

Voice, login, database, and advanced analytics are not required in the first version.

---

## 5. MVP Features

### 5.1 Landing Page

The app should have a simple landing page that introduces EchoLingo.

The landing page should include:

- Product name: EchoLingo
- Short tagline
- Brief explanation of the product
- Main call-to-action button: "Start Practice"
- Simple feature highlights

Example tagline:

> Practice IELTS Speaking with an AI examiner anytime.

---

### 5.2 Practice Page

The practice page is the main page of the MVP.

It should include:

- Current IELTS Speaking mode
- AI examiner message area
- User input box
- Send button
- Conversation transcript
- End Session button
- Loading state when AI is generating a response

For the MVP, the practice mode can start with IELTS Speaking Part 1 only.

---

### 5.3 AI Examiner

The AI examiner should behave like an IELTS Speaking examiner.

The examiner should:

- Ask one question at a time.
- Use natural but professional language.
- Start with IELTS Speaking Part 1-style questions.
- Ask follow-up questions based on the user's answer.
- Avoid giving feedback during the practice session unless the session ends.
- Keep the conversation focused on IELTS speaking practice.

The examiner should not:

- Give long explanations during the session.
- Correct every sentence immediately.
- Be too casual.
- Ask multiple questions at once.

---

### 5.4 Session Feedback

After the user ends the session, the app should generate structured feedback.

The feedback should include:

- Estimated IELTS Speaking band score
- Fluency and coherence feedback
- Lexical resource feedback
- Grammar range and accuracy feedback
- Pronunciation placeholder feedback
- Three specific improvement suggestions
- A better version of one of the user's answers

Because the MVP is text-based, pronunciation scoring should be shown as a placeholder or disabled.

Example:

> Pronunciation analysis will be available in the voice version.

---

### 5.5 Local Practice History

For the MVP, practice history can be saved locally in the browser using `localStorage`.

Each saved session should include:

- Date and time
- Practice mode
- Transcript
- Estimated band score
- Feedback summary

A full database is not required in the MVP.

---

## 6. Non-MVP Features

The following features should not be implemented in the first version:

- Real-time voice conversation
- Speech-to-text
- Text-to-speech
- User login
- Cloud database
- Payment system
- Advanced pronunciation scoring
- Multi-user dashboard
- Mobile app
- Full IELTS Writing, Reading, and Listening practice
- Complex multi-agent orchestration
- Teacher marketplace
- Social features

These features may be added in later versions.

---

## 7. Recommended Tech Stack

The recommended MVP tech stack is:

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Next.js API routes or server actions
- OpenAI-compatible LLM API

### Storage

- Browser `localStorage` for MVP practice history

### Deployment

- Vercel or similar simple hosting platform

### Environment Variables

The app should use environment variables for API keys.

Example:

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=your_base_url_here
LLM_MODEL=your_model_name_here
```

Do not hardcode API keys in the source code.

---

## 8. Page Structure

### 8.1 Home Page

Path:

```text
/
```

Purpose:

Introduce EchoLingo and guide users to start practice.

Main components:

- Hero section
- Product description
- Feature cards
- Start Practice button

---

### 8.2 Practice Page

Path:

```text
/practice
```

Purpose:

Allow users to practice IELTS Speaking with an AI examiner.

Main components:

- Practice header
- Chat transcript
- AI examiner message bubbles
- User answer message bubbles
- Input box
- Send button
- End Session button

---

### 8.3 Feedback Page or Feedback Panel

For the MVP, feedback can appear on the same practice page after the session ends.

Optional path:

```text
/feedback
```

This can be added later if needed.

---

### 8.4 History Page

Path:

```text
/history
```

Purpose:

Show locally saved practice sessions.

The MVP history page can be simple.

Main components:

- List of previous sessions
- Date
- Estimated band score
- Short feedback summary
- View transcript button

If this is too much for the first implementation, history can be delayed until after the main practice flow works.

---

## 9. Core User Flow

### 9.1 Practice Flow

1. User opens EchoLingo.
2. User clicks "Start Practice".
3. User enters the practice page.
4. AI examiner asks the first IELTS Part 1 question.
5. User types an answer.
6. AI examiner asks a follow-up question.
7. The conversation continues for around 5 to 8 turns.
8. User clicks "End Session".
9. AI evaluator generates feedback.
10. User reviews estimated band score and improvement suggestions.
11. Session is saved to local history.

---

## 10. Data Models

### 10.1 Chat Message

```ts
type ChatMessage = {
  id: string;
  role: "examiner" | "user";
  content: string;
  createdAt: string;
};
```

---

### 10.2 Speaking Session

```ts
type SpeakingSession = {
  id: string;
  mode: "ielts_part_1" | "ielts_part_2" | "ielts_part_3";
  messages: ChatMessage[];
  feedback?: SessionFeedback;
  createdAt: string;
  endedAt?: string;
};
```

---

### 10.3 Session Feedback

```ts
type SessionFeedback = {
  estimatedBand: number;
  fluencyAndCoherence: string;
  lexicalResource: string;
  grammarRangeAndAccuracy: string;
  pronunciation: string;
  strengths: string[];
  weaknesses: string[];
  improvementSuggestions: string[];
  improvedSampleAnswer: string;
};
```

---

## 11. API Design

### 11.1 Generate Examiner Response

Endpoint:

```text
POST /api/examiner
```

Purpose:

Generate the next IELTS examiner question.

Request body:

```json
{
  "mode": "ielts_part_1",
  "messages": [
    {
      "role": "examiner",
      "content": "Let's talk about your hometown. Where is your hometown?"
    },
    {
      "role": "user",
      "content": "My hometown is Shanghai. It is a very big city."
    }
  ]
}
```

Response body:

```json
{
  "message": "What do you like most about your hometown?"
}
```

---

### 11.2 Generate Feedback

Endpoint:

```text
POST /api/feedback
```

Purpose:

Generate structured IELTS Speaking feedback after the session ends.

Request body:

```json
{
  "mode": "ielts_part_1",
  "messages": [
    {
      "role": "examiner",
      "content": "Where is your hometown?"
    },
    {
      "role": "user",
      "content": "My hometown is Shanghai."
    }
  ]
}
```

Response body:

```json
{
  "estimatedBand": 6.0,
  "fluencyAndCoherence": "The user can communicate basic ideas, but some answers need more development.",
  "lexicalResource": "The vocabulary is understandable but could be more varied.",
  "grammarRangeAndAccuracy": "The user uses simple sentence structures correctly, but should try more complex structures.",
  "pronunciation": "Pronunciation analysis is not available in the text-based MVP.",
  "strengths": [
    "Clear basic communication",
    "Relevant answers"
  ],
  "weaknesses": [
    "Limited vocabulary range",
    "Some answers are too short"
  ],
  "improvementSuggestions": [
    "Develop answers with examples.",
    "Use a wider range of vocabulary.",
    "Practice longer and more natural responses."
  ],
  "improvedSampleAnswer": "My hometown is Shanghai, which is one of the largest and most modern cities in China. I like it because it has convenient public transport, many career opportunities, and a lively atmosphere."
}
```

---

## 12. AI Prompt Design

### 12.1 Examiner System Prompt

```text
You are an IELTS Speaking examiner.

Your task is to conduct an IELTS Speaking practice session with the user.

Rules:
- Ask only one question at a time.
- Use natural IELTS Speaking examiner language.
- Start with IELTS Speaking Part 1-style questions.
- Ask follow-up questions based on the user's previous answer.
- Do not give feedback during the session.
- Do not explain the IELTS test unless the user asks.
- Keep your questions clear, short, and suitable for spoken answers.
- Do not be overly friendly or overly casual.
- Keep the practice realistic.

The current practice mode is IELTS Speaking Part 1.
```

---

### 12.2 Evaluator System Prompt

```text
You are an IELTS Speaking evaluator.

Your task is to evaluate the user's speaking practice transcript.

Assess the user's answers based on IELTS Speaking criteria:
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation

Because this MVP is text-based, do not give a real pronunciation score. Instead, state that pronunciation analysis requires voice input.

Return structured feedback with:
- estimatedBand
- fluencyAndCoherence
- lexicalResource
- grammarRangeAndAccuracy
- pronunciation
- strengths
- weaknesses
- improvementSuggestions
- improvedSampleAnswer

Be helpful, specific, and realistic. Do not be too harsh, but do not overestimate the user's score.
```

---

## 13. Development Phases

### Phase 1: Project Setup

Goal:

Create the basic Next.js project structure.

Tasks:

- Set up Next.js with TypeScript.
- Set up Tailwind CSS.
- Create basic layout.
- Add project name and metadata.
- Create `.env.example`.
- Create `docs/product-spec.md`.

Expected result:

The project can run locally.

---

### Phase 2: Landing Page

Goal:

Build a simple but clean home page.

Tasks:

- Create hero section.
- Add EchoLingo title and tagline.
- Add short product description.
- Add feature cards.
- Add "Start Practice" button linking to `/practice`.

Expected result:

User can open the home page and navigate to practice.

---

### Phase 3: Text-Based Practice UI

Goal:

Build the basic practice interface without real AI integration first.

Tasks:

- Create `/practice` page.
- Add chat transcript UI.
- Add examiner and user message bubbles.
- Add text input.
- Add send button.
- Add end session button.
- Add mock examiner response.

Expected result:

User can type answers and see a mock conversation.

---

### Phase 4: AI Examiner API

Goal:

Connect the practice page to an LLM API.

Tasks:

- Create `/api/examiner`.
- Add examiner system prompt.
- Send conversation history to LLM.
- Return the next examiner question.
- Handle loading and error states.

Expected result:

AI examiner can ask dynamic follow-up questions.

---

### Phase 5: Feedback Generation

Goal:

Generate structured feedback after the practice session.

Tasks:

- Create `/api/feedback`.
- Add evaluator system prompt.
- Send full transcript to LLM.
- Parse structured feedback.
- Display feedback on the practice page.

Expected result:

User can end a session and receive an estimated band score and improvement suggestions.

---

### Phase 6: Local History

Goal:

Save completed sessions locally.

Tasks:

- Save session data to `localStorage`.
- Create `/history` page.
- Show previous sessions.
- Allow user to view old transcript and feedback.

Expected result:

User can review previous practice sessions.

---

### Phase 7: Polish and Deployment

Goal:

Make the MVP presentable.

Tasks:

- Improve UI spacing and responsiveness.
- Add empty states.
- Add error messages.
- Add loading indicators.
- Check environment variables.
- Prepare for deployment.
- Update `README.md`.

Expected result:

EchoLingo MVP is usable and ready for a GitHub demo.

---

## 14. Coding Guidelines for the Agent

When implementing EchoLingo, follow these rules:

- Do not overengineer.
- Build one phase at a time.
- Keep the code simple and readable.
- Use TypeScript types for core data models.
- Avoid unnecessary dependencies.
- Do not implement voice features in the MVP.
- Do not implement login in the MVP.
- Do not hardcode API keys.
- Make sure the app runs after each phase.
- After each phase, explain what was changed and how to test it.
- Prefer small, incremental commits or clear file-by-file changes.

---

## 15. README Description

EchoLingo is an AI-powered IELTS Speaking practice app that helps learners practice with an AI examiner, receive structured feedback, and improve their speaking confidence.

The MVP focuses on text-based IELTS Speaking Part 1 practice, including dynamic examiner questions, user answers, estimated band score, and feedback based on IELTS Speaking criteria.

Future versions will support real-time voice conversation, pronunciation analysis, personalized learning memory, and multi-agent coaching.