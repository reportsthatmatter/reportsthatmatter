export function renderLayout(title: string, body: string): string {
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n</head>\n<body>${body}</body>\n</html>`;
}
