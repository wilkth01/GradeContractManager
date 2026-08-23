/**
 * Minimal Canvas REST client.
 *
 * Authenticates with an instructor's personal access token. Follows Link-header
 * pagination, which Canvas uses on every list endpoint -- reading only the first
 * page is the classic way to silently lose half a roster.
 */

export class CanvasError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimited = false
  ) {
    super(message);
    this.name = "CanvasError";
  }
}

/**
 * Canvas signals a throttle as 403 with a rate-limit body, not 429, so a
 * throttled request is otherwise indistinguishable from a permissions failure
 * -- and telling an instructor they lack access when they are simply pulling
 * too fast sends them looking in the wrong place entirely.
 */
function isRateLimit(status: number, body: string): boolean {
  if (status === 429) return true;
  return status === 403 && /rate limit/i.test(body);
}

export interface CanvasUser {
  id: number;
  name: string;
  sortable_name: string;
  login_id?: string;
  sis_user_id?: string | null;
  email?: string;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  points_possible: number | null;
  assignment_group_id: number;
  published: boolean;
  omit_from_final_grade?: boolean;
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
}

export interface CanvasSubmission {
  user_id: number;
  assignment_id: number;
  score: number | null;
  grade: string | null;
  workflow_state: string;
  submitted_at: string | null;
  excused?: boolean;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
}

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CanvasClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  private async request(
    path: string,
    attempt = 0
  ): Promise<{ data: unknown; nextUrl: string | null }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, { headers: this.headers() });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      if (isRateLimit(response.status, body)) {
        // A pull across a full roster can trip the throttle partway. Backing off
        // and retrying is better than surfacing a half-finished import.
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          await sleep(RATE_LIMIT_BACKOFF_MS * (attempt + 1));
          return this.request(path, attempt + 1);
        }
        throw new CanvasError(
          "Canvas is rate limiting these requests. Wait a minute and try again.",
          response.status,
          true
        );
      }

      throw new CanvasError(
        response.status === 401
          ? "Canvas rejected the access token"
          : `Canvas returned ${response.status} for ${path}`,
        response.status
      );
    }

    return { data: await response.json(), nextUrl: nextPageUrl(response.headers.get("link")) };
  }

  /** GET a single object. */
  async get<T>(path: string): Promise<T> {
    const { data } = await this.request(path);
    return data as T;
  }

  /** GET a list, following pagination to the end. */
  async list<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | null = path;

    while (next) {
      const { data, nextUrl } = await this.request(next);
      if (Array.isArray(data)) results.push(...(data as T[]));
      next = nextUrl;
    }

    return results;
  }

  /** Confirm the token works, and say who it belongs to. */
  async verify(): Promise<CanvasUser> {
    return this.get<CanvasUser>("/users/self");
  }

  /** Courses where this token's owner is a teacher. */
  async teacherCourses(): Promise<CanvasCourse[]> {
    return this.list<CanvasCourse>("/courses?enrollment_type=teacher&per_page=100");
  }

  async courseStudents(courseId: number): Promise<CanvasUser[]> {
    return this.list<CanvasUser>(
      `/courses/${courseId}/users?enrollment_type[]=student&per_page=100`
    );
  }

  /** Published assignments in a course, with their group. */
  async courseAssignments(courseId: number): Promise<CanvasAssignment[]> {
    const all = await this.list<CanvasAssignment>(
      `/courses/${courseId}/assignments?per_page=100`
    );
    return all.filter((a) => a.published);
  }

  async assignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
    return this.list<CanvasAssignmentGroup>(
      `/courses/${courseId}/assignment_groups?per_page=100`
    );
  }

  /**
   * Submissions for specific assignments across the whole course.
   *
   * Canvas caps the query string, so assignment ids are requested in batches
   * rather than all at once.
   */
  async submissions(courseId: number, assignmentIds: number[]): Promise<CanvasSubmission[]> {
    if (assignmentIds.length === 0) return [];

    const BATCH = 20;
    const results: CanvasSubmission[] = [];

    for (let i = 0; i < assignmentIds.length; i += BATCH) {
      const batch = assignmentIds.slice(i, i + BATCH);
      const query = batch.map((id) => `assignment_ids[]=${id}`).join("&");
      results.push(
        ...(await this.list<CanvasSubmission>(
          `/courses/${courseId}/students/submissions?student_ids[]=all&${query}&per_page=100`
        ))
      );
    }

    return results;
  }

  /**
   * Send a Canvas Inbox message to one recipient.
   *
   * Canvas Conversations rather than email: it reaches students through the
   * notification settings they already have, and needs no mail infrastructure.
   */
  async sendMessage(recipientCanvasId: number, subject: string, body: string): Promise<void> {
    const params = new URLSearchParams();
    params.append("recipients[]", String(recipientCanvasId));
    params.append("subject", subject);
    params.append("body", body);
    params.append("group_conversation", "false");

    const response = await fetch(`${this.baseUrl}/api/v1/conversations`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new CanvasError(
        isRateLimit(response.status, body)
          ? "Canvas is rate limiting these messages. Wait a minute and send the rest."
          : `Canvas refused the message (${response.status})`,
        response.status,
        isRateLimit(response.status, body)
      );
    }
  }
}

/** Pull the rel="next" URL out of a Canvas Link header. */
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    if (!part.includes('rel="next"')) continue;
    const start = part.indexOf("<");
    const end = part.indexOf(">");
    if (start !== -1 && end > start) return part.slice(start + 1, end);
  }
  return null;
}
