// Keep deployment diagnostics and the migration runner on the same schema versions.
export const migrations = [
  { version: "001", file: "001-platform.sql" },
  { version: "002", file: "002-channels.sql" },
  { version: "003", file: "003-field-inputs.sql" },
  { version: "004", file: "004-mcp.sql" },
  { version: "005", file: "005-query-indexes.sql" },
] as const
