import { readArray, readOptionalNullableString, readRecordValue } from "~/core/json-boundary";
import type { CommandFunctionSpec } from "~/core/types";

export interface Contact {
  id: string;
  resource: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  title: string | null;
  note: string | null;
}

export interface ContactListResult {
  contacts: Contact[];
  nextPageToken: string | null;
}

export const listContacts: CommandFunctionSpec = {
  name: "contacts.list",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["-j", "contacts", "list", "--max", "{{max}}"],
  },
};

export const searchContacts: CommandFunctionSpec = {
  name: "contacts.search",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["-j", "contacts", "search", "{{query}}", "--max", "{{max}}"],
  },
};

export const createContact: CommandFunctionSpec = {
  name: "contacts.create",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: [
      "-j",
      "contacts",
      "create",
      "--given",
      "{{given}}",
      "--family",
      "{{family}}",
      "--email",
      "{{email}}",
      "--phone",
      "{{phone}}",
      "--org",
      "{{organization}}",
      "--title",
      "{{title}}",
      "--note",
      "{{note}}",
    ],
  },
};

export const updateContact: CommandFunctionSpec = {
  name: "contacts.update",
  returns: "json",
  executor: {
    kind: "exec",
    command: "gog",
    args: [
      "-j",
      "contacts",
      "update",
      "{{resource}}",
      "--email",
      "{{email}}",
      "--phone",
      "{{phone}}",
      "--org",
      "{{organization}}",
      "--title",
      "{{title}}",
      "--note",
      "{{note}}",
    ],
  },
};

export const deleteContact: CommandFunctionSpec = {
  name: "contacts.delete",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["-y", "contacts", "delete", "{{resource}}"],
  },
};

function readFirstOptionalString(value: unknown, field: string, path: string): string | null {
  if (value === undefined || value === null) return null;
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (typeof item === "string") return item;
    const record = readRecordValue(item, path);
    const text = readOptionalNullableString(record, field, path);
    if (text) return text;
  }
  return null;
}

function readOptionalText(record: Record<string, unknown>, keys: string[], path: string) {
  for (const key of keys) {
    const text = readOptionalNullableString(record, key, path);
    if (text) return text;
  }
  return null;
}

function parseContact(value: unknown, path: string): Contact {
  const record = readRecordValue(value, path);
  const resource = readOptionalText(record, ["resource", "resourceName"], path);
  if (!resource) throw new Error(`${path}.resource must be a string`);

  const email =
    readOptionalText(record, ["email", "emailAddress"], path) ??
    readFirstOptionalString(record.emailAddresses, "value", `${path}.emailAddresses`);
  const phone =
    readOptionalText(record, ["phone", "phoneNumber"], path) ??
    readFirstOptionalString(record.phoneNumbers, "value", `${path}.phoneNumbers`);
  const organization =
    readOptionalText(record, ["organization", "org"], path) ??
    readFirstOptionalString(record.organizations, "name", `${path}.organizations`);
  const title =
    readOptionalText(record, ["title", "jobTitle"], path) ??
    readFirstOptionalString(record.organizations, "title", `${path}.organizations`);
  const note =
    readOptionalText(record, ["note", "biography"], path) ??
    readFirstOptionalString(record.biographies, "value", `${path}.biographies`);
  const name =
    readOptionalText(record, ["name", "displayName"], path) ??
    readFirstOptionalString(record.names, "displayName", `${path}.names`) ??
    email ??
    phone ??
    "Unnamed contact";

  return { id: resource, resource, name, email, phone, organization, title, note };
}

export function parseContactListResult(value: unknown, path = "contacts.list"): ContactListResult {
  const record = readRecordValue(value, path);
  return {
    contacts: readArray(record, "contacts", path).map((contact, index) =>
      parseContact(contact, `${path}.contacts[${index}]`),
    ),
    nextPageToken: readOptionalNullableString(record, "nextPageToken", path) ?? null,
  };
}
