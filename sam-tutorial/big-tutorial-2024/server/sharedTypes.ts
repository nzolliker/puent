import { insertExpenseSchema, selectExpenseSchema } from './db/schema/expenses';

export const createExpenseSchema = insertExpenseSchema.omit({ 
    id: true,
    createdAt: true,
});

export const createExpenseFormSchema = selectExpenseSchema.omit({
    id: true,
    createdAt: true,
});