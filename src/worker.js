import { CLIPVisionModelWithProjection, CLIPTextModelWithProjection, AutoProcessor, AutoTokenizer, RawImage, env } from "@huggingface/transformers"
import { db } from "./db"

env.allowLocalModels = false

let visionModel = null
let processor = null
let textModel = null
let tokenizer = null

const MODEL_ID = 'Xenova/clip-vit-base-patch32'

const offscreenCanvas = new OffscreenCanvas(224, 224)
const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true })

async function initVisionModel() {
    if (!visionModel) {
        self.postMessage({ type: 'STATUS', status: "loading", message: "Loading Vision Model" })
        
        processor = await AutoProcessor.from_pretrained(MODEL_ID)
        
        try {
            visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { device: 'webgpu' })
        } catch (err) {
            console.warn("WebGPU not supported or context lost. Falling back to WASM/CPU.", err)
            visionModel = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { device: 'wasm' })
        }
        
        self.postMessage({ type: 'STATUS', status: "loaded", message: "Vision Pipeline Ready" })
        
        initTextModel()
    }
}

async function initTextModel() {
    if (!textModel) {
        tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID)
        try {
            textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { device: 'webgpu' })
        } catch (err) {
            textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { device: 'wasm' })
        }
    }
}

self.onmessage = async (e) => {
    const { type, payload } = e.data

    if (type === 'INIT') {
        try {
            await initVisionModel()
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: `Model initialization failed: ${err.message}` })
        }
    }

    if (type === 'INDEX_FRAME') {
        const { videoName, timestamp, imageBitmap } = payload

        try {
            if (!visionModel) await initVisionModel()

            ctx.drawImage(imageBitmap, 0, 0, 224, 224)
            const imageData = ctx.getImageData(0, 0, 224, 224)
            const rawImage = new RawImage(imageData.data, 224, 224, 4)

            const inputs = await processor(rawImage)
            const { image_embeds } = await visionModel(inputs)

            const embedding = new Float32Array(image_embeds.data)

            if (typeof image_embeds.dispose === 'function') {
                image_embeds.dispose()
            }
            if (typeof inputs.dispose === 'function') {
                inputs.dispose()
            }

            await db.keyframes.add({ videoName, timestamp, embedding })

            imageBitmap.close()

            self.postMessage({ type: "SUCCESS", message: "Frame Indexed Successfully" })
        } catch (err) {
            imageBitmap.close()
            self.postMessage({ type: "ERROR", message: `Frame indexing failed: ${err.message}` })
        }
    }

    if (type === 'SEARCH') {
        const { query } = payload

        try {
            if (!textModel) await initTextModel()

            const textInputs = tokenizer(query, { padding: true, truncation: true })
            const { text_embeds } = await textModel(textInputs)

            const queryVector = new Float32Array(text_embeds.data)

            if (typeof text_embeds.dispose === 'function') {
                text_embeds.dispose()
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

    if (type === 'CLEAR_DB') {
        try {
            await db.keyframes.clear()
            self.postMessage({ type: 'STATUS', message: 'Database cleared for new video.' })
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: `Failed to clear DB: ${err.message}` })
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