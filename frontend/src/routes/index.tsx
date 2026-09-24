import { createFileRoute, Link } from '@tanstack/react-router'

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

import { useQuery } from '@tanstack/react-query'
import { api } from "@/lib/api"
import { cn, dayKeyToDate, formatWeekday, getFirstName } from "@/lib/utils"
import { getPhotos, photoUrl } from "@/lib/photos"

export const Route = createFileRoute('/')({
    component: Index,
})

async function getTotalSpent() {
    const response = await api.expenses['total-spent'].$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

async function getNextFreeDate() {
    const response = await api["water-plants"]["next-free-date"].$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

async function getWaterOverview() {
    const response = await api["water-plants"].overview.$get({ query: {} })
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

type WaterOverview = Awaited<ReturnType<typeof getWaterOverview>>
type WaterOverviewDay = WaterOverview['days'][number]

function DayColumn({ day, todayKey }: { day: WaterOverviewDay; todayKey: string }) {
    const date = dayKeyToDate(day.date)
    // Day keys are `YYYY-MM-DD`, so a plain string compare orders them correctly.
    const isPast = day.date < todayKey
    const names = day.names.map(getFirstName).filter(Boolean)

    const chipClasses = cn(
        'flex min-h-9 w-full flex-col items-center justify-center rounded-md border px-0.5 py-1 text-[0.625rem] leading-tight',
        day.isOpen
            ? 'border-dashed text-muted-foreground hover:bg-accent'
            : 'bg-green-400 text-emerald-900',
        isPast && 'opacity-60',
    )

    const chipContent = day.isOpen ? (
        <span>—</span>
    ) : names.length > 0 ? (
        names.map((name, index) => (
            <span key={index} className="w-full truncate text-center">
                {name}
            </span>
        ))
    ) : (
        <span>✓</span>
    )

    return (
        <div className="flex flex-col items-center gap-1">
            <div
                className={cn(
                    'text-center text-[0.625rem] leading-tight',
                    day.isToday ? 'font-bold text-foreground' : 'text-muted-foreground',
                )}
            >
                <div>{formatWeekday(date)}</div>
                <div>{date.getDate()}.</div>
            </div>
            <div className={cn('w-full rounded-md', day.isToday && 'ring-2 ring-primary')}>
                {day.isOpen ? (
                    <Link
                        to="/waterPlants"
                        search={{ date: day.date }}
                        className={chipClasses}
                        title="Noch offen — eintragen"
                    >
                        {chipContent}
                    </Link>
                ) : (
                    <span className={chipClasses}>{chipContent}</span>
                )}
            </div>
        </div>
    )
}

function WaterOverviewStrip({ overview }: { overview: WaterOverview }) {
    return (
        <div className="grid grid-cols-7 gap-1">
            {overview.days.map((day) => (
                <DayColumn key={day.date} day={day} todayKey={overview.today} />
            ))}
        </div>
    )
}

type LatestPhoto = Awaited<ReturnType<typeof getPhotos>>['photos'][number]

function LatestPhotosStrip({ photos }: { photos: LatestPhoto[] }) {
    if (photos.length === 0) {
        return <span className="text-sm text-muted-foreground">Noch keine Fotos.</span>
    }

    return (
        <div className="grid grid-cols-4 gap-1">
            {photos.slice(0, 4).map((photo) => (
                <Link
                    key={photo.id}
                    to="/fotos"
                    className="aspect-square overflow-hidden rounded-md bg-muted"
                >
                    <img
                        src={photoUrl(photo.storageKey)}
                        alt={photo.caption ?? ''}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                    />
                </Link>
            ))}
        </div>
    )
}

function Index() {
    const { isPending: totalIsPending, error: totalSpentError, data: totalSpent } = useQuery({ queryKey: ['get-total-spent'], queryFn: getTotalSpent })
    const { isPending: nextDateIsPending, error: nextDateError, data: nextDate } = useQuery({ queryKey: ['get-next-free-date'], queryFn: getNextFreeDate })
    const { isPending: overviewIsPending, error: overviewError, data: overview } = useQuery({ queryKey: ['get-water-overview'], queryFn: getWaterOverview })
    const { isPending: photosIsPending, data: photoData } = useQuery({ queryKey: ['get-photos', null], queryFn: () => getPhotos() })

    if (totalSpentError) return 'An error has occurred: ' + totalSpentError.message
    if (nextDateError) return 'An error has occurred: ' + nextDateError.message
    if (overviewError) return 'An error has occurred: ' + overviewError.message

    return (
        <>
            <div className='mr-2 ml-2'>
                <Card className="w-full max-w-sm m-auto mt-3">
                    <CardHeader>
                        <CardTitle>Ausgaben</CardTitle>
                        <CardDescription>Alle Ausgaben addiert:</CardDescription>
                    </CardHeader>
                    <CardContent>{totalIsPending || !totalSpent ? "Loading..." : ((totalSpent.total ?? '0') + ' CHF')}</CardContent>
                </Card>
            </div>
            <div className='mr-2 ml-2'>
                <Card className="w-full max-w-sm m-auto mt-3">
                    <CardHeader>
                        <CardTitle>Giessen</CardTitle>
                        <CardDescription>Nächster offener Tag:</CardDescription>
                    </CardHeader>
                    <CardContent>{nextDateIsPending || !nextDate ? "Loading..." : ('in ' + nextDate.numberOfDays + ' Tagen')}</CardContent>
                    <CardContent>{nextDateIsPending || !nextDate ? "Loading..." : ('Datum: ' + nextDate.nextFreeDate)}</CardContent>
                </Card>
            </div>
            <div className='mr-2 ml-2'>
                <Card className="w-full max-w-sm m-auto mt-3">
                    <CardHeader>
                        <CardTitle>Giessen-Übersicht</CardTitle>
                        <CardDescription>Die Woche um heute:</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {overviewIsPending || !overview ? "Loading..." : <WaterOverviewStrip overview={overview} />}
                    </CardContent>
                    {overview && (
                        <CardFooter className="text-sm text-muted-foreground">
                            {overview.openCount} von {overview.days.length} Tagen offen
                        </CardFooter>
                    )}
                </Card>
            </div>
            <div className='mr-2 ml-2'>
                <Card className="w-full max-w-sm m-auto mt-3">
                    <CardHeader>
                        <CardTitle>Neueste Fotos</CardTitle>
                        <CardDescription>Vom Garten:</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {photosIsPending || !photoData ? "Loading..." : <LatestPhotosStrip photos={photoData.photos} />}
                    </CardContent>
                    {photoData && (
                        <CardFooter className="text-sm text-muted-foreground">
                            <Link to="/fotos" className="hover:underline">
                                {photoData.photos.length} {photoData.photos.length === 1 ? 'Bild' : 'Bilder'} ansehen
                            </Link>
                        </CardFooter>
                    )}
                </Card>
            </div>
        </>
    )
}
