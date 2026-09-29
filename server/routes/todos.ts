import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { db } from "../db";
import { todos as todosTable, insertTodoSchema } from "../db/schema/todos";

import { createTodoSchema, setTodoDoneSchema } from "../sharedTypes";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";

export const todosRoutes = new Hono()

  // The open list. Finished to-dos keep their row and move to /history.
  .get("/", async (c) => {
    const todos = await db
      .select()
      .from(todosTable)
      .where(isNull(todosTable.completedAt))
      // The id breaks ties: rows seeded in one insert share a timestamp.
      .orderBy(desc(todosTable.createdAt), desc(todosTable.id));

    return c.json({ todos: todos });
  })

  .post("/", zValidator("json", createTodoSchema), async (c) => {
    const todo = c.req.valid("json");

    const validatedTodo = insertTodoSchema.parse({
      ...todo,
    });

    const result = await db
      .insert(todosTable)
      .values({ ...validatedTodo })
      .$returningId();

    c.status(201);
    return c.json(result);
  })

  // Kept above /:id so it reads like the expenses routes, even though the
  // numeric pattern there would not match "history" anyway.
  .get("/history", async (c) => {
    const todos = await db
      .select()
      .from(todosTable)
      .where(isNotNull(todosTable.completedAt))
      .orderBy(desc(todosTable.completedAt), desc(todosTable.id));

    return c.json({ todos: todos });
  })

  .patch("/:id{[0-9]+}", zValidator("json", setTodoDoneSchema), async (c) => {
    const id = Number.parseInt(c.req.param("id"));
    const { done } = c.req.valid("json");

    const todo = await db
      .select()
      .from(todosTable)
      .where(eq(todosTable.id, id))
      .then((res) => res[0]);

    if (!todo) {
      return c.notFound();
    }

    await db
      .update(todosTable)
      .set({ completedAt: done ? new Date() : null })
      .where(eq(todosTable.id, id));

    return c.json({ id: id, done: done });
  })

  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number.parseInt(c.req.param("id"));

    const todo = await db.delete(todosTable).where(eq(todosTable.id, id));

    if (!todo) {
      return c.notFound();
    }
    return c.json({ id: id });
  });
