# 🦙 Lumina Studio V4 — Learning Canvas

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Local_AI-000000)
![Status](https://img.shields.io/badge/status-active-success)

**Lumina Studio V4** is a local-first AI learning workspace designed for university STEM students, especially for **Engineering Physics**.

It combines a contextual AI tutor, voice transcription, study tools, calendar-based class notes and LaTeX note generation into a single local web application.

> Built as a personal **NotebookLM-style Learning Canvas**, powered by local models through Ollama.

---

## ✨ Main Features

### 🧠 Contextual AI Tutor

Lumina includes a central AI tutor connected to a local Ollama model.

The tutor supports three study modes:

| Mode | Purpose |
|---|---|
| Conceptual | Clear explanations and intuition |
| Problems | Step-by-step problem solving |
| Exam | Rigorous exam-style answers |

Each mode changes the visual identity of the chat and also modifies the AI instructions sent to the backend.

---

### 🎙️ Voice Transcription

The app uses the browser’s native Web Speech API to transcribe classes.

Supported active languages:

| Language | Code |
|---|---|
| Català | `ca-ES` |
| Castellano | `es-ES` |
| English | `en-US` |

The selected language affects:

- speech recognition,
- AI responses,
- LaTeX note generation,
- study tools.

---

### 📅 Class Diary

Lumina includes an interactive monthly diary where transcriptions can be saved by date.

Each note stores:

- subject,
- date,
- language,
- transcription text,
- LaTeX conversion status.

---

### 📄 LaTeX Notes Export

Saved transcriptions can be converted into clean LaTeX fragments using Ollama.

The backend appends generated notes into:

```txt
notes/subjects/<subject>.tex
```

The system intentionally avoids generating full LaTeX documents. It only appends reusable fragments.

---

### 🧩 Study Tools

Lumina includes four AI-powered study actions:

| Tool | Output |
|---|---|
| Mindmap | Conceptual map |
| Podcast | Educational script |
| Flashcards | Active recall cards |
| Exam | Practical exam-style problems |

These tools use the active subject, diary notes and LaTeX notes as context.

---

## 🏗️ Project Structure

```txt
src/
├─ App.jsx
├─ index.css
└─ components/
   ├─ ChatAsignatura.jsx
   ├─ MessageContent.jsx
   ├─ VisualizadorAudio.jsx
   ├─ TranscriptionPanel.jsx
   ├─ NotesCalendarDiary.jsx
   ├─ StudyActionsPanel.jsx
   └─ StudyResultModal.jsx

server/
└─ notesServer.js

notes/
└─ subjects/
   ├─ electronics.tex
   ├─ quantum.tex
   ├─ control.tex
   ├─ photonics.tex
   └─ solid_state.tex
```

---

## 📚 Subjects

Lumina is currently configured for Engineering Physics subjects:

- Electrónica Física
- Mecánica Cuántica
- Teoría de Control
- Fotónica
- Estado Sólido

---

## ⚙️ Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS v4
- lucide-react
- react-markdown
- remark-math
- rehype-katex
- KaTeX

### Backend

- Node.js
- Express
- CORS
- local filesystem storage

### AI

- Ollama local API
- Default model: `qwen2.5`

### Browser APIs

- Web Audio API
- Web Speech API
- localStorage

---

## 🚀 Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Pull the local Ollama model

```bash
ollama pull qwen2.5
```

### 3. Start Ollama

```bash
ollama serve
```

### 4. Start the backend

```bash
npm run notes
```

The backend runs at:

```txt
http://localhost:3001
```

### 5. Start the frontend

```bash
npm run dev
```

The frontend runs at:

```txt
http://localhost:5173
```

---

## 🧪 Available Scripts

```bash
npm run dev
```

Starts the Vite frontend.

```bash
npm run notes
```

Starts the local Express backend for notes and AI study tools.

```bash
npm run build
```

Builds the frontend for production.

```bash
npm run preview
```

Previews the production build locally.

---

## 🧠 How the AI Context Works

Lumina does not simply send a raw prompt to Ollama.

The contextual chat sends data to the local backend:

```txt
React → Express backend → Ollama
```

The backend prepares a structured prompt using:

- active subject,
- active language,
- selected chat mode,
- selected calendar date,
- diary notes,
- LaTeX notes,
- current conversation.

This makes the tutor more reliable than a simple generic chatbot.

---

## 📱 iPhone Usage

Lumina is currently a local web application.

A quick iPhone workflow is possible by running the app on your computer and opening it from Safari on the iPhone through the same local network.

However, because the app depends on:

- local Ollama,
- local Node backend,
- browser speech recognition,

a true iPhone app would require additional work.

Possible future options:

1. **Local network web app**
   - easiest option,
   - runs from the computer,
   - accessed by iPhone browser.

2. **PWA**
   - installable from Safari,
   - but speech recognition may not work reliably on iOS home-screen web apps.

3. **Native iOS wrapper**
   - using Capacitor or React Native,
   - best long-term option,
   - could use native iOS speech recognition.

---

## 🔐 Privacy

Lumina is designed as a local-first application.

By default:

- notes stay on your machine,
- Ollama runs locally,
- LaTeX files are stored locally,
- no cloud AI API is required.

Do not commit private notes or transcripts to GitHub.

---

## 🧭 Roadmap

Planned improvements:

- PDF upload and document-based context
- exam repository per subject
- semantic search / RAG
- native iPhone version
- better offline transcription
- export full LaTeX documents
- subject-specific prompt templates
- study session analytics

---

## 🦙 Project Vision

Lumina Studio aims to become a personal AI-powered study environment for demanding technical degrees.

The goal is not just to summarize notes, but to help students:

- understand concepts,
- solve problems,
- prepare exams,
- organize classes,
- generate high-quality academic material,
- build a long-term personal knowledge base.

---

## Author

Developed by **Pau Monterosa** as a local AI learning workspace for Engineering Physics.