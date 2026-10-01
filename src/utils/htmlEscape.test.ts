import { describe, it, expect } from "vitest";
import { escapeHtml } from "./htmlEscape";

describe("escapeHtml", () => {
  it("should escape angle brackets", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("should escape ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("should handle empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("should not modify safe strings", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});
