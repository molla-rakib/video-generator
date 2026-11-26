import { ZodError } from "zod";
import { UserFacingError } from "@studio/shared";

/** Shape of every error response from the app's API. */
export interface ApiErrorBody {
  error: {
    code: string;
    /** Safe to show to the user. */
    message: string;
    /** Per-field messages for forms. */
    fields?: Record<string, string>;
  };
}

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "invalid_input",
          message: "Some details need another look.",
          fields: zodFieldErrors(error),
        },
      } satisfies ApiErrorBody,
      { status: 400 },
    );
  }
  if (error instanceof UserFacingError) {
    return Response.json({ error: { code: error.code, message: error.message } } satisfies ApiErrorBody, {
      status: error.status,
    });
  }
  console.error("[api] unexpected error", error);
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong on our side. Your work has not been lost — please try again.",
      },
    } satisfies ApiErrorBody,
    { status: 500 },
  );
}

/** Wrap a route handler so every failure becomes a friendly JSON error. */
export function apiHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Read a JSON body, turning malformed JSON into a friendly 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new UserFacingError("The request was not valid. Please refresh the page and try again.", "invalid_json", 400);
  }
}
