import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// Open the database synchronously
const expoDb = openDatabaseSync('jellyspot.db');

// Initialize Drizzle ORM
export const db = drizzle(expoDb, { schema });
