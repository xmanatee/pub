import { invoke } from "~/core/pub";
import * as cmd from "./commands";

export interface ContactInput {
  given: string;
  family?: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  note?: string;
}

export interface ContactUpdateInput {
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  note?: string;
}

export const contactsApi = {
  list: (max = 100): Promise<cmd.ContactListResult> =>
    invoke(cmd.listContacts, { max: String(max) }).then((value) =>
      cmd.parseContactListResult(value, "contacts.list"),
    ),
  search: (query: string, max = 50): Promise<cmd.ContactListResult> =>
    invoke(cmd.searchContacts, { query, max: String(max) }).then((value) =>
      cmd.parseContactListResult(value, "contacts.search"),
    ),
  create: (input: ContactInput): Promise<void> =>
    invoke(cmd.createContact, {
      given: input.given,
      family: input.family ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      organization: input.organization ?? "",
      title: input.title ?? "",
      note: input.note ?? "",
    }).then(() => undefined),
  update: (resource: string, input: ContactUpdateInput): Promise<void> =>
    invoke(cmd.updateContact, {
      resource,
      email: input.email ?? "",
      phone: input.phone ?? "",
      organization: input.organization ?? "",
      title: input.title ?? "",
      note: input.note ?? "",
    }).then(() => undefined),
  delete: (resource: string): Promise<void> => invoke(cmd.deleteContact, { resource }),
};
