import {
  BriefcaseBusiness,
  CalendarPlus,
  CheckSquare,
  Edit2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import * as React from "react";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useTryToast } from "~/core/hooks/use-toast";
import type { ServiceAction } from "~/core/navigation/registry";
import { useDispatchTarget } from "~/core/navigation/use-target-navigation";
import { useAsync } from "~/core/pub";
import { ListDetail, type ListDetailItemsState } from "~/core/shell/list-detail";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/core/ui/dialog";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Textarea } from "~/core/ui/textarea";
import { type ContactInput, type ContactUpdateInput, contactsApi } from "./client";
import type { Contact } from "./commands";

export function ContactsPage() {
  const confirm = useConfirm();
  const tryToast = useTryToast();
  const [query, setQuery] = React.useState("");
  const [selectedResource, setSelectedResource] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const trimmedQuery = query.trim();
  const { state, reload } = useAsync(
    () =>
      trimmedQuery
        ? contactsApi.search(trimmedQuery, 50).then((r) => r.contacts)
        : contactsApi.list(100).then((r) => r.contacts),
    [trimmedQuery],
  );

  React.useEffect(() => {
    if (state.status !== "loaded") return;
    if (state.value.length === 0) {
      setSelectedResource(null);
      return;
    }
    setSelectedResource((current) =>
      current && state.value.some((contact) => contact.resource === current)
        ? current
        : state.value[0].resource,
    );
  }, [state]);

  const itemsState: ListDetailItemsState<Contact> = React.useMemo(() => {
    if (state.status === "loading") return { status: "loading" };
    if (state.status === "error") return { status: "error", error: state.error };
    return { status: "loaded", items: state.value };
  }, [state]);

  const create = async (input: ContactInput) => {
    const ok = await tryToast(() => contactsApi.create(input), { successTitle: "Contact saved" });
    if (!ok) return;
    setCreating(false);
    setQuery("");
    reload();
  };

  const update = async (contact: Contact, input: ContactUpdateInput) => {
    const ok = await tryToast(() => contactsApi.update(contact.resource, input), {
      successTitle: "Contact updated",
    });
    if (!ok) return;
    setEditing(null);
    reload();
  };

  const remove = async (contact: Contact) => {
    const ok = await confirm({
      title: "Delete this contact?",
      description: contact.name,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const deleted = await tryToast(() => contactsApi.delete(contact.resource), {
      successTitle: "Contact deleted",
    });
    if (!deleted) return;
    setSelectedResource(null);
    reload();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contacts"
        description={
          state.status === "loaded"
            ? `${state.value.length} people${trimmedQuery ? ` · ${trimmedQuery}` : ""}`
            : "Google Contacts"
        }
        onRefresh={reload}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> New contact
          </Button>
        }
      />
      <div className="min-h-0 flex-1">
        <ListDetail
          state={itemsState}
          selectedId={selectedResource}
          onSelect={setSelectedResource}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search people..."
          filter={(contact, localQuery) => contactMatches(contact, localQuery)}
          onRetry={reload}
          emptyTitle={trimmedQuery ? "No matching contacts" : "No contacts"}
          emptyDescription={
            trimmedQuery
              ? "Try a different name, email, or phone number."
              : "Create a contact to connect mail, messages, calendar, tasks, and notes."
          }
          emptyAction={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> New contact
            </Button>
          }
          renderRow={(contact, active) => <ContactRow contact={contact} active={active} />}
          renderDetail={(contact) => (
            <ContactDetail
              contact={contact}
              onEdit={() => setEditing(contact)}
              onDelete={() => remove(contact)}
            />
          )}
        />
      </div>
      <CreateContactDialog open={creating} onClose={() => setCreating(false)} onCreate={create} />
      <EditContactDialog
        contact={editing}
        onClose={() => setEditing(null)}
        onSave={(contact, input) => update(contact, input)}
      />
    </div>
  );
}

function contactMatches(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [contact.name, contact.email, contact.phone, contact.organization, contact.title]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(q));
}

