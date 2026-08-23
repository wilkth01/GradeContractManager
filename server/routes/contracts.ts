import { Router } from "express";
import { storage } from "../storage";
import { insertGradeContractSchema, importContractsSchema } from "@shared/schema";
import {
  requireClassOwner,
  requireClassMember,
  requireStudent,
  requireStudentAccess,
} from "../middleware";
import {
  asyncHandler,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../errors";

const router = Router();

// ============================================================================
// Grade contracts (the per-letter-grade requirements an instructor publishes)
// ============================================================================

// Create a grade contract
router.post(
  "/api/classes/:classId/contracts",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = insertGradeContractSchema.safeParse({
      ...req.body,
      classId: req.cls!.id,
    });
    if (!parsed.success) {
      throw new BadRequestError("Invalid grade contract data");
    }

    const contract = await storage.createGradeContract({
      classId: req.cls!.id,
      grade: parsed.data.grade,
      version: parsed.data.version,
      assignments: parsed.data.assignments,
      requiredParticipationSessions: parsed.data.requiredParticipationSessions ?? 0,
      maxAbsences: parsed.data.maxAbsences ?? 0,
      categoryRequirements: parsed.data.categoryRequirements ?? null,
    });
    res.status(201).json(contract);
  })
);

/**
 * Create or replace a whole tier of contracts in one go, from a summary table.
 *
 * The client has already resolved each row of the pasted table to a module
 * group or an assignment, and the instructor has confirmed it. Every id in that
 * result is still re-checked here: the browser is not the authority on which
 * assignments belong to this class, and a category naming a group that does not
 * exist would silently require nothing of anybody.
 *
 * A grade that already has a contract is published as a new version rather than
 * overwritten, so the previous terms stay on record and students stay where
 * they are -- the same path an edit takes.
 */
router.post(
  "/api/classes/:classId/contracts/import",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = importContractsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(
        parsed.error.issues[0]?.message ?? "Invalid contract data"
      );
    }

    const classAssignments = await storage.getAssignmentsByClass(req.cls!.id);
    const ownedIds = new Set(classAssignments.map((a) => a.id));
    const groups = new Set(
      classAssignments.map((a) => a.moduleGroup || "Uncategorized")
    );

    const grades = parsed.data.contracts.map((c) => c.grade);
    if (new Set(grades).size !== grades.length) {
      throw new BadRequestError("Each grade may appear only once");
    }

    for (const draft of parsed.data.contracts) {
      for (const requirement of draft.assignments) {
        if (!ownedIds.has(requirement.id)) {
          throw new BadRequestError("That assignment does not belong to this class");
        }
      }
      for (const category of draft.categoryRequirements) {
        if (!groups.has(category.category)) {
          throw new BadRequestError(
            `No module group named "${category.category}" in this class`
          );
        }
      }
    }

    const existing = await storage.getContractsByClass(req.cls!.id);
    const created: string[] = [];
    const updated: { grade: string; movedStudents: number }[] = [];

    for (const draft of parsed.data.contracts) {
      const terms = {
        classId: req.cls!.id,
        grade: draft.grade,
        assignments: draft.assignments,
        requiredParticipationSessions: draft.requiredParticipationSessions,
        maxAbsences: draft.maxAbsences,
        categoryRequirements: draft.categoryRequirements.length
          ? draft.categoryRequirements
          : null,
      };

      // The current version of a grade is its highest-numbered row.
      const current = existing
        .filter((c) => c.grade === draft.grade)
        .sort((a, b) => b.version - a.version)[0];

      if (current) {
        const result = await storage.publishContractVersion(current, terms);
        updated.push({ grade: draft.grade, movedStudents: result.movedStudents });
      } else {
        await storage.createGradeContract({ ...terms, version: 1 });
        created.push(draft.grade);
      }
    }

    res.status(201).json({ created, updated });
  })
);

// List the contracts available in a class (students need this to choose one)
router.get(
  "/api/classes/:classId/contracts",
  requireClassMember(),
  asyncHandler(async (req, res) => {
    const contracts = await storage.getContractsByClass(req.cls!.id);
    res.json(contracts);
  })
);

