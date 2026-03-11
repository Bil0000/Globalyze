import prettier from "prettier";

const CODE_FILE_PATTERN = /\.(tsx?|jsx?|json)$/i;

export async function formatGeneratedFileContents(
  filePath: string,
  contents: string
): Promise<string> {
  if (!CODE_FILE_PATTERN.test(filePath)) {
    return contents;
  }

  try {
    const resolvedConfig = await prettier.resolveConfig(filePath, {
      editorconfig: true
    });
    const formatted = await prettier.format(contents, {
      ...(resolvedConfig ?? {}),
      filepath: filePath
    });

    return formatted.endsWith("\n") ? formatted : `${formatted}\n`;
  } catch {
    return contents.endsWith("\n") ? contents : `${contents}\n`;
  }
}
