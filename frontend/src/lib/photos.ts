import { api, apiFetch } from '@/lib/api'

/** Built from the storage key, so it never changes for a given photo. */
export function photoUrl(storageKey: string, variant: 'thumb' | 'display' = 'thumb') {
    return `/uploads/${storageKey}${variant === 'thumb' ? '.thumb' : ''}.webp`
}

export async function getPhotos(albumId?: number) {
    const response = await api.photos.$get({
        query: albumId ? { albumId: String(albumId) } : {},
    })
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

export async function getAlbums() {
    const response = await api.albums.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

/** What sharp can decode on the server. */
const SERVER_FORMATS = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Below this, sending the original is cheaper than re-encoding it. Above it,
 * the browser scales first: the server caps at MAX_EDGE anyway, so shipping a
 * 4 MB 4032px photo wastes the whole difference. It also decides how many
 * pictures fit in one upload -- four untouched iPhone photos already exceed
 * the 15 MB request limit, which is no use to anyone picking from a library.
 */
const PASSTHROUGH_MAX_BYTES = 1_500_000

/** Matches DISPLAY_MAX_EDGE in server/lib/photoStorage.ts. */
const MAX_EDGE = 2000

/**
 * An iPhone shoots HEIC, which sharp's prebuilt binaries cannot read. Safari
 * decodes it natively, so the browser converts to JPEG first. Scaling to the
 * edge the server would crop to anyway means the upload is a few hundred KB
 * instead of several MB.
 */
function reason(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

type Decoded = {
    source: CanvasImageSource
    width: number
    height: number
    release: () => void
    via: string
}

/**
 * Two decode paths on purpose. createImageBitmap is the direct one, but Safari
 * refuses it for some HEICs -- a photo straight out of the Apple Photos library
 * carries an HDR gain map and often depth data, which is a very different file
 * from a plain single-image HEIC. The same picture in an <img> decodes fine,
 * so that is the fallback.
 */
async function decodeImage(file: File): Promise<Decoded> {
    let bitmapError: unknown
    try {
        const bitmap = await createImageBitmap(file)
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release: () => bitmap.close(),
            via: 'createImageBitmap',
        }
    } catch (error) {
        bitmapError = error
    }

    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.src = url
        await img.decode()
        return {
            source: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
            release: () => URL.revokeObjectURL(url),
            via: 'img.decode',
        }
    } catch (imgError) {
        URL.revokeObjectURL(url)
        throw new Error(
            `Dieses Bild kann der Browser nicht lesen [${file.type || 'kein Typ'}, ` +
                `${Math.round(file.size / 1024)} KB] ` +
                `(createImageBitmap: ${reason(bitmapError)}; img: ${reason(imgError)})`,
        )
    }
}

async function toUploadableFile(file: File): Promise<File> {
    if (SERVER_FORMATS.includes(file.type) && file.size <= PASSTHROUGH_MAX_BYTES) {
        return file
    }

    // An iCloud photo that is not downloaded locally arrives as an empty file.
    if (file.size === 0) {
        throw new Error(
            `"${file.name}" ist leer - liegt das Foto nur in iCloud und ist noch nicht geladen?`,
        )
    }

    const decoded = await decodeImage(file)

    try {
        if (decoded.width === 0 || decoded.height === 0) {
            throw new Error(`Bild hat keine Abmessungen (via ${decoded.via})`)
        }

        const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))

        // Already small enough and in a format the server reads: re-encoding
        // would only cost a generation of quality.
        if (scale === 1 && SERVER_FORMATS.includes(file.type)) {
            return file
        }

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(decoded.width * scale)
        canvas.height = Math.round(decoded.height * scale)

        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('Canvas nicht verfügbar')
        }
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.9),
        )
        if (!blob || blob.size === 0) {
            throw new Error(
                `Umwandlung ergab kein Bild (via ${decoded.via}, ` +
                    `${canvas.width}x${canvas.height})`,
            )
        }

        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
        })
    } finally {
        decoded.release()
    }
}

/**
 * An error response is not always JSON -- a proxy or an unhandled throw can
 * return plain text or HTML, and parsing that blindly surfaces an unreadable
 * SyntaxError instead of the reason.
 */
async function readJson(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text()
    try {
        return JSON.parse(text) as Record<string, unknown>
    } catch {
        if (response.status === 413) {
            throw new Error('Die Bilder sind zusammen zu gross (max. 15 MB)')
        }
        // Include what the server actually said -- without it the only clue
        // is a status code, which is not enough to act on.
        const snippet = text.trim().slice(0, 200)
        throw new Error(
            `Der Server hat unerwartet geantwortet (${response.status})` +
                (snippet ? `: ${snippet}` : ''),
        )
    }
}

export type UploadResult = {
    photos: { id: number; storageKey: string }[]
    failed: { name: string; reason: string }[]
}

export type UploadInput = {
    files: File[]
    caption: string
    takenAt: string
    albumId?: number
}

/**
 * The typed hc client cannot express a repeated file field, so the upload is
 * the one call in the app that goes through fetch directly.
 */
export async function uploadPhotos({ files, caption, takenAt, albumId }: UploadInput): Promise<UploadResult> {
    const formData = new FormData()
    const converted: { name: string; reason: string }[] = []

    for (const file of files) {
        try {
            formData.append('file', await toUploadableFile(file))
        } catch (error) {
            converted.push({
                name: file.name,
                reason: error instanceof Error ? error.message : 'Umwandlung fehlgeschlagen',
            })
        }
    }

    if (formData.getAll('file').length === 0) {
        throw new Error(converted[0]?.reason ?? 'Keine Bilddatei ausgewählt')
    }

    if (caption) formData.append('caption', caption)
    if (takenAt) formData.append('takenAt', takenAt)
    if (albumId) formData.append('albumId', String(albumId))

    const response = await apiFetch('/api/photos', { method: 'POST', body: formData })
    const data = (await readJson(response)) as Partial<UploadResult> & { error?: string; detail?: string }

    if (!response.ok && !data.photos?.length) {
        const detail = typeof data.detail === 'string' ? ` (${data.detail})` : ''
        throw new Error(
            (data.error ?? data.failed?.[0]?.reason ?? 'Upload fehlgeschlagen') + detail,
        )
    }

    return {
        photos: data.photos ?? [],
        failed: [...converted, ...(data.failed ?? [])],
    }
}

export async function deletePhoto(id: number) {
    const res = await api.photos[':id{[0-9]+}'].$delete({ param: { id: String(id) } })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

export async function createAlbum(name: string) {
    const res = await api.albums.$post({ json: { name } })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
    return await res.json()
}
