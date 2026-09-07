<div align="center">

# ✦ Lumina Studio

### An AI-powered academic workspace for science & engineering students

**Study. Understand. Write. Calculate. Plan.**

<br>

<img src="./src/assets/hero.png" alt="Lumina Studio" width="760">

<br><br>

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Local_Backend-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-Local_AI-111111?style=for-the-badge)
![LaTeX](https://img.shields.io/badge/LaTeX-Scientific_Notes-008080?style=for-the-badge&logo=latex&logoColor=white)

<br>

![License](https://img.shields.io/badge/status-active_development-7C3AED)
![Local First](https://img.shields.io/badge/privacy-local--first-22C55E)
![AI](https://img.shields.io/badge/AI-Qwen_3.5-0EA5E9)
![RAG](https://img.shields.io/badge/RAG-Hybrid-F59E0B)

</div>

---

## What is Lumina Studio?

**Lumina Studio** is a local-first academic workspace designed to bring the tools a science or engineering student uses every day into a single environment.

Instead of switching continuously between a notebook, AI chatbot, PDF reader, calendar, grade spreadsheet, scientific calculator and transcription tool, Lumina connects them around the same academic context.

It combines:

- AI-assisted studying
- contextual subject chat
- LaTeX scientific note-taking
- lecture transcription
- hybrid retrieval over notes and PDFs
- symbolic and numerical computation
- scientific plotting
- academic planning
- grade tracking
- study-generation tools
- calendar integration

The goal is not to build another generic AI chat interface.

> **Lumina is designed as a personal academic operating system.**

---

# ✨ Core experience

Lumina is organized around four primary workspaces:

| Workspace | Purpose |
|---|---|
| 📚 **Study** | Contextual AI tutor, recordings and study tools |
| 📝 **Notes** | LaTeX notebook organized by subject and date |
| 📅 **Agenda** | Events, deadlines and academic diary |
| 📊 **Grades** | Continuous assessment tracking and target calculation |

The current academic environment includes:

- Nanotechnologies
- Quantum Technologies
- Microelectronics Design
- CPIA
- Biophotonics

---

# 🧠 Context-aware AI tutor

Lumina includes a subject-aware AI tutor powered locally through **Ollama**.

The current default model is:

```text
qwen3.5:4b
```

The assistant can operate in different study modes:

### Conceptual
Focused on explanations, intuition and understanding.

### Problems
Designed for exercises, equations and problem-solving.

### Exam
Focused on examination-style questions and preparation.

The tutor receives academic context instead of working as an isolated chatbot.

```text
Question
   │
   ▼
Subject context
   │
   ├──── LaTeX notes
   │
   ├──── PDF library
   │
   ├──── Hybrid RAG
   │
   └──── Scientific Engine
   │
   ▼
Local LLM
   │
   ▼
Contextual answer
```

---

# 🔎 Hybrid RAG

Lumina includes a custom retrieval pipeline for searching both personal notes and academic PDFs.

The retrieval architecture combines:

```text
                  User question
                       │
              ┌────────┴────────┐
              ▼                 ▼
        LaTeX Notes          PDF Library
              │                 │
            BM25              Retrieval
              └────────┬────────┘
                       ▼
               Candidate chunks
                       │
                       ▼
              Semantic reranking
                       │
                       ▼
                Best evidence
                       │
                       ▼
                    Qwen
```

The hybrid system combines lexical and semantic retrieval.

Current ranking strategy:

```text
44% lexical relevance
56% semantic similarity
```

Only a limited number of candidate fragments are reranked, avoiding the need to embed the entire library for every query.

Semantic retrieval uses a lightweight local embedding model:

```text
embeddinggemma:300m-qat-q4_0
```

If semantic reranking is unavailable, Lumina automatically falls back to lexical retrieval.

---

# 🔬 Scientific Engine

Engineering and physics questions often require more than language generation.

Lumina therefore includes a dedicated scientific computation layer.

### Supported tools

- **SymPy** — symbolic mathematics
- **NumPy** — arrays and numerical operations
- **SciPy** — numerical integration, root solving and differential equations
- **Matplotlib** — scientific visualization

### Supported operations

```text
simplify
expand
factor
solve
differentiate
integrate
limit
series
evaluate

matrix operations
linear systems
root finding
numerical integration
ODE solving
FFT
polynomial fitting
scientific plots
```

Example questions:

```text
Solve x² - 5x + 6 = 0
```

```text
Calculate the integral of sin(x)² between 0 and π
```

```text
Find the eigenvalues of [[2,1],[1,2]]
```

```text
Plot sin(x) + 0.3 sin(5x) between -2π and 2π
```

Generated plots can be returned directly to the conversation.

---

## 🔐 Restricted scientific execution

The language model is **not given unrestricted Python execution**.

Instead:

```text
LLM
 │
 ▼
Restricted JSON plan
 │
 ▼
Scientific Engine
 │
 ├── allowed operation?
 │
 ├── validated arguments?
 │
 └── execute
 │
 ▼
Structured result
```

Only explicitly supported scientific operations can be executed.

This keeps the AI layer separated from arbitrary local code execution.

---

# 📝 LaTeX Notebook

Lumina includes a scientific notebook designed around LaTeX rather than plain-text notes.

Notes are organized by:

```text
Subject
   └── Date
        └── LaTeX content
```

The notebook supports mathematical notation and scientific content while keeping the underlying source editable.

Lecture transcriptions can also be transformed into structured LaTeX notes.

The AI is instructed to:

- preserve the meaning of the lecture
- improve oral phrasing
- structure explanations
- convert formulas to LaTeX
- avoid inventing missing content
- explicitly mark uncertain transcription sections

---

# 🎙️ Lecture transcription

Lumina includes a transcription workflow for transforming classroom audio into useful study material.

Typical workflow:

```text
Lecture
   │
   ▼
Audio / speech
   │
   ▼
Transcription
   │
   ▼
AI restructuring
   │
   ▼
Scientific LaTeX notes
   │
   ▼
Subject notebook
```

The transcription remains connected to the subject being studied.

---

# 🧩 Study tools

Lumina can transform academic context into multiple learning formats.

Current study modes include:

### 🗺️ Mind maps

Convert subject material into structured conceptual relationships.

### 🎧 Podcast-style explanations

Transform study content into a more conversational learning format.

### 🃏 Flashcards

Generate active-recall material from subject context.

### 📝 Practice exams

Generate examination-style exercises for revision.

---

# 📅 Academic Planner

Lumina also acts as a lightweight academic organization system.

It includes:

- academic events
- deadlines
- daily notes
- calendar navigation
- subject-aware planning
- diary entries

Academic data is persisted locally.

Deep links also allow Lumina to open directly into a particular workspace or subject.

Example:

```text
?workspace=study&subject=quantum_technologies
```

---

# 📊 Grade Tracker

The Grade Tracker models the actual evaluation structure of each subject rather than using a generic average.

Lumina can calculate:

- current average over completed assessments
- accumulated contribution toward the final grade
- maximum possible final grade
- grade required on remaining assessments to reach a target

Assessment weights remain editable and custom activities can be added manually.

---

# 📆 Calendar integration

Lumina contains a bridge for integrating its academic planning system with **Google Calendar** workflows.

This allows the academic workspace and external calendar planning to remain connected rather than behaving as independent systems.

---

# 🦙 Desktop companion

Lumina also includes an experimental desktop companion.

The companion can provide shortcuts to:

- Study
- Notes
- Agenda
- Grades
- PDF Library
- service restart controls

It can also monitor whether the Lumina frontend and backend are currently available.

This creates a desktop entry point into the academic environment rather than requiring the application to be opened manually each time.

---

# 🌍 Languages

Lumina currently supports interface / AI workflow configuration for:

- 🇨🇦 Català
- 🇪🇸 Español
- 🇬🇧 English

The selected language can also influence speech recognition and generated academic content.

---

# 🏗️ Architecture

Lumina follows a local-first architecture.

```text
┌────────────────────────────────────────────────────┐
│                    LUMINA STUDIO                   │
├────────────────────────────────────────────────────┤
│                                                    │
│                  React + Vite                      │
│                                                    │
│   Study   Notes   Agenda   Grades   Transcription  │
│      │       │       │        │           │        │
└──────┼───────┼───────┼────────┼───────────┼────────┘
       │       │       │        │           │
       └───────┴───────┴────────┴───────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Node / Express    │
              │    Local Backend    │
              └──────────┬──────────┘
                         │
       ┌─────────────────┼────────────────────┐
       │                 │                    │
       ▼                 ▼                    ▼
   Ollama AI         RAG Engine        Scientific Engine
       │                 │                    │
       ▼                 ▼                    ▼
  Qwen 3.5       Notes + PDFs        Python scientific
                                    computation stack
```

---

# 🔒 Local-first philosophy

Lumina is designed primarily as a **personal local application**.

Academic notes, grades, planning data and study context do not need to be uploaded to a custom cloud backend in order for the core application to operate.

Local AI is provided through Ollama.

This design provides several benefits:

- greater control over academic data
- offline-capable AI workflows once models are installed
- no per-message API cost for local inference
- direct access to personal academic files
- easier experimentation with custom retrieval systems
- predictable integration with local scientific tools

---

# 🛠️ Tech stack

### Frontend

| Technology | Role |
|---|---|
| React 19 | Application interface |
| Vite 8 | Development and production build |
| Tailwind CSS 4 | Styling infrastructure |
| Lucide React | Interface icons |
| React Markdown | Rich AI responses |
| KaTeX | Mathematical rendering |

### Backend

| Technology | Role |
|---|---|
| Node.js | Local application server |
| Express | API routes |
| Ollama | Local model runtime |
| Qwen 3.5 | Main academic language model |
| EmbeddingGemma | Semantic retrieval |

### Scientific layer

| Technology | Role |
|---|---|
| Python | Scientific execution |
| SymPy | Symbolic mathematics |
| NumPy | Numerical computation |
| SciPy | Scientific algorithms |
| Matplotlib | Plot generation |

---

# 📁 Project structure

```text
Lumina-Studio/
│
├── src/
│   ├── components/
│   │   ├── AcademicPlanner.jsx
│   │   ├── ChatAsignatura.jsx
│   │   ├── GradeTracker.jsx
│   │   ├── LatexNotebook.jsx
│   │   ├── NotesCalendarDiary.jsx
│   │   ├── StudyActionsPanel.jsx
│   │   ├── StudyResultModal.jsx
│   │   ├── TranscriptionPanel.jsx
│   │   └── VisualizadorAudio.jsx
│   │
│   ├── assets/
│   ├── App.jsx
│   └── main.jsx
│
├── server/
│   ├── notesServer.js
│   ├── ragRoutes.js
│   ├── pdfRagRoutes.js
│   ├── hybridRagRoutes.js
│   ├── scientificRoutes.js
│   ├── notebookRoutes.js
│   ├── notebookAiRoutes.js
│   ├── notebookFigureRoutes.js
│   └── googleCalendarBridgeRoutes.js
│
├── notes/
├── library/
├── scientific/
│
├── package.json
└── README.md
```

---

# 🚀 Getting started

## Requirements

You will need:

- **Node.js**
- **npm**
- **Ollama**

For the scientific engine:

- **Python**
- SymPy
- NumPy
- SciPy
- Matplotlib

---

## 1. Clone the repository

```powershell
git clone https://github.com/PauMonterosa/Lumina-Studio.git
cd Lumina-Studio
```

---

## 2. Install JavaScript dependencies

```powershell
npm install
```

---

## 3. Install the local AI model

Install and start Ollama, then download the default Lumina model:

```powershell
ollama pull qwen3.5:4b
```

Optional semantic retrieval model:

```powershell
ollama pull embeddinggemma:300m-qat-q4_0
```

---

## 4. Start the Lumina backend

```powershell
npm run notes
```

The local backend runs on:

```text
http://localhost:3001
```

---

## 5. Start the frontend

Open another terminal:

```powershell
npm run dev
```

Vite will display the local application address, typically:

```text
http://localhost:5173
```

---

# ✅ Development commands

```powershell
# Development frontend
npm run dev

# Lumina local backend
npm run notes

# Production build
npm run build

# ESLint
npm run lint

# Preview production build
npm run preview
```

---

# 🧪 Health endpoints

Some Lumina subsystems expose local diagnostic endpoints.

### Scientific engine

```text
http://localhost:3001/api/scientific/health
```

### Hybrid RAG

```text
http://localhost:3001/api/rag/hybrid/health
```

These can be used to verify that the corresponding local services are available.

---

# 🎯 Design principles

Lumina is built around five principles.

### 01 — Academic context first

AI should understand what subject and material the student is working with.

### 02 — Tools, not just chat

Language models are combined with retrieval, structured notes, scientific computation and planning tools.

### 03 — Local when possible

Personal academic information should remain under the student's control.

### 04 — Verifiable computation

Mathematical operations should be delegated to deterministic scientific tools when appropriate.

### 05 — One academic environment

Notes, questions, grades, deadlines and study tools should share context instead of existing in disconnected applications.

---

# 🗺️ Roadmap

Lumina Studio is actively evolving.

Planned and experimental areas include:

- deeper contextual retrieval
- improved PDF understanding
- richer scientific visualization
- more robust LaTeX compilation workflows
- automatic lecture organization
- smarter study planning
- cross-subject knowledge connections
- improved calendar synchronization
- desktop companion improvements
- academic analytics
- additional local AI models

---

# ⚠️ Project status

Lumina Studio is currently an **experimental personal academic platform under active development**.

Some integrations and installation workflows are still evolving and may require local configuration.

The repository also contains migration and installer files from previous development iterations.

---

# 👨‍💻 Author

**Pau Monterosa**

Engineering student exploring the intersection of:

- artificial intelligence
- scientific computing
- education technology
- local-first software
- human-computer interaction

[![GitHub](https://img.shields.io/badge/GitHub-PauMonterosa-181717?style=for-the-badge&logo=github)](https://github.com/PauMonterosa)

---

<div align="center">

## ✦ LUMINA STUDIO

**Your notes, AI tutor, scientific tools and academic planning — in one place.**

<br>

Built for studying science and engineering differently.

</div>
