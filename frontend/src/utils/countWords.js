const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export function countWords(text) {
  return text.split(/\s+/u).filter((token) => WORD_CHARACTER.test(token)).length;
}