function ContactRow({ contact, active }: { contact: Contact; active: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${active ? "text-accent-foreground" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{contact.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {contact.email ?? contact.phone ?? contact.organization ?? "No channel saved"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactDetail({
  contact,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dispatch = useDispatchTarget();
  const summary = contactSummary(contact);

  const route = (action: ServiceAction) => {
    const title = `Follow up with ${contact.name}`;
    dispatch(action, {
      sourceServiceId: "contacts",
      sourceItemId: contact.resource,
      excerpt: action === "create-task" ? title : summary,
      fields: {
        title,
        to: contact.email ?? "",
        attendees: contact.email ?? "",
        subject: contact.name,
      },
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-6">
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserRound className="size-7" />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold leading-tight">{contact.name}</h2>
              {contact.title || contact.organization ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[contact.title, contact.organization].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contact.email ? <Badge variant="default">Email</Badge> : null}
            {contact.phone ? <Badge variant="muted">Phone</Badge> : null}
            {contact.organization ? <Badge variant="outline">Organization</Badge> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit2 className="size-3.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton
            action="draft-email"
            disabled={!contact.email}
            onClick={() => route("draft-email")}
          />
          <ActionButton action="create-event" onClick={() => route("create-event")} />
          <ActionButton action="draft-telegram" onClick={() => route("draft-telegram")} />
          <ActionButton action="create-task" onClick={() => route("create-task")} />
          <ActionButton action="create-note" onClick={() => route("create-note")} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoLine icon={<Mail className="size-4" />} label="Email" value={contact.email} />
          <InfoLine icon={<Phone className="size-4" />} label="Phone" value={contact.phone} />
          <InfoLine
            icon={<BriefcaseBusiness className="size-4" />}
            label="Organization"
            value={contact.organization}
          />
          <InfoLine
            icon={<BriefcaseBusiness className="size-4" />}
            label="Title"
            value={contact.title}
          />
        </div>

        {contact.note ? (
          <div className="rounded-md border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Note</div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {contact.note}
            </p>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function EditContactDialog({
  contact,
  onClose,
  onSave,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSave: (contact: Contact, input: ContactUpdateInput) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<ContactUpdateInput>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!contact) return;
    setDraft({
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      organization: contact.organization ?? "",
      title: contact.title ?? "",
      note: contact.note ?? "",
    });
  }, [contact]);

  const submit = async () => {
    if (!contact) return;
    setBusy(true);
    try {
      await onSave(contact, draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={contact !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            type="email"
            inputMode="email"
            placeholder="Email"
            value={draft.email ?? ""}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Phone"
            value={draft.phone ?? ""}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Organization"
              value={draft.organization ?? ""}
              onChange={(event) => setDraft({ ...draft, organization: event.target.value })}
            />
            <Input
              placeholder="Title"
              value={draft.title ?? ""}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <Textarea
            rows={4}
            placeholder="Note"
            value={draft.note ?? ""}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({
  action,
  onClick,
  disabled,
}: {
  action: ServiceAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta: Record<ServiceAction, { label: string; icon: React.ReactNode }> = {
    "draft-email": { label: "Email", icon: <Mail className="size-3.5" /> },
    "create-event": { label: "Schedule", icon: <CalendarPlus className="size-3.5" /> },
    "draft-telegram": { label: "Message", icon: <MessageSquare className="size-3.5" /> },
    "create-task": { label: "Task", icon: <CheckSquare className="size-3.5" /> },
    "create-note": { label: "Note", icon: <StickyNote className="size-3.5" /> },
  };
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      {meta[action].icon}
      {meta[action].label}
    </Button>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 break-words text-sm">{value ?? "Not saved"}</div>
    </div>
  );
}

function contactSummary(contact: Contact): string {
  return [
    `Name: ${contact.name}`,
    contact.email ? `Email: ${contact.email}` : null,
    contact.phone ? `Phone: ${contact.phone}` : null,
    contact.organization ? `Organization: ${contact.organization}` : null,
    contact.title ? `Title: ${contact.title}` : null,
    contact.note ? `Note: ${contact.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function CreateContactDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: ContactInput) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<ContactInput>({ given: "" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setDraft({ given: "" });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await onCreate(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Given name"
              value={draft.given}
              onChange={(event) => setDraft({ ...draft, given: event.target.value })}
              autoFocus
            />
            <Input
              placeholder="Family name"
              value={draft.family ?? ""}
              onChange={(event) => setDraft({ ...draft, family: event.target.value })}
            />
          </div>
          <Input
            type="email"
            inputMode="email"
            placeholder="Email"
            value={draft.email ?? ""}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Phone"
            value={draft.phone ?? ""}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Organization"
              value={draft.organization ?? ""}
              onChange={(event) => setDraft({ ...draft, organization: event.target.value })}
            />
            <Input
              placeholder="Title"
              value={draft.title ?? ""}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <Textarea
            rows={4}
            placeholder="Note"
            value={draft.note ?? ""}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !draft.given.trim()}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
