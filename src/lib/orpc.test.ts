import { describe, expect, it } from "vitest";
import { ORPCError, orpc, orpcErrorMessage } from "./orpc";

describe("orpcErrorMessage", () => {
  it("uses an ORPCError's message", () => {
    expect(
      orpcErrorMessage(new ORPCError("BAD_REQUEST", { message: "Nope" }), "fallback")
    ).toBe("Nope");
  });

  it("uses a plain Error's message", () => {
    expect(orpcErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("falls back for a non-Error value", () => {
    expect(orpcErrorMessage("boom", "fallback")).toBe("fallback");
    expect(orpcErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("falls back for an Error with no message", () => {
    expect(orpcErrorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});

describe("orpc client", () => {
  it("exposes the templates procedures as callable functions", () => {
    expect(typeof orpc.templates.list).toBe("function");
    expect(typeof orpc.templates.generate).toBe("function");
    expect(typeof orpc.templates.generateBulk).toBe("function");
  });
});
