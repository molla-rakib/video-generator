import { describe, expect, it } from "vitest";
import { splitForSpeech } from "./speech";

describe("splitForSpeech", () => {
  it("keeps short text whole", () => {
    expect(splitForSpeech("আমাদের গল্প।", 100)).toEqual(["আমাদের গল্প।"]);
  });
  it("splits at Bangla sentence ends (দাঁড়ি)", () => {
    const text = "প্রথম বাক্য। দ্বিতীয় বাক্য। তৃতীয় বাক্য।";
    const chunks = splitForSpeech(text, 28);
    expect(chunks).toEqual(["প্রথম বাক্য। দ্বিতীয় বাক্য।", "তৃতীয় বাক্য।"]);
    expect(chunks.every((c) => c.length <= 28)).toBe(true);
  });
  it("breaks very long sentences at spaces", () => {
    const chunks = splitForSpeech("ক খ গ ঘ ঙ চ ছ জ ঝ ঞ", 6);
    expect(chunks.every((c) => c.length <= 6)).toBe(true);
    expect(chunks.join(" ")).toBe("ক খ গ ঘ ঙ চ ছ জ ঝ ঞ");
  });
});
