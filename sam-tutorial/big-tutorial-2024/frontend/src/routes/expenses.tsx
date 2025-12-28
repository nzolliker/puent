import { createFileRoute } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

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
  const data  = await response.json()
  return data
}

function Expenses() {
  const { isPending, error, data} = useQuery({ queryKey: ['get-all-expenses'], queryFn: getAllExpenses })

  if (error) return 'An error has occurred: ' + error.message

  return (
  <div className="p-2">
    <pre>
    <Table>
      <TableCaption>A list of your recent expensess.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending
        ? Array(3).fill(0).map((_, index) => (
          <TableRow key={index}>
            <TableCell><Skeleton className="h-4 w-4" /></TableCell>
            <TableCell><Skeleton className="h-4 w-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-full" /></TableCell>
          </TableRow> ))
        :
          data?.expenses.map((expenses) => (
          <TableRow key={expenses.id}>
            <TableCell className="font-medium">{expenses.id}</TableCell>
            <TableCell>{expenses.title}</TableCell>
            <TableCell>{expenses.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </pre>
  </div>)
}