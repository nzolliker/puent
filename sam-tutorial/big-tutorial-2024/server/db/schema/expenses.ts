import { decimal, mysqlTable, serial, text} from 'drizzle-orm/mysql-core';

export const expenses = mysqlTable('expenses', {
  id: serial().primaryKey(),
  title: text('title'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
});
