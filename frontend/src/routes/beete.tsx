import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Images, Loader2, Pencil, Plus, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { MemberOnly, ReadOnlyNotice } from '@/components/access'
import { BedThumb, BedView, GardenMap } from '@/components/garden-map'
import { useCanEdit } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import {
    createPlanting,
    isReady,
    plantingColour,
    deletePlanting,
    getCurrentPlantings,
    getPlantingHistory,
    updatePlanting,
} from '@/lib/beds'
import type { Planting } from '@/lib/beds'
import { getPhotos, photoUrl, uploadPhotos } from '@/lib/photos'
import { cn, dayKeyToDate, toLocalDayKey } from '@/lib/utils'
import { bedCells } from '@server/garden/geometry'
import { findBed, gardenLayout } from '@server/garden/layout'
import type { Bed } from '@server/garden/schema'
import { plantingFormSchema } from '@server/sharedTypes'

type BeeteSearch = {
    /** The bed whose panel is open, by its key, so a link can point at one bed. */
    beet?: string
}

export const Route = createFileRoute('/beete')({
    component: Beete,
    validateSearch: (search: Record<string, unknown>): BeeteSearch => {
        const beet = typeof search.beet === 'string' ? search.beet : undefined

        // A key that is not on the plan is dropped, so a link to a bed that
        // has since been removed opens the plan rather than an empty panel.
        return beet && findBed(beet) ? { beet } : {}
    },
})

type PlantingFormValues = {
    crop: string
    note: string
    plantedAt: string
    removedAt: string
    cells: number[]
}

const dateFormat = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
})

function formatDay(dayKey: string) {
    return dateFormat.format(dayKeyToDate(dayKey))
}

/**
 * Clearing a bed moves a row from the plan to the bed's log, and putting it
 * back does the reverse, so every mutation makes both go stale.
 */
function useInvalidatePlantings() {
    const queryClient = useQueryClient()

    return async () => {
        await queryClient.invalidateQueries({ queryKey: ['get-plantings'] })
        await queryClient.invalidateQueries({ queryKey: ['get-planting-history'] })
    }
}

function FieldInfo({ field }: { field: AnyFieldApi }) {
    const error = field.state.meta.errors[0]
    if (!field.state.meta.isTouched || !error) {
        return null
    }

    return (
        <p className="text-sm text-destructive">
            {typeof error === 'object' ? error.message : String(error)}
        </p>
    )
}

type PlantingPhoto = { id: number; storageKey: string }

/**
 * The one photo a planting may carry: picked from the library, or uploaded
 * here. An upload goes through the same path as the Fotos page and lands in
 * the library like any other, which is also why it stays there if the dialog
 * is cancelled afterwards.
 */
function PhotoField({
    photo,
    onChange,
    caption,
}: {
    photo: PlantingPhoto | null
    onChange: (photo: PlantingPhoto | null) => void
    /** Goes onto an uploaded picture, so it says what it shows in the library. */
    caption: string
}) {
    const queryClient = useQueryClient()
    const inputRef = useRef<HTMLInputElement>(null)
    const [libraryOpen, setLibraryOpen] = useState(false)

    // Same key as the Fotos page and the dashboard, so this is usually cached.
    const library = useQuery({
        queryKey: ['get-photos', null],
        queryFn: () => getPhotos(),
        enabled: libraryOpen,
    })

    const uploadMutation = useMutation({
        mutationFn: (file: File) => uploadPhotos({ files: [file], caption, takenAt: '' }),
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ['get-photos'] })
            const uploaded = result.photos[0]
            if (uploaded) onChange(uploaded)
        },
    })

    // A file the server turned down comes back as a success with a reason.
    const uploadError = uploadMutation.error?.message ?? uploadMutation.data?.failed[0]?.reason

    return (
        <div className="grid gap-2">
            <Label>Foto</Label>
            {photo ? (
                <div className="flex items-center gap-3">
                    <img
                        src={photoUrl(photo.storageKey)}
                        alt=""
                        className="size-16 rounded-md bg-muted object-cover"
                    />
                    <Button type="button" variant="outline" onClick={() => onChange(null)}>
                        <X />
                        Entfernen
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        variant="outline"
                       
                        aria-expanded={libraryOpen}
                        onClick={() => setLibraryOpen((open) => !open)}
                    >
                        <Images />
                        Aus Fotos
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                       
                        disabled={uploadMutation.isPending}
                        onClick={() => inputRef.current?.click()}
                    >
                        {uploadMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                        Hochladen
                    </Button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) uploadMutation.mutate(file)
                        }}
                    />
                </div>
            )}
            {!photo && libraryOpen && (
                library.error ? (
                    <p className="text-sm text-destructive">Fotos konnten nicht geladen werden.</p>
                ) : library.isPending ? (
                    <Skeleton className="h-20 w-full" />
                ) : library.data.photos.length ? (
                    <div className="grid max-h-44 grid-cols-4 gap-1 overflow-y-auto">
                        {library.data.photos.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-label={item.caption ?? `Foto ${item.id}`}
                                className="aspect-square overflow-hidden rounded-md bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                onClick={() => {
                                    onChange({ id: item.id, storageKey: item.storageKey })
                                    setLibraryOpen(false)
                                }}
                            >
                                <img
                                    src={photoUrl(item.storageKey)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Noch keine Fotos.</p>
                )
            )}
            {!photo && uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        </div>
    )
}

