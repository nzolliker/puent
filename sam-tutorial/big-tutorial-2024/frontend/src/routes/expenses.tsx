import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute('/expenses')({
    component: Expenses,
})

async function getAllExpenses() {
    const response = await api.expenses.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

async function handleDelete(id: string) {
    await api.expenses[':id{[0-9]+}'].$delete({ param: { id } })
}

function Expenses() {
    const queryClient = useQueryClient()
    const { isPending, error, data } = useQuery({ queryKey: ['get-all-expenses'], queryFn: getAllExpenses })
    const deleteExpenseMutation = useMutation({
        mutationFn: handleDelete,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-expenses'] })
        },
    })

    const formatDate = (value: string) =>
        new Date(value).toLocaleDateString("de-CH");

    if (error) return 'An error has occurred: ' + error.message

    return (
        <div className="p-2">
            <pre>
                <Table>
                    <TableCaption>A list of your recent expensess.</TableCaption>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="max-w-[120px] truncate">Title</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="flex justify-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isPending
                            ? Array(3).fill(0).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                    <TableCell className="flex justify-center"><Button variant="outline"><Trash2 className="h-4 w-4" /></Button></TableCell>
                                </TableRow>))
                            :
                            data?.expenses?.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell className="max-w-[150px] truncate font-medium">{expense.title}</TableCell>
                                    <TableCell>{expense.amount}</TableCell>
                                    <TableCell className="max-w-[90px] truncate">{formatDate(expense.date)}</TableCell>
                                    <TableCell className="flex justify-center">
                                        <Button
                                            variant="outline"
                                            type="button"
                                            disabled={deleteExpenseMutation.isPending}
                                            onClick={() => deleteExpenseMutation.mutate(expense.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </pre>
        </div>)
}
