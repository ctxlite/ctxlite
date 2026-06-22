/** Minimal SQLite surface used by StatsStore. */
export interface StatsSqlite {
  exec(sql: string): void
  run(sql: string, ...params: unknown[]): { changes: number }
  get<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined
  close(): void
}
