type NavLink = { label: string; href: string };

export function renderLayout(
  title: string,
  body: string,
  navLinks: NavLink[] = []
): string {
  const nav = navLinks.length
    ? `<nav class="flex flex-wrap items-center gap-5 text-sm font-semibold text-[#5a5861]">
        ${navLinks
          .map(
            (link) =>
              `<a class="hover:text-[#121014] transition-colors" href="${link.href}">${link.label}</a>`
          )
          .join("")}
      </nav>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: "Manrope", "Helvetica", sans-serif;
    }
    .brand-serif {
      font-family: "Cormorant Garamond", "Times New Roman", serif;
    }
    .ribbon {
      background: linear-gradient(120deg, rgba(195, 95, 58, 0.06), rgba(46, 107, 106, 0.07));
    }
    .gridlines {
      background-image:
        linear-gradient(to right, rgba(18, 16, 20, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(18, 16, 20, 0.05) 1px, transparent 1px);
      background-size: 80px 80px;
    }
  </style>
</head>
<body class="bg-[#f7f0e7] text-[#121014]">
  <div class="fixed inset-0 ribbon -z-20"></div>
  <div class="fixed inset-0 gridlines opacity-40 -z-10"></div>
  <header class="px-[6vw] py-7 flex flex-wrap items-center justify-between gap-4">
    <div class="brand-serif text-[1.4rem] font-bold tracking-[1px]">Reports that Matter</div>
    ${nav}
  </header>
  ${body}
</body>
</html>`;
}
