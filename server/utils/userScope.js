/**
 * User scope utilities for ensuring proper data isolation between users.
 * 
 * SECURITY: All user-specific data operations must use these helpers to ensure
 * that user_id is always taken from the authenticated session, never from
 * request body or query parameters.
 */

/**
 * Get the authenticated user's ID from the request.
 * This should be the ONLY source of user_id for data operations.
 * 
 * @param {import("express").Request} req - Express request object
 * @returns {number|null} User ID or null if not authenticated
 */
export function getUserId(req) {
  return req.session?.userId ?? null;
}

/**
 * Validate that a request does not contain user_id in body or query.
 * This prevents spoofing attacks where a malicious client tries to
 * access another user's data by sending a fake user_id.
 * 
 * @param {import("express").Request} req - Express request object
 * @param {string[]} [dangerousParams=["userId", "user_id"]] - Parameter names to check
 * @returns {{safe: boolean, error?: string}}
 */
export function validateNoUserIdInRequest(req, dangerousParams = ["userId", "user_id"]) {
  for (const param of dangerousParams) {
    if (req.body?.[param] !== undefined) {
      return {
        safe: false,
        error: `Request body must not contain '${param}'. User ID must come from authenticated session.`,
      };
    }
    if (req.query?.[param] !== undefined) {
      return {
        safe: false,
        error: `Query parameters must not contain '${param}'. User ID must come from authenticated session.`,
      };
    }
  }
  return { safe: true };
}

/**
 * Middleware that rejects requests containing user_id in body or query.
 * Apply this to endpoints that handle user-specific data.
 * 
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function rejectUserIdInRequest(req, res, next) {
  const validation = validateNoUserIdInRequest(req);
  if (!validation.safe) {
    return res.status(400).json({ error: validation.error, code: "USER_ID_SPOOFING_ATTEMPT" });
  }
  return next();
}

/**
 * Ensures the authenticated user ID is present in the request.
 * Returns the user ID or sends a 401 response.
 * 
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {number|null} User ID or null if unauthorized (response already sent)
 */
export function requireUserId(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return userId;
}
