const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1200;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read image file."));
        image.src = src;
    });
}

function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
    });
}

export async function prepareImageFile(file, options = {}) {
    const label = options.label || "Image";
    const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;

    if (!file.type.startsWith("image/")) {
        throw new Error(`${label} must be an image file.`);
    }

    if (file.size > MAX_SOURCE_BYTES) {
        throw new Error(`${label} is too large. Please choose an image under 12 MB.`);
    }

    if (file.size <= MAX_UPLOAD_BYTES) {
        return file;
    }

    const sourceUrl = URL.createObjectURL(file);

    try {
        const image = await loadImage(sourceUrl);
        const scale = Math.min(
            1,
            maxDimension / image.naturalWidth,
            maxDimension / image.naturalHeight
        );
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const qualities = [0.86, 0.76, 0.66, 0.56, 0.46];
        for (const quality of qualities) {
            const blob = await canvasToBlob(canvas, quality);
            if (blob && blob.size <= MAX_UPLOAD_BYTES) {
                return new File(
                    [blob],
                    file.name.replace(/\.[^.]+$/, ".jpg"),
                    { type: "image/jpeg" }
                );
            }
        }

        throw new Error(`${label} could not be compressed under 2 MB. Please choose a smaller image.`);
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
}
