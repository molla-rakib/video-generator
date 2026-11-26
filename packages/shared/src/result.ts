/**
 * An error whose message is safe and meaningful to show to a non-technical
 * user. Anything that is not a UserFacingError is treated as an unexpected
 * failure and shown with a generic message (details go to server logs).
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    /** Machine-readable code for the UI to branch on. */
    readonly code: string = "user_error",
    /** HTTP status to use when this error crosses an API boundary. */
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class NotFoundError extends UserFacingError {
  constructor(what: string) {
    super(`We couldn't find that ${what}. It may have been deleted.`, "not_found", 404);
    this.name = "NotFoundError";
  }
}
