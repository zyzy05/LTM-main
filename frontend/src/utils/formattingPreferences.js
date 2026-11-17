export const FORMATTING_KEY = "giay_formatting_preferences";

export const DEFAULT_FORMATTING = {
  fontFamily: "Times New Roman",
  fontSize: "16",
  color: "#202124",
  bold: false,
  italic: false,
  underline: false,
};

export function loadFormattingPreferences() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FORMATTING_KEY) || "{}");
    return {
      ...DEFAULT_FORMATTING,
      ...saved,
      fontFamily: saved.fontFamily === "Arial"
        ? DEFAULT_FORMATTING.fontFamily
        : saved.fontFamily || DEFAULT_FORMATTING.fontFamily,
      fontSize: String(saved.fontSize) === "12" ? "16" : saved.fontSize || DEFAULT_FORMATTING.fontSize,
    };
  } catch {
    return DEFAULT_FORMATTING;
  }
}
