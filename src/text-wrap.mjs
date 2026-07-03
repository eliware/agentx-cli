import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';

export function getTerminalWidth(fallback = 80) {
  const width = process.stdout?.columns;
  return Number.isFinite(width) && width > 0 ? width : fallback;
}

export function wrapText(text, width = getTerminalWidth()) {
  if (!text) return '';
  if (!Number.isFinite(width) || width <= 0) return text;

  return text
    .split('\n')
    .map((line) => wrapLine(line, width))
    .join('\n');
}

function wrapLine(line, width) {
  if (!line) return '';
  if (stringWidth(stripAnsi(line)) <= width) return line;

  const chunks = line.split(/(\s+)/);
  const lines = [];
  let current = '';
  let currentWidth = 0;

  for (const chunk of chunks) {
    if (!chunk) continue;
    const chunkWidth = stringWidth(stripAnsi(chunk));
    const isWhitespace = /^\s+$/.test(chunk);

    if (isWhitespace && !current) continue;

    if (currentWidth + chunkWidth <= width) {
      current += chunk;
      currentWidth += chunkWidth;
      continue;
    }

    if (current) lines.push(current.trimEnd());
    if (isWhitespace) {
      current = '';
      currentWidth = 0;
      continue;
    }

    let remaining = chunk;
    while (stringWidth(stripAnsi(remaining)) > width) {
      const slice = sliceToWidth(remaining, width);
      lines.push(slice);
      remaining = remaining.slice(slice.length);
    }
    current = remaining;
    currentWidth = stringWidth(stripAnsi(current));
  }

  if (current) lines.push(current.trimEnd());
  return lines.join('\n');
}

function sliceToWidth(text, width) {
  let visible = 0;
  let index = 0;
  while (index < text.length && visible < width) {
    const char = text[index];
    index += 1;
    visible += stringWidth(char);
  }
  return text.slice(0, index);
}
