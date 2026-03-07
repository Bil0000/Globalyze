export default {
  sourceDir: "examples/demo-nextjs/src",
  localesDir: "examples/demo-nextjs/locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"],
  sourceLocale: "en",
  openAiModel: "gpt-4o-mini",
  geminiModel: "gemini-2.5-flash-lite",
  aiBatchSize: 20,
  translationImportPath: "@/i18n",
  translationFunctionName: "t"
};
