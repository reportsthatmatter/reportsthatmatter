import { renderLayout } from "./layout";

export function renderReport(title: string, html: string): string {
  return renderLayout(title, `<h1>${title}</h1>${html}`);
}
