import {
  type JsonRecord,
  readArray,
  readNullableNumber,
  readNullableString,
  readNullableStringLiteral,
  readOptionalNullableNumber,
  readOptionalNullableString,
  readOptionalNullableStringLiteral,
  readOptionalStringLiteral,
  readRecordValue,
  readString,
  readStringLiteral,
  readStringValue,
} from "~/core/json-boundary";
import {
  TASK_CATEGORIES,
  TASK_ESTIMATES,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  type Task,
  type TaskCategory,
  type TaskEstimate,
  type TaskPriority,
  type TaskRecurrence,
  type TaskSubtask,
} from "./commands";

export interface TaskAnalysis {
  priority?: TaskPriority;
  category?: TaskCategory;
  estimatedTime?: TaskEstimate | null;
  subtasks?: string[];
  recurrence?: TaskRecurrence | null;
  dueAt?: number | null;
  note?: string | null;
}

export interface TriageChange {
  id: string;
  priority: TaskPriority;
  reason: string;
}

export interface TriageTasksResult {
  changes: TriageChange[];
}

export interface TaskCommentResponse {
  reply: string;
  patch?: Partial<Task>;
}

function makeSubtask(text: string): TaskSubtask {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
    text,
    done: false,
  };
}

function readOptionalStringArray(
  record: JsonRecord,
  key: string,
  path: string,
): string[] | undefined {
  if (!(key in record)) return undefined;
  return readArray(record, key, path).map((value, index) =>
    readStringValue(value, `${path}.${key}[${index}]`),
  );
}

export function parseTaskAnalysis(value: unknown): TaskAnalysis {
  const path = "ai.analyze-task";
  const record = readRecordValue(value, path);
  return {
    priority: readOptionalStringLiteral(record, "priority", path, TASK_PRIORITIES),
    category: readOptionalStringLiteral(record, "category", path, TASK_CATEGORIES),
    estimatedTime: readOptionalNullableStringLiteral(record, "estimatedTime", path, TASK_ESTIMATES),
    subtasks: readOptionalStringArray(record, "subtasks", path),
    recurrence: readOptionalNullableStringLiteral(record, "recurrence", path, TASK_RECURRENCES),
    dueAt: readOptionalNullableNumber(record, "dueAt", path),
    note: readOptionalNullableString(record, "note", path),
  };
}

function parseTriageChange(value: unknown, path: string): TriageChange {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    priority: readStringLiteral(record, "priority", path, TASK_PRIORITIES),
    reason: readString(record, "reason", path),
  };
}

export function parseTriageTasksResult(value: unknown): TriageTasksResult {
  const path = "ai.triage-tasks";
  const record = readRecordValue(value, path);
  return {
    changes: readArray(record, "changes", path).map((change, index) =>
      parseTriageChange(change, `${path}.changes[${index}]`),
    ),
  };
}

function parseTaskPatch(record: JsonRecord, path: string): Partial<Task> {
  const patch: Partial<Task> = {};
  if ("priority" in record) {
    patch.priority = readStringLiteral(record, "priority", path, TASK_PRIORITIES);
  }
  if ("category" in record) {
    patch.category = readStringLiteral(record, "category", path, TASK_CATEGORIES);
  }
  if ("estimatedTime" in record) {
    patch.estimatedTime = readNullableStringLiteral(record, "estimatedTime", path, TASK_ESTIMATES);
  }
  if ("recurrence" in record) {
    patch.recurrence = readNullableStringLiteral(record, "recurrence", path, TASK_RECURRENCES);
  }
  if ("dueAt" in record) {
    patch.dueAt = readNullableNumber(record, "dueAt", path);
  }
  if ("note" in record) {
    patch.note = readNullableString(record, "note", path);
  }
  if ("subtasks" in record) {
    patch.subtasks = readArray(record, "subtasks", path).map((value, index) =>
      makeSubtask(readStringValue(value, `${path}.subtasks[${index}]`)),
    );
  }
  return patch;
}

export function parseTaskCommentResponse(value: unknown): TaskCommentResponse {
  const path = "ai.process-task-comment";
  const record = readRecordValue(value, path);
  const response: TaskCommentResponse = {
    reply: readString(record, "reply", path),
  };
  if ("patch" in record) {
    response.patch = parseTaskPatch(
      readRecordValue(record.patch, `${path}.patch`),
      `${path}.patch`,
    );
  }
  return response;
}