/**
 * Adds a planting, or edits the one passed in. Mounted only while open, so the
 * form always starts from the planting it was opened for.
 */
function PlantingDialog({
    bed,
    planting,
    current,
    onClose,
}: {
    bed: Bed
    planting?: Planting
    /** What is growing in this bed now, to show which cells are taken. */
    current: Planting[]
    onClose: () => void
}) {
    const invalidatePlantings = useInvalidatePlantings()
    const cells = bedCells(bed)

    // Beside the form rather than in it: nothing about a photo needs validating.
    const [photo, setPhoto] = useState<PlantingPhoto | null>(
        planting?.photoId && planting.photoStorageKey
            ? { id: planting.photoId, storageKey: planting.photoStorageKey }
            : null,
    )

    const saveMutation = useMutation({
        mutationFn: (value: PlantingFormValues) => {
            const input = {
                ...value,
                removedAt: value.removedAt || null,
                photoId: photo?.id ?? null,
            }

            return planting ? updatePlanting(planting.id, input) : createPlanting(bed.key, input)
        },
        onSuccess: async () => {
            await invalidatePlantings()
            onClose()
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deletePlanting,
        onSuccess: async () => {
            await invalidatePlantings()
            onClose()
        },
    })

    const form = useForm({
        defaultValues: {
            crop: planting?.crop ?? '',
            note: planting?.note ?? '',
            plantedAt: planting?.plantedAt ?? toLocalDayKey(new Date()),
            removedAt: planting?.removedAt ?? '',
            // A bed without a grid has nothing to choose.
            cells: planting?.cells ?? (cells.length === 1 ? [cells[0].index] : []),
        } as PlantingFormValues,
        validators: {
            onChange: plantingFormSchema,
        },
        onSubmit: async ({ value }) => {
            await saveMutation.mutateAsync(value)
        },
    })

    // An entry that is already cleared away takes no ground from what grows
    // now, so nothing is off limits for it. The server applies the same rule.
    const isCurrent = useStore(form.store, (state) => state.values.removedAt === '')
    const others = current.filter((other) => other.id !== planting?.id)
    const taken = isCurrent ? others.flatMap((other) => other.cells) : []

    const error = saveMutation.error ?? deleteMutation.error

    return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>{planting ? 'Bepflanzung ändern' : 'Bepflanzen'}</DialogTitle>
                    <DialogDescription>{bed.name}</DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 px-4 pt-4 sm:px-6">
                    <form.Field
                        name="crop"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Was</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Tomaten"
                                    autoFocus={!planting}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    {cells.length > 1 && (
                        <form.Field
                            name="cells"
                            children={(field) => (
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Wo</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                field.handleChange(
                                                    cells
                                                        .map((cell) => cell.index)
                                                        .filter((index) => !taken.includes(index)),
                                                )
                                                field.handleBlur()
                                            }}
                                        >
                                            Alles Freie
                                        </Button>
                                    </div>
                                    <BedView
                                        bed={bed}
                                        plantings={others}
                                        picker={{
                                            selected: field.state.value,
                                            disabled: taken,
                                            onToggle: (index) => {
                                                field.handleChange(
                                                    field.state.value.includes(index)
                                                        ? field.state.value.filter((i) => i !== index)
                                                        : [...field.state.value, index],
                                                )
                                                field.handleBlur()
                                            },
                                        }}
                                    />
                                    <FieldInfo field={field} />
                                </div>
                            )}
                        />
                    )}
                    <form.Field
                        name="plantedAt"
                        children={(field) => (
                            <div className="grid min-w-0 gap-2">
                                <Label htmlFor={field.name}>Gepflanzt am</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    type="date"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    {/* Each date on a row of its own: an iPhone's date input does
                        not shrink, and two of them side by side overlap.

                        Offered on a new entry as well: that is how what
                        grew here in earlier years gets into the log.

                        A button until a date is wanted, because an empty
                        date input is not reliably empty to look at --
                        WebKit fills it with today's date as a placeholder. */}
                    <form.Field
                        name="removedAt"
                        children={(field) => (
                            <div className="grid min-w-0 gap-2">
                                <Label htmlFor={field.name}>Abgeräumt am</Label>
                                {field.state.value === '' ? (
                                    <Button
                                        id={field.name}
                                        type="button"
                                        variant="outline"
                                        className="justify-start font-normal text-muted-foreground"
                                        onClick={() => {
                                            const today = toLocalDayKey(new Date())
                                            const plantedAt = form.getFieldValue('plantedAt')
                                            // Never earlier than it was planted.
                                            field.handleChange(today >= plantedAt ? today : plantedAt)
                                            field.handleBlur()
                                        }}
                                    >
                                        Noch nicht
                                    </Button>
                                ) : (
                                    <div className="flex min-w-0 items-center gap-1">
                                        <Input
                                            id={field.name}
                                            name={field.name}
                                            type="date"
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0"
                                            aria-label="Wächst noch"
                                            title="Wächst noch"
                                            onClick={() => field.handleChange('')}
                                        >
                                            <X />
                                        </Button>
                                    </div>
                                )}
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    <form.Field
                        name="note"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Notiz</Label>
                                <Textarea
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Optional — Sorte, woher, was auffiel"
                                    rows={2}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    <form.Subscribe
                        selector={(state) => state.values.crop.trim()}
                        children={(crop) => (
                            <PhotoField
                                photo={photo}
                                onChange={setPhoto}
                                caption={crop ? `${crop} · ${bed.name}` : bed.name}
                            />
                        )}
                    />
                    {error && <p className="text-sm text-destructive">{error.message}</p>}
                </FieldGroup>
                <DialogFooter className="sticky bottom-0 mt-4 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    {planting && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive sm:mr-auto"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(planting.id)}
                        >
                            Löschen
                        </Button>
                    )}
                    <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                    </DialogClose>
                    <form.Subscribe
                        // `canSubmit` alone is true before the first change, because
                        // the onChange validator has not run yet -- so gate on the
                        // required values as well, as the other dialogs do.
                        selector={(state) =>
                            [
                                state.canSubmit,
                                state.isSubmitting,
                                state.values.crop.trim().length > 0 && state.values.cells.length > 0,
                            ] as const
                        }
                        children={([canSubmit, isSubmitting, isFilled]) => (
                            <Button
                                type="button"
                                disabled={!canSubmit || !isFilled || isSubmitting}
                                onClick={async () => {
                                    await form.handleSubmit()
                                }}
                            >
                                {isSubmitting ? '...' : 'Speichern'}
                            </Button>
                        )}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** One planting in the panel's lists, growing or cleared away. */
function PlantingRow({
    bed,
    planting,
    onEdit,
    action,
    shown,
    onShow,
    onReadyChange,
    pendingReady,
    busy,
}: {
    bed: Bed
    planting: Planting
    onEdit: () => void
    action?: ReactNode
    /** Whether this is the planting the bed above is showing. */
    shown?: boolean
    /** Given for the log's rows: tapping one shows where it was in the bed. */
    onShow?: () => void
    /** Given for what is growing: ticks it ready to harvest, or not. */
    onReadyChange?: (ready: boolean) => void
    /**
     * What the box was just set to, while the server has not answered yet.
     * Without it the tick would spring back for the length of the request.
     */
    pendingReady?: boolean
    busy?: boolean
}) {
    const canEdit = useCanEdit()
    const ready = pendingReady ?? isReady(planting)

    const details: ReactNode[] = [
        planting.removedAt
            ? `${formatDay(planting.plantedAt)} – ${formatDay(planting.removedAt)}`
            : `seit ${formatDay(planting.plantedAt)}`,
        // Here rather than beside the checkbox, where it would not fit a
        // phone -- and here a guest, who gets no checkbox, reads it too.
        isReady(planting) && planting.readyAt && (
            <span className="text-green-500">erntereif seit {formatDay(planting.readyAt)}</span>
        ),
        planting.note,
    ].filter(Boolean)

    // The bed in small, with this planting's cells filled: where it is, or was.
    const summary = (
        <>
            <BedThumb
                bed={bed}
                cells={planting.cells}
                colourClass={plantingColour(planting)}
                className={cn(planting.removedAt && !shown && 'opacity-60')}
            />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{planting.crop}</div>
                <div className="truncate text-xs text-muted-foreground" title={planting.note ?? undefined}>
                    {details.map((detail, index) => (
                        <span key={index}>
                            {index > 0 && ' · '}
                            {detail}
                        </span>
                    ))}
                </div>
            </div>
        </>
    )

    const editButton = (
        <Button
            variant="ghost"
            size="icon"
            type="button"
            className="shrink-0"
            aria-label={`${planting.crop} ändern`}
            onClick={onEdit}
        >
            <Pencil />
        </Button>
    )

    // What is growing has more to act on than fits beside its name on a
    // phone, so its controls get a line of their own. A row in the log has
    // only the pencil, which stays where it is.
    const ownLine = canEdit && (onReadyChange !== undefined || action !== undefined)

    return (
        <li className="py-2">
            <div className="flex items-center gap-2">
                {onShow ? (
                    <button
                        type="button"
                        aria-pressed={shown}
                        aria-label={`${planting.crop} im Beet zeigen`}
                        onClick={onShow}
                        className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-accent aria-pressed:bg-accent"
                    >
                        {summary}
                    </button>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">{summary}</div>
                )}
                {planting.photoStorageKey && (
                    <a
                        href={photoUrl(planting.photoStorageKey, 'display')}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Foto von ${planting.crop}`}
                        className="size-9 shrink-0 overflow-hidden rounded-md bg-muted"
                    >
                        <img
                            src={photoUrl(planting.photoStorageKey)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                        />
                    </a>
                )}
                {!ownLine && <MemberOnly>{editButton}</MemberOnly>}
            </div>
            {ownLine && (
                // Indented to start under the name, past the bed in small.
                <div className="mt-1 flex items-center gap-1 pl-11">
                    {onReadyChange && (
                        // The whole label is the target, not the box alone.
                        <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="size-5 shrink-0 accent-green-600"
                                checked={ready}
                                disabled={busy}
                                onChange={(event) => onReadyChange(event.target.checked)}
                            />
                            <span className={ready ? 'text-green-500' : 'text-muted-foreground'}>
                                Erntereif
                            </span>
                        </label>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                        {action}
                        {editButton}
                    </div>
                </div>
            )}
        </li>
    )
}

function BedPanel({ bed, current }: { bed: Bed; current: Planting[] }) {
    const canEdit = useCanEdit()
    const invalidatePlantings = useInvalidatePlantings()
    // Null is closed; an object without a planting is a new one.
    const [dialog, setDialog] = useState<{ planting?: Planting } | null>(null)

    const cellCount = bedCells(bed).length

    const history = useQuery({
        queryKey: ['get-planting-history', bed.key],
        queryFn: () => getPlantingHistory(bed.key),
    })

    // The cleared-away planting on show in the bed above, if any. Kept as an id
    // and looked up, so it lets go by itself when that planting is put back
    // into the ground or deleted.
    const [shownId, setShownId] = useState<number | null>(null)
    const shown = history.data?.plantings.find((planting) => planting.id === shownId)

    const readyMutation = useMutation({
        mutationFn: ({ id, ready }: { id: number; ready: boolean }) =>
            updatePlanting(id, { readyAt: ready ? toLocalDayKey(new Date()) : null }),
        onSuccess: invalidatePlantings,
    })

    const clearMutation = useMutation({
        mutationFn: (id: number) => updatePlanting(id, { removedAt: toLocalDayKey(new Date()) }),
        onSuccess: invalidatePlantings,
    })

    return (
        <div className="mt-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <h2 className="font-semibold">{bed.name}</h2>
                    {cellCount > 1 && (
                        <span className="text-xs text-muted-foreground">{cellCount} Felder</span>
                    )}
                </div>
                <Button type="button" disabled={!canEdit} onClick={() => setDialog({})}>
                    <Plus />
                    Bepflanzen
                </Button>
            </div>

            {/* Either what is growing, or the one cleared-away planting whose
                row in the log was tapped. */}
            <BedView
                bed={bed}
                className="mt-3"
                plantings={shown ? [shown] : current}
                ghost={shown !== undefined}
            />
            {shown?.removedAt && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                        Früher: {shown.crop}, {formatDay(shown.plantedAt)} – {formatDay(shown.removedAt)}
                    </span>
                    <Button
                        variant="outline"
                        size="xs"
                        type="button"
                        className="shrink-0"
                        onClick={() => setShownId(null)}
                    >
                        Aktuell zeigen
                    </Button>
                </div>
            )}

            <h3 className="mt-4 text-xs font-medium text-muted-foreground uppercase">Aktuell</h3>
            {current.length ? (
                <ul className="divide-y">
                    {current.map((planting) => (
                        <PlantingRow
                            key={planting.id}
                            bed={bed}
                            planting={planting}
                            onEdit={() => setDialog({ planting })}
                            onReadyChange={(ready) => readyMutation.mutate({ id: planting.id, ready })}
                            pendingReady={
                                readyMutation.isPending && readyMutation.variables.id === planting.id
                                    ? readyMutation.variables.ready
                                    : undefined
                            }
                            busy={readyMutation.isPending}
                            action={
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="shrink-0 px-3"
                                    disabled={clearMutation.isPending}
                                    onClick={() => clearMutation.mutate(planting.id)}
                                >
                                    Abräumen
                                </Button>
                            }
                        />
                    ))}
                </ul>
            ) : (
                <p className="py-2 text-sm text-muted-foreground">Hier wächst gerade nichts.</p>
            )}
            {(clearMutation.error ?? readyMutation.error) && (
                <p className="text-sm text-destructive">
                    {(clearMutation.error ?? readyMutation.error)?.message}
                </p>
            )}

            <h3 className="mt-4 text-xs font-medium text-muted-foreground uppercase">Verlauf</h3>
            {history.error ? (
                <p className="py-2 text-sm text-destructive">Verlauf konnte nicht geladen werden.</p>
            ) : history.isPending ? (
                <Skeleton className="my-2 h-5 w-full" />
            ) : history.data.plantings.length ? (
                <ul className="divide-y">
                    {history.data.plantings.map((planting) => (
                        <PlantingRow
                            key={planting.id}
                            bed={bed}
                            planting={planting}
                            onEdit={() => setDialog({ planting })}
                            shown={planting.id === shownId}
                            onShow={() => setShownId(planting.id === shownId ? null : planting.id)}
                        />
                    ))}
                </ul>
            ) : (
                <p className="py-2 text-sm text-muted-foreground">Noch nichts abgeräumt.</p>
            )}

            {dialog && (
                <PlantingDialog
                    bed={bed}
                    planting={dialog.planting}
                    current={current}
                    onClose={() => setDialog(null)}
                />
            )}
        </div>
    )
}

function Beete() {
    const navigate = Route.useNavigate()
    const { beet } = Route.useSearch()
    const bed = beet ? findBed(beet) : undefined

    // The plan itself needs no request -- it is drawn from the layout file --
    // so it is on screen at once and the colours arrive when this does.
    const { error, data } = useQuery({
        queryKey: ['get-plantings'],
        queryFn: getCurrentPlantings,
    })

    const plantings = useMemo(() => data?.plantings ?? [], [data])

    return (
        <div className="mx-auto max-w-2xl p-2">
            <h1 className="px-1 text-xl font-bold">Beete</h1>
            <ReadOnlyNotice className="mt-1" />

            <div className="mt-3 rounded-lg border p-1">
                <GardenMap
                    layout={gardenLayout}
                    selectedKey={bed?.key}
                    // Tapping the open bed again closes it.
                    onSelect={(key) =>
                        void navigate({ search: key === bed?.key ? {} : { beet: key }, replace: true })
                    }
                    plantings={plantings}
                />
            </div>
            {/* What the one green on the plan means. */}
            <div className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm bg-green-500" />
                erntereif
            </div>
            {error && (
                <p className="mt-1 px-1 text-sm text-destructive">
                    Die Bepflanzung konnte nicht geladen werden.
                </p>
            )}

            {bed ? (
                // Keyed, so a dialog left open does not carry over to the next bed.
                <BedPanel
                    key={bed.key}
                    bed={bed}
                    current={plantings.filter((planting) => planting.bedKey === bed.key)}
                />
            ) : (
                <p className="mt-3 px-1 text-sm text-muted-foreground">
                    Ein Beet antippen, um es zu öffnen.
                </p>
            )}
        </div>
    )
}
