import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import { insertStudentInvitationSchema, setupPasswordSchema } from "@shared/schema";
import { requireClassOwner } from "../middleware";
import { asyncHandler, BadRequestError, NotFoundError, ConflictError } from "../errors";

const router = Router();

// Create an invitation
router.post(
  "/api/classes/:classId/invitations",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = insertStudentInvitationSchema.safeParse({
      ...req.body,
      classId: req.cls!.id,
    });
    if (!parsed.success) {
      throw new BadRequestError("Invalid invitation data");
    }

    const invitation = await storage.createStudentInvitation(parsed.data);
    res.status(201).json(invitation);
  })
);

// List invitations for a class
router.get(
  "/api/classes/:classId/invitations",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const invitations = await storage.getInvitationsByClass(req.cls!.id);
    res.json(invitations);
  })
);

// Generate the copy-paste invitation emails for a set of invitations
router.post(
  "/api/classes/:classId/email-template",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = z
      .array(z.object({ email: z.string(), fullName: z.string(), token: z.string() }))
      .safeParse(req.body.invitations);
    if (!parsed.success) {
      throw new BadRequestError("Invalid invitations data");
    }

    const cls = req.cls!;

    // Only tokens actually belonging to this class may be templated, so the
    // endpoint cannot be used to mint a link for someone else invitation.
    const classInvitations = await storage.getInvitationsByClass(cls.id);
    const classTokens = new Set(classInvitations.map((i) => i.token));

    const emailTemplates = parsed.data
      .filter((invitation) => classTokens.has(invitation.token))
      .map((invitation) => {
        const loginUrl = `${req.protocol}://${req.get("host")}/setup-account?token=${invitation.token}`;

        return {
          email: invitation.email,
          subject: `Welcome to ${cls.name} - Set Up Your Account`,
          body: `Dear ${invitation.fullName},

You have been invited to join the class "${cls.name}" on the Widener University Contract Grading Portal.

To get started, please click the link below to set up your account:
${loginUrl}

This link will expire in 7 days. You will be able to:
- Choose your username
- Set your password
- Access your class assignments and contracts

If you have any questions, please contact your instructor.

Best regards,
Widener University Contract Grading Portal`,
        };
      });

    res.json({ emailTemplates });
  })
);

// ============================================================================
// Public: redeeming an invitation. These are the only unauthenticated routes
// that can create an account, now that self-registration is closed.
// ============================================================================

// Verify an invitation token
router.get(
  "/api/invitations/:token",
  asyncHandler(async (req, res) => {
    const invitation = await storage.getStudentInvitationByToken(req.params.token);

    if (!invitation || invitation.isUsed || invitation.expiresAt < new Date()) {
      throw new NotFoundError("Invalid or expired invitation");
    }

    // An invitation bound to an account tells the client which username is
    // already taken by it, so the form can show it instead of asking.
    let username: string | null = null;
    if (invitation.userId) {
      const user = await storage.getUser(invitation.userId);
      username = user?.username ?? null;
    }

    res.json({
      email: invitation.email,
      fullName: invitation.fullName,
      token: invitation.token,
      username,
    });
  })
);

// Redeem an invitation: choose a username and password, and get enrolled
router.post(
  "/api/invitations/:token/setup",
  asyncHandler(async (req, res) => {
    const parsed = setupPasswordSchema.safeParse({
      ...req.body,
      token: req.params.token,
    });
    if (!parsed.success) {
      throw new BadRequestError("A password of at least 6 characters is required");
    }

    const invitation = await storage.getStudentInvitationByToken(parsed.data.token);
    if (!invitation || invitation.isUsed || invitation.expiresAt < new Date()) {
      throw new NotFoundError("Invalid or expired invitation");
    }

    const hashedPassword = await hashPassword(parsed.data.password);

    let user;
    try {
      user = await storage.setupStudentPassword(
        parsed.data.token,
        parsed.data.username,
        hashedPassword
      );
    } catch (error) {
      // setupStudentPassword rejects a username that is already taken by a
      // different account.
      throw new ConflictError(
        error instanceof Error ? error.message : "Could not set up account"
      );
    }

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    });
  })
);

export default router;
