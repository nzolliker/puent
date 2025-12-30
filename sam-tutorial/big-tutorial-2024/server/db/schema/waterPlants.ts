import { decimal, mysqlTable, serial, text, date} from 'drizzle-orm/mysql-core';

export const waterPlants = mysqlTable('waterPlants', {
  id: serial().primaryKey(),
  name: text('name'),
  date: date('date'),
});
