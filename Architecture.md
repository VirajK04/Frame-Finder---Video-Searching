# Architecture for MultiModal Search for Browser Native NLEs

## 1. Problem Statement

Search is a basic functionality expected from applications with text. But media data makes search harder.

A professional editor routinely deals with 100+ GB of raw 4K footage. Currently, searching this footage semantically (e.g., "find the clip of the dog catching the frisbee") requires uploading the full-resolution media to a cloud server to run inference pipelines. This creates an unacceptable "Time-to-Value" bottleneck: the editor is blocked by network upload speeds before they can even begin sorting their media bin.

There is no grep for video. Existing multimodal embedding architectures are too slow, network-bound, or computationally expensive to use in a real-time, flow-state editing environment.

## 2. Assumptions

- **Target Environment:** Modern dektop browsers with WebGPU support enabled.
- **User Workflow:** User posseses high-res and heavy media files and wants to search the parts before commiting them to a collaborative cloud timeline or search them for normal edits.
- **Latency Threshold:** The system must process queries and return timestamps in under 100ms.
- **Browser Storage:** The client can persist vector metadata locally using IndexedDB.

## 3. Initial Approach

The standard AI Engineer approach to this problem is to build an **AI Wrapper**- Upload the file to S3 bucket, run a python worker to extract frames, generate embeddings and store it in ChromaDB.

**Problems-**
1. Users cannot search the data till the file is uploaded. Even if inference takes 200ms, transferring a video file is matter of minutes.
2. Compute and Storage costs increase for the company.

## 4. Finalized Plan

** Zero Backend Multimodal Indexer:**
We will build a client side data pipeline. When a user drops a video into the media bin, the browse will extract the frames and utilize the machine's GPU to search items locally.

Server does not need to perform indexing. User can them trim the searched part and upload it to the cloud reducing storage and time to wait.

## 5. Required Libraries

1. **WebCodecs API:** Provides low-level, hardware-accelerated access to the device's native media decoders, bypassing the need for WebAssembly FFmpeg ports.

2. **WebGPU:** Allows browsers to interface directly with the local graphics card (Vulkan/Metal), enabling near-native ML inference.

3. **ONNX Runtime Web:** Compiles standard PyTorch models (like CLIP) to run directly in the browser.

## 6. Architecture

The system works in 4 stages executing within a worker to prevent UI thread blocking.

- **Ingestion:** Local file access
- **Extraction:** WebCodecs API decodes the video. A heuristic engine drops redundant frames (e.g., using structural similarity diffing or a simple 1 FPS extraction rate) to prevent vector bloat.
- **Embedding Engine:** Transformers.js running Xenova/clip-vit-base-patch32. We explicitly configure the ONNX execution provider to use WebGPU.
- **Vector Storage & Search:** Local IndexedDB stores the metadata ({ video_id, timestamp, embedding }). Cosine similarity is calculated directly in JavaScript/WASM during search.

### MVP tradeoffs and Production Considerations

I plan to use some different techniques for the MVP which need to be changed in production. They include-
1. **Extraction:** For *MVP* we use 1 FPS fixed sampling. In *Production* **2-Pass** optimization will be used.
2. **The Demuxer Gap:** WebCodecs VideoDecoder requires raw elementary streams rather than .mp4 containers. For this MVP, I am sampling frames using `<video>` + OffscreenCanvas to focus on WebGPU inference, but a production build requires streaming through mp4box.js or web-demuxer.
3. **Vector Search Scaling:** In-memory JS cosine similarity over IndexedDB works under 100ms for small files (~1,000 vectors). For 50,000+ vectors in a production NLE bin, IndexedDB should handle persistence while an in-memory WASM HNSW index handles vector search.
4. **VRAM Leaks & Context Loss:** Processing thousands of 4K frames through WebGPU can exhaust GPU VRAM or trigger browser context loss under load. The pipeline must explicitly invoke .close() on every VideoFrame / ImageBitmap immediately after inference and provide a fallback to WASM (CPU) if the GPU adapter drops.

## 7. Working

1. **Initialization (Worker):** On app load, the Web Worker initializes Transformers.js with the Xenova/clip-vit-base-patch32 model compiled to the webgpu execution provider. Model weights are cached in browser storage.
2. **Media Loading & Frame Sampling:** When a user drops a video file into the browser, a local object URL is created. Frames are sampled at 1 FPS (1 frame per second).
3. **Frame Transfer:** Each sampled frame is converted to an ImageBitmap (a zero-copy transferrable object) and passed to the Web Worker.
4. **WebGPU Embedding:** The worker passes the ImageBitmap into the CLIP vision model, yielding a 512-dimensional Float32Array embedding.
5. **Memory Cleanup:** The worker immediately calls .close() on the ImageBitmap to release GPU memory and prevent browser context loss.
6. **Persistence:** The embedding and metadata ({ videoName, timestamp, embedding }) are written to IndexedDB via Dexie.js.
7. **Query & Retrieval:** When the user enters a search term (e.g., "sunset over mountains"), the worker embeds the text prompt using CLIP's text encoder and computes cosine similarity against stored keyframe vectors, returning the top-5 matching timestamps under 100ms.

## 8. Advantages

- **Immediate Time-to-Value:** Indexing starts instantly without waiting for cloud upload. User can search the data as soon as it hits the browser. It will be possible once 2-pass extraction is implemented.
- **Lower Storage Requirement:** Editors selectively upload the clips reducing storage and cloud bills also saving hours on upload time.
- **Edge Compute:** NO server compute costs as it happens on user's machine.
- **Privacy:** Editor decides which footage will go to cloud servers and other footage stays on machine itself.

## 9. Limitations

- **Initial Cold Start:** The ONNX models needs to be downloaded initially which provides slow experience to the user at start.
- **Hardware Dependency:** If a user is on an older machine without WebGPU support, ONNX Runtime falls back to WASM/CPU, which will reduce the indexing speed.

## 10. Future Scope

- **Fallback Mechanism:** A telemetry check on load to assess the client's GPU capabilities. If the device is underpowered, the system seamlessly falls back to a traditional server-side inference API which was my initial approach.
- **Local Audio Transcription:** Extracting audio from media files and aligning it with visuals go give user greater search capablities.