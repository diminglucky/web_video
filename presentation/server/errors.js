export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const notFound = (message, details) =>
  new AppError(404, "NOT_FOUND", message, details);

export const conflict = (message, details) =>
  new AppError(409, "CONFLICT", message, details);

export const failedDependency = (message, details) =>
  new AppError(424, "FAILED_DEPENDENCY", message, details);

const PROJECT_ID_RE = /^\d{14}-[a-f0-9]{6}$/;

export function assertProjectId(id) {
  if (typeof id !== "string" || !PROJECT_ID_RE.test(id)) {
    throw badRequest(
      "Invalid project id. Expected format: YYYYMMDDHHMMSS-abcdef.",
    );
  }
  return id;
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function sendError(error, res) {
  const isAppError = error instanceof AppError;
  const status = isAppError ? error.status : Number.isInteger(error?.status) ? error.status : 500;
  const body = {
    error: error?.message || "Internal server error",
    code: isAppError ? error.code : error?.code || "INTERNAL_ERROR",
  };
  if (isAppError && error.details !== undefined) body.details = error.details;
  if (!isAppError && error?.quality) body.details = error.quality;
  res.status(status).json(body);
}
