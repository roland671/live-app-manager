import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertSupabaseEnvConfigured,
  envValue,
  hasInvalidSupabaseConfig,
  SUPABASE_CONFIG_ERROR,
} from "./env.js";

type Row = Record<string, unknown>;

interface MockStore {
  workspaces: Row[];
  bug_signatures: Row[];
}

type TableName = keyof MockStore;

export type DbClient = SupabaseClient | MockSupabase;

const STORE_PATH = join(process.cwd(), ".data", "mock-db.json");

let client: DbClient | null = null;
let mockModeLogged = false;

function emptyStore(): MockStore {
  return { workspaces: [], bug_signatures: [] };
}

function loadStore(): MockStore {
  try {
    if (!existsSync(STORE_PATH)) return emptyStore();
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<MockStore>;
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      bug_signatures: Array.isArray(parsed.bug_signatures)
        ? parsed.bug_signatures
        : [],
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: MockStore): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function projectRow(row: Row, columns: string): Row {
  if (!columns || columns.trim() === "*") return { ...row };
  const keys = columns.split(",").map((c) => c.trim()).filter(Boolean);
  const out: Row = {};
  for (const key of keys) {
    out[key] = row[key];
  }
  return out;
}

class MockQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private orderSpec: { column: string; ascending: boolean } | null = null;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private countExact = false;
  private head = false;
  private insertRows: Row[] | null = null;
  private updatePatch: Row | null = null;
  private single = false;

  constructor(private readonly table: TableName) {}

  select(
    columns = "*",
    opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.action = "select";
    this.columns = columns;
    this.countExact = opts?.count === "exact";
    this.head = opts?.head === true;
    return this;
  }

  insert(data: Row | Row[]): this {
    this.action = "insert";
    this.insertRows = Array.isArray(data) ? data : [data];
    return this;
  }

  update(patch: Row): this {
    this.action = "update";
    this.updatePatch = patch;
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderSpec = { column, ascending: opts?.ascending !== false };
    return this;
  }

  maybeSingle(): Promise<{ data: Row | null; error: null; count: null }> {
    this.single = true;
    return this.execute().then((result) => ({
      data: Array.isArray(result.data)
        ? ((result.data[0] as Row | undefined) ?? null)
        : (result.data as Row | null),
      error: null,
      count: null,
    }));
  }

  /** Thenable so `await db.from(...).eq(...)` matches Supabase. */
  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((fn) => fn(row));
  }

  private async execute(): Promise<MockResult> {
    const store = loadStore();
    const rows = store[this.table];

    if (this.action === "insert" && this.insertRows) {
      const created = this.insertRows.map((row) => {
        const next: Row = { ...row };
        if (next.id == null) next.id = randomUUID();
        return next;
      });
      rows.push(...created);
      saveStore(store);
      return { data: created, error: null, count: created.length };
    }

    if (this.action === "update" && this.updatePatch) {
      let updated = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && this.matches(row)) {
          rows[i] = { ...row, ...this.updatePatch };
          updated += 1;
        }
      }
      saveStore(store);
      return { data: null, error: null, count: updated };
    }

    if (this.action === "delete") {
      const remaining = rows.filter((row) => !this.matches(row));
      const removed = rows.length - remaining.length;
      store[this.table] = remaining;
      saveStore(store);
      return { data: null, error: null, count: removed };
    }

    // select
    let matched = rows.filter((row) => this.matches(row));
    if (this.orderSpec) {
      const { column, ascending } = this.orderSpec;
      matched = [...matched].sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av) < String(bv) ? -1 : 1;
        return ascending ? cmp : -cmp;
      });
    }

    const count = this.countExact ? matched.length : null;

    if (this.head) {
      return { data: null, error: null, count };
    }

    const data = matched.map((row) => projectRow(row, this.columns));

    if (this.single) {
      return { data: data[0] ?? null, error: null, count: null };
    }

    return { data, error: null, count };
  }
}

interface MockResult {
  data: Row | Row[] | null;
  error: null;
  count: number | null;
}

class MockSupabase {
  from(table: string): MockQuery {
    if (table !== "workspaces" && table !== "bug_signatures") {
      throw new Error(`Mock DB: unsupported table "${table}"`);
    }
    return new MockQuery(table);
  }
}

/**
 * Server-only DB client.
 * Uses Supabase when real credentials are set; otherwise falls back to a local
 * mock store after logging a clear configuration error (safe for public OSS demos).
 */
export function getDb(): DbClient {
  if (client) return client;

  if (hasInvalidSupabaseConfig()) {
    assertSupabaseEnvConfigured();
    client = new MockSupabase();
    if (!mockModeLogged) {
      mockModeLogged = true;
      console.error(
        "[db] Falling back to local mock store at .data/mock-db.json until real credentials are supplied.",
      );
    }
    return client;
  }

  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    assertSupabaseEnvConfigured();
    throw new Error(SUPABASE_CONFIG_ERROR);
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

/** Reset cached client (tests). */
export function resetDbClient(): void {
  client = null;
}
