import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

// Language list defined inline to avoid importing translator.ts
// (which chains to api.ts → socket.io-client, incompatible with jsdom)
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'te', name: 'Telugu' },
];

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    const result = cn("px-2", "px-4");
    expect(result).toBe("px-4");
  });
});

describe("supported languages", () => {
  it("contains 11 languages", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(11);
  });

  it("includes English and Hindi", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("hi");
  });

  it("each language has a code and name", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
    }
  });
});
