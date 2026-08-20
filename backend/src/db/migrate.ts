import 'dotenv/config'

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { FileMigrationProvider, Migrator } from 'kysely'

import { createDb } from './kysely'
import { appLogger } from '../utils/logger'

const run = async (): Promise<void> => {
  const database = createDb()

  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  })

  const { error, results } = await migrator.migrateToLatest()

  for (const result of results ?? []) {
    const outcome = result.status === 'Success' ? 'migrated' : result.status.toLowerCase()
    appLogger.info({ migrationName: result.migrationName, outcome }, 'migration executed')
  }

  await database.destroy()

  if (error) {
    throw error
  }
}

void run()
