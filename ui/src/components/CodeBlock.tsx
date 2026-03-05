import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

const JSON_EXTENSIONS = [json(), oneDark];

interface Props {
  /** The raw value to display/edit */
  value: string;
  /** Whether to auto-pretty-print JSON. Default true. */
  prettyPrint?: boolean;
  /** Read-only display. Default true. */
  readOnly?: boolean;
  /** Called when content changes (editable mode only) */
  onChange?: (value: string) => void;
  /** Fixed height, e.g. "200px". Takes precedence over maxHeight. */
  height?: string;
  /** Max height before scrolling (read-only auto-height). */
  maxHeight?: string;
  /** Show line numbers. Default false for read-only, true for editable. */
  lineNumbers?: boolean;
}

function tryPretty(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function CodeBlock({
  value,
  prettyPrint = true,
  readOnly = true,
  onChange,
  height,
  maxHeight,
  lineNumbers,
}: Props) {
  const displayValue = prettyPrint ? tryPretty(value) : value;
  const showLineNumbers = lineNumbers ?? !readOnly;

  return (
    <CodeMirror
      value={displayValue}
      extensions={JSON_EXTENSIONS}
      readOnly={readOnly}
      editable={!readOnly}
      onChange={onChange}
      height={height}
      maxHeight={maxHeight}
      basicSetup={{
        lineNumbers: showLineNumbers,
        foldGutter: showLineNumbers,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: true,
        closeBrackets: !readOnly,
      }}
      style={{ fontSize: "13px" }}
    />
  );
}
