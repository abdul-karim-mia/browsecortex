/**
 * Shared regex-based syntax highlighter for common web languages (JSON, HTML, CSS, JS, TS, SQL, YAML).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Highlights JSON syntax (keys, strings, numbers, booleans, null) using CSS span tags. */
export function highlightJSON(jsonStr: string): string {
  const safeStr = escapeHtml(jsonStr);
  
  return safeStr.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-blue-600 dark:text-blue-400';
      if (match.startsWith('"')) {
        if (/:$/.test(match)) {
          cls = 'text-purple-600 dark:text-purple-400 font-semibold';
        } else {
          cls = 'text-green-600 dark:text-green-400';
        }
      } else if (match === 'true' || match === 'false') {
        cls = 'text-amber-600 dark:text-amber-400';
      } else if (match === 'null') {
        cls = 'text-gray-400 dark:text-gray-500';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/** Highlights HTML, XML, or SVG tags and attribute values. */
export function highlightHtml(str: string): string {
  let safeStr = escapeHtml(str);
  
  // Highlight comments
  safeStr = safeStr.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-gray-400 dark:text-gray-500 italic">$1</span>');
  
  // Highlight tags and attributes
  safeStr = safeStr.replace(/(&lt;\/?[a-zA-Z0-9:-]+)(.*?)(&gt;)/g, (_, p1, p2, p3) => {
    const tagCls = 'text-blue-600 dark:text-blue-400 font-semibold';
    const attrCls = 'text-purple-600 dark:text-purple-400';
    const valCls = 'text-green-600 dark:text-green-400';
    
    const attrsHighlighted = p2.replace(/([a-zA-Z0-9:-]+)\s*=\s*("[^"]*"|'[^']*')/g, `<span class="${attrCls}">$1</span>=<span class="${valCls}">$2</span>`);
    
    return `<span class="${tagCls}">${p1}</span>${attrsHighlighted}<span class="${tagCls}">${p3}</span>`;
  });
  
  return safeStr;
}

/** Highlights CSS selectors, properties, and values. */
export function highlightCss(str: string): string {
  let safeStr = escapeHtml(str);
  
  // Highlight comments
  safeStr = safeStr.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-400 dark:text-gray-500 italic">$1</span>');
  
  // Highlight properties and values
  safeStr = safeStr.replace(/([a-zA-Z-]+)\s*:\s*([^;{}]+)(;|\b)/g, (_, prop, val, end) => {
    return `<span class="text-purple-600 dark:text-purple-400">${prop}</span>: <span class="text-blue-600 dark:text-blue-400">${val}</span>${end}`;
  });
  
  // Highlight selectors
  safeStr = safeStr.replace(/([^{}\s][^{}]+)\s*\{/g, '<span class="text-blue-600 dark:text-blue-400 font-semibold">$1</span> {');
  
  return safeStr;
}

/** Highlights JS, TS, JSX, TSX scripts. Mutually excludes strings and comments to prevent overlapping matches. */
export function highlightJs(str: string): string {
  let safeStr = escapeHtml(str);

  const tokens: string[] = [];
  safeStr = safeStr.replace(/(\/\/.*|\/\*[\s\S]*?\*\/|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)/g, (match) => {
    const idx = tokens.length;
    if (match.startsWith('//') || match.startsWith('/*')) {
      tokens.push(`<span class="text-gray-400 dark:text-gray-500 italic">${match}</span>`);
    } else {
      tokens.push(`<span class="text-green-600 dark:text-green-400">${match}</span>`);
    }
    return `@@TOKEN${idx}@@`;
  });

  // Numbers
  safeStr = safeStr.replace(/\b(\d+)\b/g, (match) => {
    const idx = tokens.length;
    tokens.push(`<span class="text-amber-600 dark:text-amber-400">${match}</span>`);
    return `@@TOKEN${idx}@@`;
  });

  // Keywords
  const keywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|export|import|from|default|as|try|catch|finally|throw|new|typeof|instanceof|this|super|async|await|yield|null|undefined|true|false|interface|type|extends|implements|public|private|protected|readonly|any|string|number|boolean|void|unknown|never)\b/g;
  safeStr = safeStr.replace(keywords, '<span class="text-purple-600 dark:text-purple-400 font-semibold">$1</span>');

  // Functions
  safeStr = safeStr.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>');

  // Restore tokens
  safeStr = safeStr.replace(/@@TOKEN(\d+)@@/g, (_, idx) => tokens[Number(idx)]);

  return safeStr;
}

/** Highlights SQL statement queries. */
export function highlightSql(str: string): string {
  let safeStr = escapeHtml(str);

  const tokens: string[] = [];
  safeStr = safeStr.replace(/(--.*|\/\*[\s\S]*?\*\/|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g, (match) => {
    const idx = tokens.length;
    if (match.startsWith('--') || match.startsWith('/*')) {
      tokens.push(`<span class="text-gray-400 dark:text-gray-500 italic">${match}</span>`);
    } else {
      tokens.push(`<span class="text-green-600 dark:text-green-400">${match}</span>`);
    }
    return `@@TOKEN${idx}@@`;
  });

  const keywords = /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|NOT|IN|LIKE|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|EXISTS|ANY|SOME|CASE|WHEN|THEN|ELSE|END|INTO|VALUES|SET|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|CONSTRAINT|VARCHAR|INT|INTEGER|BIGINT|TEXT|BOOLEAN|DATE|TIMESTAMP|FLOAT|DOUBLE)\b/gi;
  safeStr = safeStr.replace(keywords, '<span class="text-purple-600 dark:text-purple-400 font-semibold">$1</span>');

  safeStr = safeStr.replace(/@@TOKEN(\d+)@@/g, (_, idx) => tokens[Number(idx)]);

  return safeStr;
}

/** Highlights YAML keys and value scalars. */
export function highlightYaml(str: string): string {
  let safeStr = escapeHtml(str);

  const tokens: string[] = [];
  safeStr = safeStr.replace(/(#.*|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g, (match) => {
    const idx = tokens.length;
    if (match.startsWith('#')) {
      tokens.push(`<span class="text-gray-400 dark:text-gray-500 italic">${match}</span>`);
    } else {
      tokens.push(`<span class="text-green-600 dark:text-green-400">${match}</span>`);
    }
    return `@@TOKEN${idx}@@`;
  });

  safeStr = safeStr.replace(/^(\s*[^#:\s]+)(:)/gm, '$1<span class="text-purple-600 dark:text-purple-400 font-semibold">$2</span>');

  safeStr = safeStr.replace(/:\s*\b(true|false|null|\d+(?:\.\d*)?)\b\s*$/gm, (_, val) => {
    let cls = 'text-blue-600 dark:text-blue-400';
    if (val === 'true' || val === 'false') {
      cls = 'text-amber-600 dark:text-amber-400';
    } else if (val === 'null') {
      cls = 'text-gray-400 dark:text-gray-500';
    }
    return `: <span class="${cls}">${val}</span>`;
  });

  safeStr = safeStr.replace(/@@TOKEN(\d+)@@/g, (_, idx) => tokens[Number(idx)]);

  return safeStr;
}

/** Combines all handlers to highlight HTML, CSS, JS, TS, SQL, and YAML files. */
export function highlightCode(code: string, name: string, mimeType: string): string {
  const nameLower = name.toLowerCase();
  const mimeLower = mimeType.toLowerCase();

  if (mimeLower === 'text/html' || /\.(html?|xml|svg)$/i.test(nameLower)) {
    return highlightHtml(code);
  }
  if (mimeLower === 'text/css' || nameLower.endsWith('.css')) {
    return highlightCss(code);
  }
  if (mimeLower === 'application/sql' || nameLower.endsWith('.sql')) {
    return highlightSql(code);
  }
  if (mimeLower === 'text/yaml' || mimeLower === 'application/yaml' || /\.(ya?ml)$/i.test(nameLower)) {
    return highlightYaml(code);
  }
  if (
    mimeLower === 'application/javascript' ||
    mimeLower === 'application/x-typescript' ||
    /\.(jsx?|tsx?|mjs|cjs)$/i.test(nameLower)
  ) {
    return highlightJs(code);
  }

  return escapeHtml(code);
}
