import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MemberOnly, ReadOnlyNotice } from '@/components/access'
import { useCanEdit } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    createAlbum,
    deletePhoto,
    getAlbums,
    getPhotos,
    photoUrl,
    uploadPhotos,
} from '@/lib/photos'

type FotosSearch = {
    /** Filters the grid to one album, and survives a reload. */
    album?: number
}

export const Route = createFileRoute('/fotos')({
    component: Fotos,
    validateSearch: (search: Record<string, unknown>): FotosSearch => {
        const album = Number(search.album)

        return Number.isInteger(album) && album > 0 ? { album } : {}
    },
})

type Album = Awaited<ReturnType<typeof getAlbums>>['albums'][number]
type Photo = Awaited<ReturnType<typeof getPhotos>>['photos'][number]

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('de-CH')
}

/** The date shown for a photo: when it was taken, else when it was uploaded. */
function photoDate(photo: Photo) {
    const value = photo.takenAt ?? photo.createdAt
    return value ? formatDate(value) : ''
}

function AlbumChips({
    albums,
    selected,
    onSelect,
    onCreate,
}: {
    albums: Album[]
    selected?: number
    onSelect: (album?: number) => void
    onCreate: () => void
}) {
    const chip =
        'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent'

    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            <button
                type="button"
                onClick={() => onSelect(undefined)}
                className={cn(chip, selected === undefined && 'bg-primary text-primary-foreground hover:bg-primary')}
            >
                Alle
            </button>
            {albums.map((album) => (
                <button
                    key={album.id}
                    type="button"
                    onClick={() => onSelect(album.id)}
                    className={cn(chip, selected === album.id && 'bg-primary text-primary-foreground hover:bg-primary')}
                >
                    {album.name}
                    <span className="ml-1.5 text-xs opacity-70">{album.photoCount}</span>
                </button>
            ))}
            <MemberOnly>
                <button
                    type="button"
                    onClick={onCreate}
                    className={cn(chip, 'flex items-center gap-1 border-dashed text-muted-foreground')}
                    title="Neues Album"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Neu
                </button>
            </MemberOnly>
        </div>
    )
}

function PhotoGrid({
    photos,
    isPending,
    onOpen,
}: {
    photos: Photo[]
    isPending: boolean
    onOpen: (photo: Photo) => void
}) {
    if (isPending) {
        return (
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                {Array(6)
                    .fill(0)
                    .map((_, index) => (
                        <Skeleton key={index} className="aspect-square w-full rounded-md" />
                    ))}
            </div>
        )
    }

    if (photos.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-muted-foreground">
                <ImagePlus className="h-8 w-8" />
                <p className="text-sm">Noch keine Fotos hier.</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
            {photos.map((photo) => (
                <button
                    key={photo.id}
                    type="button"
                    onClick={() => onOpen(photo)}
                    className="group relative aspect-square overflow-hidden rounded-md bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <img
                        src={photoUrl(photo.storageKey)}
                        alt={photo.caption ?? ''}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                </button>
            ))}
        </div>
    )
}

