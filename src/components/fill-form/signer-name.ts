/**
 * Guesses a signer's first/last name from their email address, so the common
 * `firstname.lastname@company.lt` case only asks the user for an email.
 *
 * Returns empty strings when the local part can't be split confidently (a
 * single token like `jonas@` or `info@` says nothing about a surname) — the
 * form then requires the names to be typed, rather than putting a made-up one
 * on a legally binding signature.
 */
export function guessSignerName(email: string): { name: string; surname: string } {
  const local = email.split("@")[0] ?? "";
  const tokens = local
    .split(/[._+-]+/)
    // Trailing digits are near-always disambiguators (`jonas.petraitis2`),
    // not part of the name.
    .map((token) => token.replace(/\d+/g, ""))
    .filter(Boolean);

  if (tokens.length < 2) return { name: "", surname: "" };
  return {
    name: capitalize(tokens[0]),
    surname: tokens.slice(1).map(capitalize).join(" "),
  };
}

function capitalize(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}
