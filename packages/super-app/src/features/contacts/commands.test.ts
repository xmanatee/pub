import { describe, expect, it } from "vitest";
import {
  createContact,
  deleteContact,
  listContacts,
  parseContactListResult,
  searchContacts,
  updateContact,
} from "./commands";

describe("contacts command result parsers", () => {
  it("uses gog contacts commands with JSON output", () => {
    expect(listContacts.executor).toEqual({
      kind: "exec",
      command: "gog",
      args: ["-j", "contacts", "list", "--max", "{{max}}"],
    });
    expect(searchContacts.executor).toEqual({
      kind: "exec",
      command: "gog",
      args: ["-j", "contacts", "search", "{{query}}", "--max", "{{max}}"],
    });
    expect(createContact.executor?.kind).toBe("exec");
    expect(updateContact.executor).toEqual({
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
    });
    expect(deleteContact.executor).toEqual({
      kind: "exec",
      command: "gog",
      args: ["-y", "contacts", "delete", "{{resource}}"],
    });
  });

  it("parses compact gog contact output", () => {
    expect(
      parseContactListResult({
        contacts: [
          {
            resource: "people/c1",
            name: "Ada Lovelace",
            email: "ada@example.com",
            phone: "+15550101",
            org: "Analytical Engines",
            title: "Programmer",
          },
        ],
        nextPageToken: "next",
      }),
    ).toEqual({
      contacts: [
        {
          id: "people/c1",
          resource: "people/c1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+15550101",
          organization: "Analytical Engines",
          title: "Programmer",
          note: null,
        },
      ],
      nextPageToken: "next",
    });
  });

  it("parses People API shaped contacts", () => {
    expect(
      parseContactListResult({
        contacts: [
          {
            resourceName: "people/c2",
            names: [{ displayName: "Grace Hopper" }],
            emailAddresses: [{ value: "grace@example.com" }],
            phoneNumbers: [{ value: "+15550202" }],
            organizations: [{ name: "Navy", title: "Rear admiral" }],
            biographies: [{ value: "COBOL" }],
          },
        ],
      }).contacts[0],
    ).toEqual({
      id: "people/c2",
      resource: "people/c2",
      name: "Grace Hopper",
      email: "grace@example.com",
      phone: "+15550202",
      organization: "Navy",
      title: "Rear admiral",
      note: "COBOL",
    });
  });

  it("rejects contacts without a resource name", () => {
    expect(() => parseContactListResult({ contacts: [{ name: "Missing id" }] })).toThrow(
      "contacts.list.contacts[0].resource must be a string",
    );
  });
});
