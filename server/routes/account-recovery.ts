import { Router } from "express";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { passwordResetRequestSchema, resetPasswordSchema } from "@shared/schema";
import { requireInstructor } from "../middleware";
import { asyncHandler, BadRequestError, NotFoundError } from "../errors";

const router = Router();

// Identical response whether or not the username exists, so this cannot be
// used to enumerate accounts.
const GENERIC_RESET_RESPONSE = {
  message:
    "If that username exists, a reset link has been generated for your instructor. Contact them to receive it.",
};

/**
 * Request a password reset.
 *
 * The token is deliberately NOT returned here. It is delivered out of band by
 * the instructor, who sees pending requests at GET /api/admin/password-reset-requests.
 * Returning it to an anonymous caller would let anyone reset any account -- including
 * an instructor account -- by submitting only a username.
 */
router.post(
  "/api/auth/forgot-password",
  asyncHandler(async (req, res) => {
    const parsed = passwordResetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("A username is required");
    }

    const user = await storage.getUserByUsername(parsed.data.username);
    if (user) {
      await storage.createPasswordResetRequest(user.id);
    }

    res.json(GENERIC_RESET_RESPONSE);
  })
);

// Validate a reset token before showing the form
router.get(
  "/api/auth/reset-password/:token",
  asyncHandler(async (req, res) => {
    const resetRequest = await storage.getPasswordResetByToken(req.params.token);

    if (!resetRequest || resetRequest.isUsed || resetRequest.expiresAt < new Date()) {
      throw new NotFoundError("Invalid or expired password reset link");
    }

    // Only whether the token is usable -- no user id, no account details.
    res.json({ valid: true });
  })
);

// Redeem a reset token
router.post(
  "/api/auth/reset-password/:token",
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse({
      ...req.body,
      token: req.params.token,
    });
    if (!parsed.success) {
      throw new BadRequestError("Password must be at least 6 characters");
    }

    const resetRequest = await storage.getPasswordResetByToken(parsed.data.token);
    if (!resetRequest || resetRequest.isUsed || resetRequest.expiresAt < new Date()) {
      throw new NotFoundError("Invalid or expired password reset link");
    }

    const hashedPassword = await hashPassword(parsed.data.password);
    await storage.resetUserPassword(resetRequest.userId, hashedPassword);
    await storage.markPasswordResetAsUsed(parsed.data.token);

    res.json({ message: "Password reset successfully" });
  })
);

// ============================================================================
// Instructor-facing delivery. This is where the reset token actually surfaces,
// to an authenticated instructor who then hands the link to the student.
// ============================================================================

router.get(
  "/api/admin/password-reset-requests",
  requireInstructor,
  asyncHandler(async (_req, res) => {
    const resetRequests = await storage.getUnnotifiedPasswordResets();

    const requestsWithUsers = await Promise.all(
      resetRequests.map(async (request) => {
        const user = await storage.getUser(request.userId);
        return {
          ...request,
          user: user
            ? {
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                email: user.email,
              }
            : null,
        };
      })
    );

    res.json(requestsWithUsers);
  })
);

router.post(
  "/api/admin/password-reset-requests/:id/notify",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      throw new BadRequestError("Invalid request ID");
    }

    await storage.markPasswordResetAsNotified(requestId);
    res.json({ message: "Password reset request marked as notified" });
  })
);

export default router;
