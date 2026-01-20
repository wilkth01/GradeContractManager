import type { Express } from "express";
import { createServer, type Server } from "http";
import { hashPassword } from "./auth";
import { storage } from "./storage";
import { auditService } from "./audit";
import { connectionManager, createProgressUpdateEvent } from "./websocket";
import { insertClassSchema, updateClassSchema, insertAssignmentSchema, insertStudentInvitationSchema, setupPasswordSchema, passwordResetRequestSchema, resetPasswordSchema, insertEngagementIntentionSchema, updateEngagementIntentionSchema, insertAttendanceRecordSchema, updateAttendanceRecordSchema } from "@shared/schema";
import { AssignmentStatus, isAssignmentDone } from "@shared/constants";

export async function registerRoutes(app: Express): Promise<Server> {
  // NOTE: setupAuth() is now called in server/index.ts before route registration

  // NOTE: Class and Assignment routes have been moved to modular route files:
  // - server/routes/classes.ts
  // - server/routes/assignments.ts
  // They are registered via registerRouteModules() in server/index.ts

  // Get class analytics
  app.get("/api/classes/:classId/analytics", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    try {
      const classId = parseInt(req.params.classId);
      const userId = req.user!.id;
      
      // Verify the user owns this class
      const classData = await storage.getClass(classId);
      if (!classData || classData.instructorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get all data needed for analytics in parallel (single query per data type)
      const [students, assignments, contracts, studentContracts, allProgressFlat] = await Promise.all([
        storage.getEnrolledStudents(classId),
        storage.getAssignmentsByClass(classId),
        storage.getContractsByClass(classId),
        storage.getStudentContractsByClass(classId),
        storage.getStudentProgressForClass(classId), // Single query for all students
      ]);

      // Group progress by student for efficient lookups
      const progressByStudent = new Map<number, typeof allProgressFlat>();
      for (const progress of allProgressFlat) {
        const studentProgress = progressByStudent.get(progress.studentId) || [];
        studentProgress.push(progress);
        progressByStudent.set(progress.studentId, studentProgress);
      }

      // Calculate assignment statistics
      const assignmentStats = assignments.map(assignment => {
        const statusBreakdown = { notStarted: 0, inProgress: 0, completed: 0, excellent: 0 };
        let totalProgress = 0;

        students.forEach((student) => {
          const studentProgress = progressByStudent.get(student.id) || [];
          const assignmentProgress = studentProgress.find(p => p.assignmentId === assignment.id);
          const status = assignmentProgress?.status ?? AssignmentStatus.NOT_STARTED;

          if (!assignmentProgress || status === AssignmentStatus.NOT_STARTED) {
            statusBreakdown.notStarted++;
          } else if (status === AssignmentStatus.IN_PROGRESS) {
            statusBreakdown.inProgress++;
          } else if (status === AssignmentStatus.COMPLETED) {
            statusBreakdown.completed++;
          } else if (status === AssignmentStatus.EXCELLENT) {
            statusBreakdown.excellent++;
          }

          if (assignmentProgress && isAssignmentDone(status)) {
            totalProgress++;
          }
        });

        const completionRate = students.length > 0 ? Math.round((totalProgress / students.length) * 100) : 0;

        return {
          assignment,
          completionRate,
          statusBreakdown
        };
      });

      // Calculate student performance
      const studentPerformance = students.map((student) => {
        const studentProgress = progressByStudent.get(student.id) || [];
        const studentContract = studentContracts.find(sc => sc.studentId === student.id);

        const completedAssignments = studentProgress.filter(p => isAssignmentDone(p.status)).length;
        const progressScore = assignments.length > 0 ? Math.round((completedAssignments / assignments.length) * 100) : 0;
        
        // Find most recent activity
        const lastActivity = studentProgress.length > 0 ? "Recent activity" : "No activity";

        return {
          student,
          contract: studentContract || null,
          progressScore,
          completedAssignments,
          totalAssignments: assignments.length,
          lastActivity
        };
      });

      // Calculate contract distribution
      const contractDistribution = contracts.map(contract => {
        const contractStudents = studentContracts.filter(sc => sc.contractId === contract.id);
        const confirmed = contractStudents.filter(sc => sc.isConfirmed).length;
        const pending = contractStudents.filter(sc => !sc.isConfirmed).length;
        const count = contractStudents.length;
        const percentage = students.length > 0 ? Math.round((count / students.length) * 100) : 0;

        return {
          gradeLevel: contract.grade,
          count,
          percentage,
          confirmed,
          pending
        };
      });

      // Calculate overall metrics
      const totalStudents = students.length;
      const overallCompletionRate = studentPerformance.length > 0 
        ? Math.round(studentPerformance.reduce((sum, sp) => sum + sp.progressScore, 0) / studentPerformance.length)
        : 0;
      const atRiskStudents = studentPerformance.filter(sp => sp.progressScore < 60).length;
      const highPerformers = studentPerformance.filter(sp => sp.progressScore >= 90).length;

      const analyticsData = {
        classInfo: classData,
        totalStudents,
        overallCompletionRate,
        atRiskStudents,
        highPerformers,
        assignmentStats,
        studentPerformance,
        contractDistribution
      };

      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching class analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Grade Contract Management
  app.post("/api/classes/:classId/contracts", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const contract = await storage.createGradeContract({
      classId: parseInt(req.params.classId),
      grade: req.body.grade,
      version: req.body.version,
      assignments: req.body.assignments,
      requiredEngagementIntentions: req.body.requiredEngagementIntentions || 0,
      maxAbsences: req.body.maxAbsences || 0,
      categoryRequirements: req.body.categoryRequirements || null,
    });
    res.status(201).json(contract);
  });

  app.get("/api/classes/:classId/contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const contracts = await storage.getContractsByClass(parseInt(req.params.classId));
    res.json(contracts);
  });

  app.patch("/api/classes/:classId/contracts/:contractId", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const contractId = parseInt(req.params.contractId);

    // Verify the contract exists and belongs to this class
    const existingContracts = await storage.getContractsByClass(classId);
    const contract = existingContracts.find(c => c.id === contractId);

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    const updatedContract = await storage.updateGradeContract({
      id: contractId,
      classId,
      grade: req.body.grade,
      version: req.body.version,
      assignments: req.body.assignments,
      requiredEngagementIntentions: req.body.requiredEngagementIntentions || 0,
      maxAbsences: req.body.maxAbsences || 0,
      categoryRequirements: req.body.categoryRequirements || null,
    });

    res.json(updatedContract);
  });

  // Student Contract Selection
  app.post("/api/classes/:classId/student-contract", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "student") {
      return res.sendStatus(403);
    }

    const contract = await storage.setStudentContract({
      studentId: req.user.id,
      classId: parseInt(req.params.classId),
      contractId: req.body.contractId,
      isConfirmed: req.body.isConfirmed || false,
    });
    res.status(201).json(contract);
  });

  // Add confirmation endpoint
  app.post("/api/classes/:classId/student-contract/confirm", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "student") {
      return res.sendStatus(403);
    }

    const contract = await storage.confirmStudentContract(
      req.user.id,
      parseInt(req.params.classId)
    );
    res.status(200).json(contract);
  });

  // Add instructor endpoint to reset contract confirmation
  app.post("/api/classes/:classId/students/:studentId/contract/reset", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const contract = await storage.resetStudentContract(
      parseInt(req.params.studentId),
      parseInt(req.params.classId)
    );
    res.status(200).json(contract);
  });

  app.post("/api/classes/:classId/students/:studentId/contract", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);
    const contractId = req.body.contractId;

    try {
      const contract = await storage.setStudentContract({
        studentId,
        classId,
        contractId,
        isConfirmed: false,
      });
      res.status(201).json(contract);
    } catch (error) {
      console.error("Error setting student contract:", error);
      res.status(500).json({ message: "Failed to set student contract" });
    }
  });

  app.get("/api/classes/:classId/students/:studentId/contract", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);

    try {
      const contract = await storage.getStudentContract(studentId, classId);
      res.json(contract);
    } catch (error) {
      console.error("Error getting student contract:", error);
      res.status(500).json({ message: "Failed to get student contract" });
    }
  });

  app.post("/api/classes/:classId/students/import", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const { students } = req.body;

    if (!Array.isArray(students)) {
      return res.status(400).json({ message: "Invalid students data" });
    }

    try {
      // Create user accounts for each student and enroll them in the class
      const enrolledStudents = await Promise.all(
        students.map(async (student) => {
          try {
            // Check if user already exists
            let user = await storage.getUserByUsername(student.username);

            if (!user) {
              // Create new user with hashed password
              user = await storage.createUser({
                username: student.username,
                password: await hashPassword(student.password),
                fullName: student.fullName,
                role: "student",
              });
            }

            // Enroll student in the class
            await storage.enrollStudent(classId, user.id);

            return {
              id: user.id,
              username: user.username,
              fullName: student.fullName,
              email: student.email,
            };
          } catch (error) {
            console.error("Error processing student:", student.username, error);
            throw error;
          }
        })
      );

      res.status(201).json(enrolledStudents);
    } catch (error) {
      console.error("Error importing students:", error);
      res.status(500).json({
        message: "Failed to import students",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/classes/:classId/students", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const students = await storage.getEnrolledStudents(classId);
    res.json(students);
  });
  app.get("/api/classes/:classId/student-contracts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);

    try {
      const contracts = await storage.getStudentContractsByClass(classId);
      res.json(contracts);
    } catch (error) {
      console.error("Error getting student contracts:", error);
      res.status(500).json({ message: "Failed to get student contracts" });
    }
  });

  app.get("/api/classes/:classId/students/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);

    try {
      // Get all progress for the class in a single query
      const allProgress = await storage.getStudentProgressForClass(classId);
      res.json(allProgress);
    } catch (error) {
      console.error("Error getting student progress:", error);
      res.status(500).json({ message: "Failed to get student progress" });
    }
  });


  app.get("/api/classes/:classId/students/:studentId/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const studentId = parseInt(req.params.studentId);
    const classId = parseInt(req.params.classId);

    try {
      const progress = await storage.getStudentProgress(studentId, classId);
      res.json(progress);
    } catch (error) {
      console.error("Error getting student progress:", error);
      res.status(500).json({ message: "Failed to get student progress" });
    }
  });

  app.post("/api/classes/:classId/students/:studentId/assignments/:assignmentId/progress", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);
    const assignmentId = parseInt(req.params.assignmentId);

    try {
      // Get existing progress entries for this student
      const existingProgress = await storage.getStudentProgress(studentId, classId);
      const currentProgress = existingProgress.find(p => p.assignmentId === assignmentId);

      const progress = await storage.updateProgress({
        studentId,
        assignmentId,
        status: req.body.status !== undefined ? parseInt(req.body.status) : null,
        numericGrade: req.body.numericGrade !== undefined ? parseFloat(req.body.numericGrade).toString() : null,
        lastUpdated: new Date(),
        attempts: (currentProgress?.attempts ?? 0) + 1,
      });

      // Audit log the grade change
      await auditService.logWithRequest(req, {
        action: currentProgress ? "UPDATE" : "CREATE",
        entityType: "assignment_progress",
        entityId: progress.id,
        oldValues: currentProgress ? {
          studentId: currentProgress.studentId,
          assignmentId: currentProgress.assignmentId,
          status: currentProgress.status,
          numericGrade: currentProgress.numericGrade,
          classId,
        } : null,
        newValues: {
          studentId: progress.studentId,
          assignmentId: progress.assignmentId,
          status: progress.status,
          numericGrade: progress.numericGrade,
          classId,
        },
      });

      // Broadcast real-time update via WebSocket
      const event = createProgressUpdateEvent(classId, {
        studentId,
        assignmentId,
        status: progress.status ?? undefined,
        numericGrade: progress.numericGrade ?? undefined,
        attempts: progress.attempts ?? undefined,
      });
      connectionManager.broadcast(classId, event);

      res.json(progress);
    } catch (error) {
      console.error("Error updating assignment progress:", error);
      res.status(500).json({ message: "Failed to update assignment progress" });
    }
  });

  // Note: Progress/Canvas import has been moved to server/routes/canvas-import.ts
  // with improved student matching and preview functionality

  // Student invitation endpoints
  app.post("/api/classes/:classId/invitations", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const parsed = insertStudentInvitationSchema.safeParse({
      ...req.body,
      classId,
    });

    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      const invitation = await storage.createStudentInvitation(parsed.data);
      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  app.get("/api/classes/:classId/invitations", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    
    try {
      const invitations = await storage.getInvitationsByClass(classId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  // Student invitation verification and setup
  app.get("/api/invitations/:token", async (req, res) => {
    const { token } = req.params;

    try {
      const invitation = await storage.getStudentInvitationByToken(token);
      
      if (!invitation || invitation.isUsed || invitation.expiresAt < new Date()) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      res.json({
        email: invitation.email,
        fullName: invitation.fullName,
        token: invitation.token,
      });
    } catch (error) {
      console.error("Error verifying invitation:", error);
      res.status(500).json({ message: "Failed to verify invitation" });
    }
  });

  app.post("/api/invitations/:token/setup", async (req, res) => {
    const { token } = req.params;
    const parsed = setupPasswordSchema.safeParse({
      ...req.body,
      token,
    });

    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      const hashedPassword = await hashPassword(parsed.data.password);
      const user = await storage.setupStudentPassword(
        token,
        parsed.data.username,
        hashedPassword
      );

      res.json({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      });
    } catch (error) {
      console.error("Error setting up student password:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to setup password" 
      });
    }
  });

  // Email template generator endpoint
  app.post("/api/classes/:classId/email-template", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const { invitations } = req.body;

    if (!Array.isArray(invitations)) {
      return res.status(400).json({ message: "Invalid invitations data" });
    }

    try {
      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Generate email templates for each invitation
      const emailTemplates = invitations.map(invitation => {
        const loginUrl = `${req.protocol}://${req.get('host')}/setup-account?token=${invitation.token}`;
        
        return {
          email: invitation.email,
          subject: `Welcome to ${cls.name} - Set Up Your Account`,
          body: `Dear ${invitation.fullName},

You have been invited to join the class "${cls.name}" on the Widener University Contract Grading Portal.

To get started, please click the link below to set up your account:
${loginUrl}

This link will expire in 7 days. You'll be able to:
- Choose your username
- Set your password
- Access your class assignments and contracts

If you have any questions, please contact your instructor.

Best regards,
Widener University Contract Grading Portal`
        };
      });

      res.json({ emailTemplates });
    } catch (error) {
      console.error("Error generating email templates:", error);
      res.status(500).json({ message: "Failed to generate email templates" });
    }
  });

  // Password reset endpoints
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = passwordResetRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      const user = await storage.getUserByUsername(parsed.data.username);
      
      if (!user) {
        // Don't reveal if user exists or not for security
        return res.json({ message: "If the username exists, a password reset link will be provided to your instructor." });
      }

      // Create password reset request
      const resetRequest = await storage.createPasswordResetRequest(user.id);

      res.json({ 
        message: "Password reset request created. Your instructor will be notified.",
        resetToken: resetRequest.token // In production, don't return this - it would be emailed
      });
    } catch (error) {
      console.error("Error creating password reset request:", error);
      res.status(500).json({ message: "Failed to create password reset request" });
    }
  });

  app.get("/api/auth/reset-password/:token", async (req, res) => {
    const { token } = req.params;

    try {
      const resetRequest = await storage.getPasswordResetByToken(token);
      
      if (!resetRequest || resetRequest.isUsed || resetRequest.expiresAt < new Date()) {
        return res.status(404).json({ message: "Invalid or expired password reset link" });
      }

      res.json({
        token: resetRequest.token,
        userId: resetRequest.userId,
      });
    } catch (error) {
      console.error("Error verifying password reset token:", error);
      res.status(500).json({ message: "Failed to verify password reset token" });
    }
  });

  app.post("/api/auth/reset-password/:token", async (req, res) => {
    const { token } = req.params;
    const parsed = resetPasswordSchema.safeParse({
      ...req.body,
      token,
    });

    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      const resetRequest = await storage.getPasswordResetByToken(token);
      
      if (!resetRequest || resetRequest.isUsed || resetRequest.expiresAt < new Date()) {
        return res.status(404).json({ message: "Invalid or expired password reset link" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(parsed.data.password);
      
      // Update user password
      const updatedUser = await storage.resetUserPassword(resetRequest.userId, hashedPassword);
      
      // Mark reset request as used
      await storage.markPasswordResetAsUsed(token);

      res.json({
        message: "Password reset successfully",
        userId: updatedUser.id,
        username: updatedUser.username,
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to reset password" 
      });
    }
  });

  // Admin endpoint to get unnotified password reset requests
  app.get("/api/admin/password-reset-requests", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    try {
      const resetRequests = await storage.getUnnotifiedPasswordResets();
      
      // Get user details for each request
      const requestsWithUsers = await Promise.all(
        resetRequests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          return {
            ...request,
            user: user ? {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
            } : null
          };
        })
      );

      res.json(requestsWithUsers);
    } catch (error) {
      console.error("Error fetching password reset requests:", error);
      res.status(500).json({ message: "Failed to fetch password reset requests" });
    }
  });

  app.post("/api/admin/password-reset-requests/:id/notify", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const requestId = parseInt(req.params.id);

    try {
      await storage.markPasswordResetAsNotified(requestId);
      res.json({ message: "Password reset request marked as notified" });
    } catch (error) {
      console.error("Error marking password reset as notified:", error);
      res.status(500).json({ message: "Failed to mark as notified" });
    }
  });

  // NOTE: GET /api/classes/:classId/enrolled-students moved to server/routes/classes.ts

  // Engagement Intention Management
  app.post("/api/classes/:classId/engagement-intentions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // Ensure student is enrolled in class or instructor owns class
    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (req.user.role === "student") {
      const enrollment = await storage.getStudentContract(req.user.id, classId);
      if (!enrollment) {
        return res.sendStatus(403);
      }
    } else if (req.user.role === "instructor" && cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    const parsed = insertEngagementIntentionSchema.safeParse({
      ...req.body,
      studentId: req.user.role === "student" ? req.user.id : req.body.studentId,
      classId: classId,
    });

    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      // Check if intention already exists for this week
      const existing = await storage.getEngagementIntention(
        parsed.data.studentId,
        classId,
        parsed.data.weekNumber
      );

      if (existing) {
        return res.status(409).json({ message: "Intention already exists for this week" });
      }

      const intention = await storage.createEngagementIntention(parsed.data);
      res.status(201).json(intention);
    } catch (error) {
      console.error("Error creating engagement intention:", error);
      res.status(500).json({ message: "Failed to create engagement intention" });
    }
  });

  app.get("/api/classes/:classId/engagement-intentions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    try {
      let intentions;
      
      if (req.user.role === "student") {
        // Students can only see their own intentions
        const enrollment = await storage.getStudentContract(req.user.id, classId);
        if (!enrollment) {
          return res.sendStatus(403);
        }
        intentions = await storage.getStudentEngagementIntentions(req.user.id, classId);
      } else if (req.user.role === "instructor") {
        // Instructors can see all class intentions
        if (cls.instructorId !== req.user.id) {
          return res.sendStatus(403);
        }
        intentions = await storage.getClassEngagementIntentions(classId);
      }

      res.json(intentions);
    } catch (error) {
      console.error("Error fetching engagement intentions:", error);
      res.status(500).json({ message: "Failed to fetch engagement intentions" });
    }
  });

  app.get("/api/classes/:classId/students/:studentId/engagement-intentions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);
    
    if (isNaN(classId) || isNaN(studentId)) {
      return res.status(400).json({ message: "Invalid class or student ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Only allow access if user is the student themselves or the instructor
    if (req.user.role === "student" && req.user.id !== studentId) {
      return res.sendStatus(403);
    } else if (req.user.role === "instructor" && cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      const intentions = await storage.getStudentEngagementIntentions(studentId, classId);
      res.json(intentions);
    } catch (error) {
      console.error("Error fetching student engagement intentions:", error);
      res.status(500).json({ message: "Failed to fetch engagement intentions" });
    }
  });

  app.patch("/api/engagement-intentions/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const intentionId = parseInt(req.params.id);
    if (isNaN(intentionId)) {
      return res.status(400).json({ message: "Invalid intention ID" });
    }

    const parsed = updateEngagementIntentionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error);
    }

    try {
      // Get the current intention by ID to verify ownership/access
      const currentIntention = await storage.getEngagementIntentionById(intentionId);

      if (!currentIntention) {
        return res.status(404).json({ message: "Engagement intention not found" });
      }

      // Verify permissions
      if (req.user.role === "student" && currentIntention.studentId !== req.user.id) {
        return res.sendStatus(403);
      } else if (req.user.role === "instructor") {
        const cls = await storage.getClass(currentIntention.classId);
        if (!cls || cls.instructorId !== req.user.id) {
          return res.sendStatus(403);
        }
      }

      const updatedIntention = await storage.updateEngagementIntention(intentionId, parsed.data);
      res.json(updatedIntention);
    } catch (error) {
      console.error("Error updating engagement intention:", error);
      res.status(500).json({ message: "Failed to update engagement intention" });
    }
  });

  app.get("/api/classes/:classId/engagement-intentions/week/:weekNumber", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const weekNumber = parseInt(req.params.weekNumber);
    
    if (isNaN(classId) || isNaN(weekNumber)) {
      return res.status(400).json({ message: "Invalid class ID or week number" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Only allow instructors to see week-specific data for all students
    if (req.user.role !== "instructor" || cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      const intentions = await storage.getCurrentWeekEngagementIntentions(classId, weekNumber);
      res.json(intentions);
    } catch (error) {
      console.error("Error fetching weekly engagement intentions:", error);
      res.status(500).json({ message: "Failed to fetch weekly intentions" });
    }
  });

  // ============= ATTENDANCE TRACKING ROUTES =============

  // Get attendance records for a class on a specific date
  app.get("/api/classes/:classId/attendance", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const date = req.query.date as string;

    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (req.user.role !== "instructor" || cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      const records = await storage.getClassAttendanceByDate(classId, date);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      res.status(500).json({ message: "Failed to fetch attendance records" });
    }
  });

  // Batch create/update attendance records
  app.post("/api/classes/:classId/attendance/batch", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (req.user.role !== "instructor" || cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      const { records } = req.body;
      await storage.batchUpsertAttendance(records);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving attendance records:", error);
      res.status(500).json({ message: "Failed to save attendance records" });
    }
  });

  // Get all attendance records for a class
  app.get("/api/classes/:classId/all-attendance", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls || cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      const attendanceRecords = await storage.getAllClassAttendance(classId);
      res.json(attendanceRecords);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      res.status(500).json({ message: "Failed to fetch attendance records" });
    }
  });

  // Update student absences count
  app.post("/api/classes/:classId/students/:studentId/absences", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);
    const { absences } = req.body;

    if (isNaN(classId) || isNaN(studentId) || typeof absences !== "number" || absences < 0) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const cls = await storage.getClass(classId);
    if (!cls || cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    try {
      await storage.setStudentAbsences(studentId, classId, absences);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating absences:", error);
      res.status(500).json({ message: "Failed to update absences" });
    }
  });

  // Get attendance records for a student in a class
  app.get("/api/classes/:classId/students/:studentId/attendance", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);

    if (isNaN(classId) || isNaN(studentId)) {
      return res.status(400).json({ message: "Invalid class or student ID" });
    }

    // Students can only access their own data, instructors can access any student's data
    if (req.user.role !== "instructor" && req.user.id !== studentId) {
      return res.sendStatus(403);
    }

    // Verify instructor owns the class if instructor is requesting
    if (req.user.role === "instructor") {
      const cls = await storage.getClass(classId);
      if (!cls || cls.instructorId !== req.user.id) {
        return res.sendStatus(403);
      }
    }

    try {
      const attendanceRecords = await storage.getStudentAttendance(studentId, classId);
      res.json(attendanceRecords);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      res.status(500).json({ message: "Failed to fetch attendance records" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}