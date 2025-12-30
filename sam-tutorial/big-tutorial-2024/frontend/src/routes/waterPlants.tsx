import React from "react"
import { createFileRoute } from '@tanstack/react-router'
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/waterPlants')({
  component: Giessen,
})

  function handleEnroll() {}

  async function getAllDates() {
  const response = await api["water-plants"].$get()
  if (!response.ok) {
    throw new Error('Network response was not ok')
  }
  const data  = await response.json()
  console.log(data)
  const dates = data.waterPlants.map(({ date }) => new Date(date))
  console.log(dates)
  return dates
}

function Giessen() {
  const [date, setDate] = React.useState<Date | undefined>(
    new Date(2025, 11, 15)
  )
  const bookedDates = [new Date(2025, 11, 15), new Date(2025, 11, 18), new Date(2025, 11, 20)]
    /* Array.from(
    { length: 12 },
    (_, i) => new Date(2025, 5, 15 + i)
  ) */

    console.log("bookedDates", bookedDates)

  const { isPending, error, data} = useQuery({ queryKey: ['get-all-expenses'], queryFn: getAllDates })

  if (error) return 'An error has occurred: ' + error.message

  return (
  <div className="p-2 mx-auto max-w-md flex flex-col items-center">
    <h1 className="text-xl font-bold text-center">Giess-Plan</h1>
      <Calendar
      mode="single"
      defaultMonth={date}
      selected={date}
      onSelect={setDate}
      disabled={bookedDates}
      modifiers={{
        booked: data,
      }}
      modifiersClassNames={{
        booked: "[&>button]:line-through opacity-100 [&>button]:bg-green-300",
      }}
      className="rounded-lg border shadow-sm mt-3 justify-center"
      />
    <Button className="mt-5">Einschreiben</Button>
    <p></p>
  </div>
  )
}