// Update a grade contract
router.patch(
  "/api/classes/:classId/contracts/:contractId",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const contractId = parseInt(req.params.contractId);
    if (isNaN(contractId)) {
      throw new BadRequestError("Invalid contract ID");
    }

    // The contract must belong to the class the caller was authorized against,
    // otherwise owning one class would let you edit another class contracts.
    const existingContracts = await storage.getContractsByClass(req.cls!.id);
    const contract = existingContracts.find((c) => c.id === contractId);
    if (!contract) {
      throw new NotFoundError("Contract not found");
    }

    const parsed = insertGradeContractSchema.safeParse({
      ...req.body,
      classId: req.cls!.id,
    });
    if (!parsed.success) {
      throw new BadRequestError("Invalid grade contract data");
    }

    // Published as a new version so the previous terms stay on record, but it
    // applies to everyone on that contract immediately -- no student action.
    const result = await storage.publishContractVersion(contract, {
      classId: req.cls!.id,
      grade: parsed.data.grade,
      assignments: parsed.data.assignments,
      requiredParticipationSessions: parsed.data.requiredParticipationSessions ?? 0,
      maxAbsences: parsed.data.maxAbsences ?? 0,
      categoryRequirements: parsed.data.categoryRequirements ?? null,
    });

    res.json({ ...result.contract, movedStudents: result.movedStudents });
  })
);

// ============================================================================
// Student contract selection
// ============================================================================

/**
 * Resolve the enrollment for a student in a class, or reject.
 *
 * student_contracts doubles as the enrollment record, so this must be checked
 * before any write. Otherwise selecting a contract silently enrolls the caller
 * in a class they were never added to.
 */
async function requireEnrollment(studentId: number, classId: number) {
  const enrollment = await storage.getStudentContract(studentId, classId);
  if (!enrollment) {
    throw new ForbiddenError("Not enrolled in this class");
  }
  return enrollment;
}

// A student chooses their own contract
router.post(
  "/api/classes/:classId/student-contract",
  requireStudent,
  asyncHandler(async (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      throw new BadRequestError("Invalid class ID");
    }

    const enrollment = await requireEnrollment(req.user!.id, classId);
    if (enrollment.isConfirmed) {
      throw new ConflictError(
        "Your contract is already confirmed. Ask your instructor to reset it before changing your selection."
      );
    }

    const contractId = req.body.contractId;
    if (typeof contractId !== "number") {
      throw new BadRequestError("contractId is required");
    }

    // The chosen contract has to belong to this class.
    const contracts = await storage.getContractsByClass(classId);
    if (!contracts.some((c) => c.id === contractId)) {
      throw new BadRequestError("That contract does not belong to this class");
    }

    const contract = await storage.setStudentContract({
      studentId: req.user!.id,
      classId,
      contractId,
      isConfirmed: false,
    });
    res.status(201).json(contract);
  })
);

// A student confirms their selection
router.post(
  "/api/classes/:classId/student-contract/confirm",
  requireStudent,
  asyncHandler(async (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      throw new BadRequestError("Invalid class ID");
    }

    const enrollment = await requireEnrollment(req.user!.id, classId);
    if (!enrollment.contractId) {
      throw new BadRequestError("Select a grade contract before confirming");
    }

    const contract = await storage.confirmStudentContract(req.user!.id, classId);
    res.status(200).json(contract);
  })
);

// Instructor assigns a contract on behalf of a student
router.post(
  "/api/classes/:classId/students/:studentId/contract",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    await requireEnrollment(studentId, req.cls!.id);

    const contractId = req.body.contractId;
    if (typeof contractId !== "number") {
      throw new BadRequestError("contractId is required");
    }

    const contracts = await storage.getContractsByClass(req.cls!.id);
    if (!contracts.some((c) => c.id === contractId)) {
      throw new BadRequestError("That contract does not belong to this class");
    }

    const contract = await storage.setStudentContract({
      studentId,
      classId: req.cls!.id,
      contractId,
      isConfirmed: false,
    });
    res.status(201).json(contract);
  })
);

// Instructor resets a confirmation so the student can choose again
router.post(
  "/api/classes/:classId/students/:studentId/contract/reset",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    await requireEnrollment(studentId, req.cls!.id);
    const contract = await storage.resetStudentContract(studentId, req.cls!.id);
    res.status(200).json(contract);
  })
);

// A single student contract selection
router.get(
  "/api/classes/:classId/students/:studentId/contract",
  requireStudentAccess(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const contract = await storage.getStudentContract(studentId, req.cls!.id);
    res.json(contract ?? null);
  })
);

// Every student contract selection. Instructor only, since it reveals which
// grade each classmate is contracting for.
router.get(
  "/api/classes/:classId/student-contracts",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const contracts = await storage.getStudentContractsByClass(req.cls!.id);
    res.json(contracts);
  })
);

export default router;
