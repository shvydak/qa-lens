import type {NextFunction, Request, RequestHandler, Response} from 'express'

/**
 * Express 4 does not forward rejected promises from async route handlers to the
 * error middleware, so an unhandled rejection leaves the request hanging.
 * Wrapping a handler routes any thrown/rejected error to `next(err)`.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
