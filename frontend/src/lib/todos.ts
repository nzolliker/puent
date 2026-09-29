import { api } from '@/lib/api'

/** The open list. Finished to-dos live behind getTodoHistory. */
export async function getOpenTodos() {
    const response = await api.todos.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

export async function getTodoHistory() {
    const response = await api.todos.history.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

export async function createTodo(title: string) {
    const res = await api.todos.$post({ json: { title } })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

/** Ticking and undoing are the same call, so a mis-tick is one click to fix. */
export async function setTodoDone(id: number, done: boolean) {
    const res = await api.todos[':id{[0-9]+}'].$patch({
        param: { id: String(id) },
        json: { done },
    })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

export async function deleteTodo(id: number) {
    const res = await api.todos[':id{[0-9]+}'].$delete({ param: { id: String(id) } })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}
