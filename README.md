# Frame-Finder : Zero-Backend NLE Search

A client-side multimodal video search prototype. Search your local footage using natural language without waiting for cloud uploads or paying for server-side GPU inference.

## How it works

The app utilizes WebGPU and CLIP (via ONNX Runtime Web) to extract and index video frames entirely locally in the browser. Text queries are embedded locally, and cosine similarity is calculated against the IndexedDB vector store to return timestamp matches in under 100ms.

## Tech Stack

- **Transformers.js** — Local ML inference via WebGPU (`Xenova/clip-vit-base-patch32`)
- **HTML5 Video & OffscreenCanvas** — Zero-copy frame sampling (MVP ingestion)
- **IndexedDB / Dexie.js** — Local vector persistence (`Float32Array`)
- **Vite + React** — UI and Web Worker orchestration

## Architecture & Production Roadmap

See [Architecture.md](./Architecture.md) for a detailed breakdown of system design decisions, memory management (VRAM), and the production requirements for scaling (e.g., WebCodecs demuxing and WASM HNSW indexing).

## Quick Start (Run Locally)

Prerequisites: Node.js and a modern browser with WebGPU enabled (Chrome 113+, Edge, or Safari 18+).

```bash
# Clone the repository
git clone [https://github.com/yourusername/your-repo-name.git](https://github.com/yourusername/your-repo-name.git)
cd your-repo-name

# Install dependencies
npm install

# Start the Vite development server
npm run dev