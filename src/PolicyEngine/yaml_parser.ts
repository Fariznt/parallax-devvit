type YamlValue = null | boolean | number | string | YamlValue[] | { [k: string]: YamlValue };

export function parseYamlSubset(input: string): YamlValue {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");

  // Root container (we'll decide map vs list as we go)
  let root: any = {};
  const stack: Array<{ indent: number; container: any; kind: "map" | "list" }> = [
    { indent: -1, container: root, kind: "map" },
  ];

  function stripComment(line: string): string {
    // remove #... but only when not inside single/double quotes
    let out = "";
    let sq = false, dq = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" && !dq) sq = !sq;
      else if (c === `"` && !sq) dq = !dq;
      if (c === "#" && !sq && !dq) break;
      out += c;
    }
    return out;
  }

  function indentOf(line: string): number {
    let i = 0;
    while (i < line.length && line[i] === " ") i++;
    if (i < line.length && line[i] === "\t") throw new Error("Tabs are not supported. Use spaces.");
    return i;
  }

  function parseScalarOrInline(vraw: string): YamlValue {
    const v = vraw.trim();
    if (v === "" || v === "~" || v.toLowerCase() === "null") return null;
    if (v.toLowerCase() === "true") return true;
    if (v.toLowerCase() === "false") return false;

    // inline array: [ ... ]
    if (v.startsWith("[") && v.endsWith("]")) {
      const inner = v.slice(1, -1).trim();
      if (inner === "") return [];
      // split by commas not inside quotes
      const parts: string[] = [];
      let buf = "";
      let sq = false, dq = false;
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (c === "'" && !dq) sq = !sq;
        else if (c === `"` && !sq) dq = !dq;

        if (c === "," && !sq && !dq) {
          parts.push(buf.trim());
          buf = "";
        } else {
          buf += c;
        }
      }
      parts.push(buf.trim());
      return parts.map(p => parseScalarOrInline(p));
    }

    // quoted strings
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith(`"`) && v.endsWith(`"`))) {
      const quote = v[0];
      const body = v.slice(1, -1);
      if (quote === "'") return body.replace(/''/g, "'"); // YAML single-quote escape
      // minimal double-quote unescape
      return body.replace(/\\"/g, `"`).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
    }

    // number?
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);

    // plain string
    return v;
  }

  function ensureKind(parent: any, want: "map" | "list") {
    // If parent is empty object and we want list, convert it in place is hard.
    // We avoid that by creating child containers explicitly where needed.
    if (want === "map" && (parent === null || typeof parent !== "object" || Array.isArray(parent))) {
      throw new Error("Expected a map/object at this indentation.");
    }
    if (want === "list" && !Array.isArray(parent)) {
      throw new Error("Expected a list/array at this indentation.");
    }
  }

  function setMapKV(map: any, key: string, value: any) {
    map[key] = value;
  }

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    let raw = stripComment(lines[lineNo]);
    if (!raw.trim()) continue;

    const indent = indentOf(raw);
    const line = raw.trimEnd();

    // pop stack to current parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parentFrame = stack[stack.length - 1];
    const parent = parentFrame.container;

    // list item
    if (line.trimStart().startsWith("- ")) {
      // Parent must be list; if it's a map, user must have created list under some key already.
      ensureKind(parent, "list");

      const afterDash = line.trimStart().slice(2);
      if (afterDash.trim() === "") {
        // "-": start nested map by default
        const child: any = {};
        parent.push(child);
        stack.push({ indent, container: child, kind: "map" });
        continue;
      }

      // "- key: value" (inline map entry)
      const m = afterDash.match(/^([^:]+):(.*)$/);
      if (m) {
        const key = m[1].trim();
        const rest = m[2].trim();

        const obj: any = {};
        parent.push(obj);

        if (rest === "") {
          // key: (nested block to come OR null if none)
          setMapKV(obj, key, null);
          stack.push({ indent, container: obj, kind: "map" });
          // Also push a frame for the key's container if the next lines are more indented
          // We'll create it lazily when we see the next line.
          // To do that, we mark the key with null now; later, when indentation increases,
          // the normal "key:" handler below will create objects/lists.
        } else {
          setMapKV(obj, key, parseScalarOrInline(rest));
        }

        // keep obj as current map for possible following "name: ..." lines at deeper indent
        stack.push({ indent, container: obj, kind: "map" });
        continue;
      }

      // "- scalar" or "- [..]"
      parent.push(parseScalarOrInline(afterDash));
      continue;
    }

    // map entry "key: value" or "key:"
    const kv = line.trim().match(/^([^:]+):(.*)$/);
    if (!kv) throw new Error(`Invalid line ${lineNo + 1}: ${lines[lineNo]}`);

    ensureKind(parent, "map");
    const key = kv[1].trim();
    const rest = kv[2].trim();

    if (rest === "") {
      // key: (start nested block OR null if none)
      // Lookahead to decide whether it's a list or map, if possible
      let child: any = null;
      // default null; if next meaningful line is more indented, we create container then
      setMapKV(parent, key, null);

      // peek next non-empty line (after comment stripping)
      let j = lineNo + 1;
      while (j < lines.length) {
        const peekRaw = stripComment(lines[j]);
        if (peekRaw.trim()) break;
        j++;
      }
      if (j < lines.length) {
        const nextIndent = indentOf(stripComment(lines[j]));
        if (nextIndent > indent) {
          const nextTrim = stripComment(lines[j]).trimStart();
          child = nextTrim.startsWith("- ") ? [] : {};
          setMapKV(parent, key, child);
          stack.push({ indent, container: child, kind: Array.isArray(child) ? "list" : "map" });
        }
      }
    } else {
      setMapKV(parent, key, parseScalarOrInline(rest));
    }
  }

  return root;
}
