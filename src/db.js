import { Dexie } from "dexie"

export const db = new Dexie("video-search")

db.version(1).stores({
    keyframes: "++id, videoName, timestamp",
    video: "videoName, duration, indexedAt"
})