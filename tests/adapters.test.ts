import { describe, expect, it } from "bun:test";

import { resolveI18nAdapter } from "../src/adapters";
import { transformSource } from "../src/transformer/astTransformer";
import { createTestConfig } from "./testUtils";

describe("i18n adapters", () => {
  it("resolves the react-i18next adapter", () => {
    const adapter = resolveI18nAdapter(
      createTestConfig("/tmp/globalyze", {
        i18nAdapter: "react-i18next"
      })
    );

    expect(adapter.name).toBe("react-i18next");
    expect(adapter.hookName).toBe("useTranslation");
    expect(adapter.canInjectHook).toBe(true);
  });

  it("resolves the generic adapter from config", () => {
    const adapter = resolveI18nAdapter(
      createTestConfig("/tmp/globalyze", {
        i18nAdapter: "custom",
        translationImportPath: "~/i18n",
        translationFunctionName: "translate"
      })
    );

    expect(adapter.importPath).toBe("~/i18n");
    expect(adapter.translationFunctionName).toBe("translate");
    expect(adapter.canInjectHook).toBe(false);
  });

  it("injects react-i18next hook usage during transforms", () => {
    const config = createTestConfig("/tmp/globalyze", {
      i18nAdapter: "react-i18next"
    });
    const result = transformSource(
      "/tmp/globalyze/src/Button.tsx",
      'export function Button() { return <button>Checkout</button>; }',
      new Map([["Checkout", "checkout.button"]]),
      config
    );

    expect(result.updated).toBe(true);
    expect(result.code).toContain('import { useTranslation } from "react-i18next"');
    expect(result.code).toContain("useTranslation()");
    expect(result.code).toContain('t("checkout.button")');
  });

  it("uses configured import-based translation calls for the generic adapter", () => {
    const config = createTestConfig("/tmp/globalyze", {
      i18nAdapter: "generic",
      translationImportPath: "~/i18n",
      translationFunctionName: "translate"
    });
    const result = transformSource(
      "/tmp/globalyze/src/Button.tsx",
      'export function Button() { return <button>Checkout</button>; }',
      new Map([["Checkout", "checkout.button"]]),
      config
    );

    expect(result.updated).toBe(true);
    expect(result.code).toContain('import { translate } from "~/i18n"');
    expect(result.code).toContain('translate("checkout.button")');
  });
});
