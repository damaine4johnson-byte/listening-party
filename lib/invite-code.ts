import { randomBytes } from "node:crypto";

// Shared invite-code generator. A 6-character alphanumeric string — easy to
// read out or hand-type. 31 bits of entropy (~1 billion combos) suits rooms
// where the host shares the code privately with a small, known group; rotate
// the code from the host dashboard if it ever leaks. The code itself is never
// stored; callers hash it before persisting.

// Unambiguous alphabet: no 0/O, 1/I/L, and all-uppercase to avoid case errors.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const GROUP_SIZE = 3;

function randomCode(length: number) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

// "ABC-DEF" — one dash between the two halves for readability.
export function generateInviteCode(length = CODE_LENGTH) {
  const raw = randomCode(length);
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) groups.push(raw.slice(i, i + GROUP_SIZE));
  return groups.join("-");
}

// Normalizes whatever the listener typed: trims, drops separators, uppercases,
// and fixes the most common ambiguous-character mistakes.
export function normalizeInviteCode(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-_.]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/L/g, "I"); // L is excluded from the alphabet but typed often
}

export const INVITE_CODE_LENGTH = CODE_LENGTH;
