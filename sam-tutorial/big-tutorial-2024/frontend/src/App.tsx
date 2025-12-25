import './App.css'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { useQuery } from '@tanstack/react-query'
import { api } from "@/lib/api"

async function getTotalSpent() {
  const response = await api.expenses['total-spent'].$get()
  if (!response.ok) {
    throw new Error('Network response was not ok')
  }
  const data  = await response.json()
  return data
}

function App() {
  const { isPending, error, data} = useQuery({ queryKey: ['get-total-spent'], queryFn: getTotalSpent })

  if (error) return 'An error has occurred: ' + error.message

  return (
    <>
        <Card className="w-full max-w-sm m-auto mt-10">
          <CardHeader>
            <CardTitle>Total Spent</CardTitle>
            <CardDescription>The total amount you have spent</CardDescription>
          </CardHeader>
            <CardContent>{isPending ? "Loading..." : data.total}</CardContent>
        </Card>
    </>
  )
}

export default App
