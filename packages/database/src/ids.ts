import { Types } from "mongoose";
import { NotFoundError } from "@studio/shared";

/** Parse a route/user-supplied ID. Invalid IDs are treated as "not found". */
export function toObjectId(id: string, what: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id) {
    throw new NotFoundError(what);
  }
  return new Types.ObjectId(id);
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
