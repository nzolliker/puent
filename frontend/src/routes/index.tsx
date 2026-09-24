import { createFileRoute } from '@tanstack/react-router'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

import { useQuery } from '@tanstack/react-query'
import { api } from "@/lib/api"

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

function Index() {
    const { isPending: totalIsPending, error: totalSpentError, data: totalSpent } = useQuery({ queryKey: ['get-total-spent'], queryFn: getTotalSpent })
    const { isPending: nextDateIsPending, error: nextDateError, data: nextDate } = useQuery({ queryKey: ['get-next-free-date'], queryFn: getNextFreeDate })

    if (totalSpentError) return 'An error has occurred: ' + totalSpentError.message
    if (nextDateError) return 'An error has occurred: ' + nextDateError.message

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
        </>
    )
}
