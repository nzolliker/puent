import { text } from 'drizzle-orm/gel-core';
import { decimal, int, mysqlTable, serial, varchar} from 'drizzle-orm/mysql-core';

export const expenses = mysqlTable('expenses', {
  id: serial().primaryKey(),
  userId: varchar('user_id').notNull(),
  title: varchar('title').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
});
