import { pipeline, env } from "@huggingface/transformers"
import { db } from "./db"

env.allowLocalModels = false

let clipPipeline = null

async function initModel() {

    if (!clipPipeline) {
        self.postMessage({ type: 'STATUS', status: "loading", message: "Model Loading" })

        clipPipeline = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32', { device: 'webgpu' })

        self.postMessage({ type: 'STATUS', status: "loaded", message: "Model Loaded" })
    }
}

self.onmessage = async (e) => {
    const { type, payload } = e.data

    if (type == 'INIT') {
        try {
            await initModel()
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: `Model loading failed: ${err.message}` })
        }
    }

    if (type == 'INDEX_FRAME') {
        const { videoName, timestamp, imageBitmap } = payload

        try {
            if (!clipPipeline) await initModel()

            let output = await clipPipeline(imageBitmap)

            let embedding = Array.from(output.data)

            if (typeof output.dispose === 'function') {
                output.dispose()
            }

            await db.keyframes.add({ videoName, timestamp, embedding })

            imageBitmap.close()

            self.postMessage({ type: "SUCCESS", message: "Frame Indexed Successfully" })
        } catch (err) {
            imageBitmap.close()
            self.postMessage({ type: "ERROR", message: `Frame indexing failed: ${err.message}` })
        }
    }

    if (type == 'SEARCH') {
        const { query } = payload

        try {

            if (!clipPipeline) await initModel()

            const textOutput = await clipPipeline(query)

            const queryVector = Array.from(textOutput.data)

            if (typeof textOutput.dispose === 'function') {
                textOutput.dispose()
            }

            const frames = await db.keyframes.toArray()

            if (frames.length === 0) {
                self.postMessage({ type: 'SEARCH_RESULTS', results: [] });
                return;
            }

            const results = frames.map(frame => {
                const score = cosineSimilarity(queryVector, frame.embedding);
                return {
                    videoName: frame.videoName,
                    timestamp: frame.timestamp,
                    score
                };
            })
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)

            self.postMessage({ type: 'SEARCH_RESULTS', results })
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: `Search failed: ${err.message}` })
        }
    }
}

function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}