function UploadPanel({
    albums,
    albumId,
    onDone,
}: {
    albums: Album[]
    albumId?: number
    onDone: () => void
}) {
    const [files, setFiles] = useState<File[]>([])
    const [caption, setCaption] = useState('')
    const [takenAt, setTakenAt] = useState('')
    const [targetAlbum, setTargetAlbum] = useState<number | undefined>(albumId)
    const [isDragging, setIsDragging] = useState(false)
    const [failures, setFailures] = useState<{ name: string; reason: string }[]>([])
    const inputRef = useRef<HTMLInputElement>(null)

    const queryClient = useQueryClient()

    const uploadMutation = useMutation({
        mutationFn: uploadPhotos,
        onSuccess: async (result) => {
            setFailures(result.failed)
            await queryClient.invalidateQueries({ queryKey: ['get-photos'] })
            await queryClient.invalidateQueries({ queryKey: ['get-albums'] })
            setFiles([])
            setCaption('')
            setTakenAt('')
            if (result.failed.length === 0) {
                onDone()
            }
        },
    })

    const addFiles = (incoming: FileList | null) => {
        if (!incoming) return
        // Copy now, not inside the updater: `incoming` is the input's live
        // FileList, and resetting input.value right after this call empties it
        // before React would get around to reading it.
        const picked = Array.from(incoming)
        if (picked.length === 0) return
        setFailures([])
        setFiles((current) => [...current, ...picked])
    }

    return (
        <div className="space-y-4">
            <div
                onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    addFiles(event.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground transition-colors',
                    isDragging ? 'border-primary bg-accent' : 'hover:bg-accent',
                )}
            >
                <Upload className="h-7 w-7" />
                <p className="text-sm">Bilder hierher ziehen oder auswählen</p>
                <p className="text-xs">JPEG, PNG, HEIC · zusammen max. 15 MB</p>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        addFiles(event.target.files)
                        event.target.value = ''
                    }}
                />
            </div>

            {files.length > 0 && (
                <div className="grid grid-cols-4 gap-1">
                    {files.map((file, index) => (
                        <div key={index} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                            <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="h-full w-full object-cover"
                                onLoad={(event) => URL.revokeObjectURL(event.currentTarget.src)}
                                onError={(event) => {
                                    // Chrome cannot render HEIC; the upload still converts it.
                                    URL.revokeObjectURL(event.currentTarget.src)
                                    event.currentTarget.classList.add('hidden')
                                }}
                            />
                            <span className="absolute inset-0 -z-10 flex items-center justify-center px-1 text-center text-[0.6rem] break-all text-muted-foreground">
                                {file.name}
                            </span>
                            <button
                                type="button"
                                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                                className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5"
                                title="Entfernen"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="caption">Beschreibung</Label>
                <Textarea
                    id="caption"
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    placeholder="Optional — gilt für alle Bilder dieses Uploads"
                    rows={2}
                />
            </div>

            {/* One below the other: an iPhone's date input does not shrink to
                half the panel. */}
            <div className="grid gap-3">
                <div className="min-w-0 space-y-2">
                    <Label htmlFor="takenAt">Aufgenommen am</Label>
                    <Input
                        id="takenAt"
                        type="date"
                        value={takenAt}
                        onChange={(event) => setTakenAt(event.target.value)}
                    />
                </div>
                <div className="min-w-0 space-y-2">
                    <Label htmlFor="album">Album</Label>
                    <select
                        id="album"
                        value={targetAlbum ?? ''}
                        onChange={(event) =>
                            setTargetAlbum(event.target.value ? Number(event.target.value) : undefined)
                        }
                        className="h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
                    >
                        <option value="">Ohne Album</option>
                        {albums.map((album) => (
                            <option key={album.id} value={album.id}>
                                {album.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {failures.length > 0 && (
                <ul className="space-y-1 text-sm text-destructive">
                    {failures.map((failure, index) => (
                        <li key={index}>
                            {failure.name}: {failure.reason}
                        </li>
                    ))}
                </ul>
            )}
            {uploadMutation.error && (
                <p className="text-sm text-destructive">{uploadMutation.error.message}</p>
            )}

            <Button
                type="button"
                className="w-full"
                disabled={files.length === 0 || uploadMutation.isPending}
                onClick={() =>
                    uploadMutation.mutate({ files, caption, takenAt, albumId: targetAlbum })
                }
            >
                {uploadMutation.isPending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Wird hochgeladen…
                    </>
                ) : (
                    `${files.length || ''} ${files.length === 1 ? 'Bild' : 'Bilder'} hochladen`.trim()
                )}
            </Button>
        </div>
    )
}

function Fotos() {
    const navigate = Route.useNavigate()
    const { album: albumId } = Route.useSearch()
    const queryClient = useQueryClient()

    const canEdit = useCanEdit()
    const [uploadOpen, setUploadOpen] = useState(false)
    const [albumOpen, setAlbumOpen] = useState(false)
    const [albumName, setAlbumName] = useState('')
    const [activePhoto, setActivePhoto] = useState<Photo | null>(null)

    const { data: albumData } = useQuery({ queryKey: ['get-albums'], queryFn: getAlbums })
    const {
        isPending,
        error,
        data,
    } = useQuery({
        queryKey: ['get-photos', albumId ?? null],
        queryFn: () => getPhotos(albumId),
    })

    const createAlbumMutation = useMutation({
        mutationFn: createAlbum,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-albums'] })
            setAlbumName('')
            setAlbumOpen(false)
        },
    })

    const deletePhotoMutation = useMutation({
        mutationFn: deletePhoto,
        onSuccess: async () => {
            setActivePhoto(null)
            await queryClient.invalidateQueries({ queryKey: ['get-photos'] })
            await queryClient.invalidateQueries({ queryKey: ['get-albums'] })
        },
    })

    if (error) return 'An error has occurred: ' + error.message

    const albums = albumData?.albums ?? []
    const photos = data?.photos ?? []

    return (
        <div className="mx-auto w-full max-w-2xl px-3 py-4">
            <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl font-semibold">Fotos</h1>
                    <p className="text-sm text-muted-foreground">
                        {photos.length} {photos.length === 1 ? 'Bild' : 'Bilder'}
                    </p>
                </div>
                <Button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setUploadOpen(true)}
                >
                    <ImagePlus className="h-4 w-4" />
                    Hochladen
                </Button>
            </div>
            <ReadOnlyNotice className="mb-3 px-0" />

            <div className="mb-4">
                <AlbumChips
                    albums={albums}
                    selected={albumId}
                    onSelect={(album) => void navigate({ search: album ? { album } : {}, replace: true })}
                    onCreate={() => setAlbumOpen(true)}
                />
            </div>

            <PhotoGrid photos={photos} isPending={isPending} onOpen={setActivePhoto} />

            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogContent className="top-[6dvh] bottom-auto max-h-[88dvh] translate-y-0 overflow-y-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%]">
                    <DialogHeader>
                        <DialogTitle>Fotos hochladen</DialogTitle>
                        <DialogDescription>
                            Die Bilder werden verkleinert gespeichert.
                        </DialogDescription>
                    </DialogHeader>
                    <UploadPanel albums={albums} albumId={albumId} onDone={() => setUploadOpen(false)} />
                </DialogContent>
            </Dialog>

            <Dialog open={albumOpen} onOpenChange={setAlbumOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Neues Album</DialogTitle>
                        <DialogDescription>Zum Beispiel ein Beet oder eine Saison.</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={albumName}
                        onChange={(event) => setAlbumName(event.target.value)}
                        placeholder="Beet 1"
                        maxLength={80}
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            disabled={albumName.trim().length === 0 || createAlbumMutation.isPending}
                            onClick={() => createAlbumMutation.mutate(albumName.trim())}
                        >
                            Anlegen
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={activePhoto !== null} onOpenChange={(open) => !open && setActivePhoto(null)}>
                <DialogContent className="gap-3 p-3 sm:max-w-lg">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Foto</DialogTitle>
                    </DialogHeader>
                    {activePhoto && (
                        <>
                            <img
                                src={photoUrl(activePhoto.storageKey, 'display')}
                                alt={activePhoto.caption ?? ''}
                                width={activePhoto.width}
                                height={activePhoto.height}
                                className="max-h-[70dvh] w-full rounded-md object-contain"
                            />
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    {activePhoto.caption && (
                                        <p className="text-sm break-words">{activePhoto.caption}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">{photoDate(activePhoto)}</p>
                                </div>
                                <MemberOnly>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        disabled={deletePhotoMutation.isPending}
                                        onClick={() => deletePhotoMutation.mutate(activePhoto.id)}
                                        title="Foto löschen"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </MemberOnly>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
