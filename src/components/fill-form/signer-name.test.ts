import { describe, expect, it } from "vitest";
import { guessSignerName } from "./signer-name";

describe("guessSignerName", () => {
  it("splits a firstname.lastname address", () => {
    expect(guessSignerName("jonas.petraitis@example.lt")).toEqual({
      name: "Jonas",
      surname: "Petraitis",
    });
  });

  it("normalises capitalisation", () => {
    expect(guessSignerName("JONAS.petRAITIS@example.lt")).toEqual({
      name: "Jonas",
      surname: "Petraitis",
    });
  });

  it("accepts underscore, hyphen and plus separators", () => {
    for (const email of [
      "jonas_petraitis@example.lt",
      "jonas-petraitis@example.lt",
      "jonas+petraitis@example.lt",
    ]) {
      expect(guessSignerName(email)).toEqual({ name: "Jonas", surname: "Petraitis" });
    }
  });

  it("joins the remaining tokens into a compound surname", () => {
    expect(guessSignerName("ona.petraityte.kazlauskiene@example.lt")).toEqual({
      name: "Ona",
      surname: "Petraityte Kazlauskiene",
    });
  });

  it("drops disambiguating digits", () => {
    expect(guessSignerName("jonas.petraitis2@example.lt")).toEqual({
      name: "Jonas",
      surname: "Petraitis",
    });
  });

  it("guesses nothing from a single-token local part", () => {
    // Nothing here says what the surname is, and a made-up one would end up on
    // a legally binding signature.
    expect(guessSignerName("jonas@example.lt")).toEqual({ name: "", surname: "" });
    expect(guessSignerName("info@example.lt")).toEqual({ name: "", surname: "" });
  });

  it("guesses nothing from an empty or malformed address", () => {
    expect(guessSignerName("")).toEqual({ name: "", surname: "" });
    expect(guessSignerName("@example.lt")).toEqual({ name: "", surname: "" });
    expect(guessSignerName("123.456@example.lt")).toEqual({ name: "", surname: "" });
  });
});
