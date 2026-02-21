import type { SupportLanguage } from "prettier";

const language: SupportLanguage = {
  name: "AsciiDoc",
  parsers: ["asciidoc"],
  extensions: [".adoc", ".asciidoc", ".asc"],
  vscodeLanguageIds: ["asciidoc"],
};

export default language;
