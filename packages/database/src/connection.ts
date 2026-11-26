import mongoose from "mongoose";
import { UserFacingError } from "@studio/shared";

export class DatabaseUnavailableError extends UserFacingError {
  constructor(cause?: unknown) {
    super(
      "We can't reach the project database right now. Make sure MongoDB is running (run `npm run db:up`), then try again.",
      "database_unavailable",
      503,
    );
    this.name = "DatabaseUnavailableError";
    if (cause) this.cause = cause;
  }
}

interface ConnectionCache {
  promise: Promise<typeof mongoose> | null;
  uri: string | null;
}

// Survive hot-module reloads in development by caching on globalThis.
const globalForMongo = globalThis as typeof globalThis & { __studioMongo?: ConnectionCache };
const cache: ConnectionCache = (globalForMongo.__studioMongo ??= { promise: null, uri: null });

export function databaseUri(): string {
  return process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018/documentary_studio";
}

/**
 * Connect once and reuse the connection. Safe to call from every request.
 * Throws DatabaseUnavailableError with a user-readable message on failure.
 */
export async function connectDatabase(uri: string = databaseUri()): Promise<typeof mongoose> {
  if (cache.promise && cache.uri === uri) {
    try {
      return await cache.promise;
    } catch {
      // A previous attempt failed — fall through and try again.
    }
  }
  cache.uri = uri;
  cache.promise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 4000,
      // Indexes are declared on the schemas; build them in development.
      autoIndex: process.env.NODE_ENV !== "production",
    })
    .catch((error: unknown) => {
      cache.promise = null;
      throw new DatabaseUnavailableError(error);
    });
  return cache.promise;
}

export async function disconnectDatabase(): Promise<void> {
  cache.promise = null;
  cache.uri = null;
  await mongoose.disconnect();
}
