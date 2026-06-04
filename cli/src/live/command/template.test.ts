import { describe, expect, it } from "vitest";
import { interpolateTemplate, toCommandReturnValue } from "./template.js";

describe("interpolateTemplate", () => {
  it("interpolates primitive and structured arguments", () => {
    expect(
      interpolateTemplate("name={{ user.name }} count={{count}} meta={{meta}}", {
        user: { name: "Ada" },
        count: 3,
        meta: { active: true },
      }),
    ).toBe('name=Ada count=3 meta={"active":true}');
  });
});

describe("toCommandReturnValue", () => {
  it("parses text, void, and json command output", () => {
    expect(toCommandReturnValue("hello\n", "text")).toBe("hello\n");
    expect(toCommandReturnValue("ignored", "void")).toBeNull();
    expect(toCommandReturnValue('{"ok":true}', "json")).toEqual({ ok: true });
  });

  it("rejects empty json output", () => {
    expect(() => toCommandReturnValue("\n \t", "json")).toThrow("JSON command produced no output");
  });
});
