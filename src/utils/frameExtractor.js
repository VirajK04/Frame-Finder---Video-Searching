async function processVideoFile(file, onFrameExtracted) {
    return new Promise((resolve, reject) => {

        const video = document.createElement('video')
        video.src = URL.createObjectURL(file)
        video.muted = true

        video.onloadedmetadata = async () => {
            const duration = video.duration

            const canvas = new OffscreenCanvas(224, 224)
            const ctx = canvas.getContext('2d')

            try {

                for (let time = 0; time < Math.floor(duration); time += 1) {
                    video.currentTime = time

                    await new Promise((resolveSeek) => {
                        video.onseeked = resolveSeek
                    });

                    ctx.drawImage(video, 0, 0, 224, 224)

                    const imageBitmap = await createImageBitmap(canvas)

                    onFrameExtracted({
                        videoName: file.name,
                        timestamp: time,
                        imageBitmap
                    });
                }

                URL.revokeObjectURL(video.src)
                resolve()

            } catch (error) {
                URL.revokeObjectURL(video.src)
                reject(error);
            }
        };

        video.onerror = () => {
            reject(new Error("Failed to load or decode the video file."));
        };
    });
}

export default processVideoFile