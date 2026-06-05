/**
 * Single source of truth for the workspace's services. Adding a feature
 * means: (1) ship its `features/<name>/page.tsx`, (2) register a nav entry
 * here. Sidebar, command palette, and cross-feature links all read from this.
 *
 * The feature manifest test asserts every entry has a matching route file
 * and page component, so silent removals fail CI.
 */
import {
  Calendar,
  CheckSquare,
  FileText,
  FolderTree,
  Inbox,
  type LucideIcon,
  Mail,
  MessageCircle,
  Newspaper,
  Settings,
  StickyNote,
  Sunrise,
  UserRound,
} from "lucide-react";

export interface ServiceDef {
  /** Stable identifier (used for cross-feature links). */
  id: string;
  /** Sidebar label. */
  label: string;
  /** TanStack route path; must match `src/routes/<path>.tsx` (without leading `/`). */
  route: string;
  /** Lucide icon. */
  icon: LucideIcon;
  /** Short description shown in command palette / search. */
  description: string;
  /**
   * Cross-feature actions this service can RECEIVE (e.g. mail accepts
   * "compose-from-context"). Used by `core/ai/contextual-actions` to filter
   * which actions are offered for a given source.
   */
  accepts?: ServiceAction[];
}

export type ServiceAction =
  | "draft-email"
  | "create-event"
  | "create-task"
  | "create-note"
  | "draft-telegram";

export const SERVICES: ServiceDef[] = [
  {
    id: "briefing",
    label: "Briefing",
    route: "/",
    icon: Sunrise,
    description: "Morning at-a-glance: weather, calendar, inbox, news, AI",
  },
  {
    id: "mail",
    label: "Mail",
    route: "/mail",
    icon: Mail,
    description: "Gmail inbox: read, archive, draft replies",
    accepts: ["draft-email"],
  },
  {
    id: "contacts",
    label: "Contacts",
    route: "/contacts",
    icon: UserRound,
    description: "Google Contacts: people, channels, and cross-app follow-ups",
  },
  {
    id: "calendar",
    label: "Calendar",
    route: "/calendar",
    icon: Calendar,
    description: "Google Calendar: today, this week, create events",
    accepts: ["create-event"],
  },
  {
    id: "telegram",
    label: "Messages",
    route: "/telegram",
    icon: MessageCircle,
    description: "Telegram client: chats, threads, AI assist",
    accepts: ["draft-telegram"],
  },
  {
    id: "tasks",
    label: "Tasks",
    route: "/tasks",
    icon: CheckSquare,
    description: "AI-native todo with priority, subtasks, recurrence",
    accepts: ["create-task"],
  },
  {
    id: "notes",
    label: "Notes",
    route: "/notes",
    icon: StickyNote,
    description: "Markdown notes",
    accepts: ["create-note"],
  },
  {
    id: "reader",
    label: "Reader",
    route: "/reader",
    icon: Newspaper,
    description: "Distraction-free article reader with AI Q&A",
  },
  {
    id: "files",
    label: "Files",
    route: "/files",
    icon: FolderTree,
    description: "Browse, preview, edit local files",
  },
  {
    id: "tracker",
    label: "Tracker",
    route: "/tracker",
    icon: FileText,
    description: "Timestamped log with AI categorization",
  },
  {
    id: "inbox",
    label: "Inbox",
    route: "/inbox",
    icon: Inbox,
    description: "Unified attention queue across services",
  },
  {
    id: "settings",
    label: "Settings",
    route: "/settings",
    icon: Settings,
    description: "Credentials, theme, integrations",
  },
];

export function findService(id: string): ServiceDef | null {
  return SERVICES.find((s) => s.id === id) ?? null;
}

/**
 * Cross-feature payload. A source feature builds one of these and dispatches
 * via `useTargetNavigation` to ask another feature to act on it.
 */
export interface CrossFeatureContext {
  sourceServiceId: string;
  /** Stable id of the source item (used to link back). */
  sourceItemId?: string;
  /** Free-form excerpt shown in the destination's prefilled UI. */
  excerpt: string;
  /** Optional structured fields the destination may consume. */
  fields?: Record<string, string>;
}
