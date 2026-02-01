# Aura

**The Invisible AI Overlay**

Aura is an intelligent, unobtrusive OS copilot designed to integrate seamlessly into your workflow. Unlike traditional windows that clutter your workspace, Aura exists as a transparent, click-through layer that provides instant AI assistance, screen context analysis, and voice interaction—only when you need it.

It is designed to be **heard and felt, but rarely seen.**

## ✨ Core Philosophy

* **Invisible by Default**: Aura runs in "Ghost Mode," allowing you to click through the interface and interact with your work as if nothing is there.
* **Context Aware**: With a single click, Aura can see what you see, analyzing your screen to provide relevant answers to what you are working on.
* **Privacy First**: Built with support for **Local AI (Ollama)**, ensuring your data never has to leave your machine.

## 🚀 Features

* **👻 Ghost Mode**: A completely transparent overlay that doesn't interfere with your mouse clicks or application focus.
* **🧠 Dual Intelligence**:
    * **Local Brain**: Connect to **Ollama** for private, offline, latency-free intelligence (Llama 3, Mistral, etc.).
    * **Cloud Brain**: Switch to **OpenAI (GPT-4)** when you need maximum reasoning power.
* **👁️ Screen Vision**: Instantly capture and analyze your current screen state to debug code, summarize documents, or extract data.
* **🎤 Live Voice Mode**: Speak to Aura naturally. It listens in the background and responds instantly, perfect for hands-free coding or multitasking.
* **⚡ Instant Wake**: Toggle the interface instantly with a global hotkey.

## 🛠️ Tech Stack

Built with modern, high-performance web technologies wrapped in a native shell:

* **Core**: [Electron](https://www.electronjs.org/) (with specialized transparency & click-through handling)
* **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
* **Language**: TypeScript
* **Styling**: Custom CSS & Glassmorphism effects
* **Update System**: Electron-Updater

## ⌨️ Global Shortcuts

| Shortcut (Mac) | Shortcut (Windows) | Action |
| :--- | :--- | :--- |
| `Cmd + Shift + G` | `Ctrl + Shift + G` | **Wake / Sleep** (Toggle Visibility & Focus) |

## 🚀 Getting Started

### Prerequisites

* **Node.js**: Version 18 or higher.
* **Ollama (Optional)**: If you wish to use the local privacy features, install [Ollama](https://ollama.com/) and download a model (e.g., `ollama run llama3`).

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/bryanparreira/aura.git](https://github.com/bryanparreira/aura.git)
    cd aura
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

### 💻 Development

Run the app in development mode with hot-reloading:

```bash
npm run electron:dev