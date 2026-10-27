export function shareImageSections(text: string) {
  const [title = "", ...lines] = text.replace(/\r\n?/g, "\n").trim().split("\n");
  return { title, blocks: lines.join("\n").trim().split(/\n[\t ]*\n/).filter(block => block.trim()) };
}

export function shareImageFilename(order: string, name: string) {
  const clean = (value: string) => value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "_").slice(0, 80);
  return `resumen_${clean(order) || "sin_orden"}_${clean(name) || "evento"}.jpg`;
}

export async function renderShareImage(template: HTMLElement): Promise<Blob> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:520px;pointer-events:none;background:#ffffff;color:#111111;";
  const paper = template.cloneNode(true) as HTMLElement;
  paper.style.width = "520px";
  host.appendChild(paper);
  document.body.appendChild(host);
  let canvas: HTMLCanvasElement | undefined;
  try {
    const [{ default: html2canvas }] = await Promise.all([
      import("html2canvas"),
      document.fonts.load('600 16px "Share Barlow"'),
      document.fonts.load('700 16px "Share Barlow"'),
      document.fonts.load('800 36px "Share Barlow Condensed"'),
      ...Array.from(paper.querySelectorAll("img"), img => img.decode()),
    ]);
    await document.fonts.ready;
    if (paper.scrollHeight > 5000) throw new Error("El resumen es demasiado largo para una sola imagen. Acortá el texto antes de generar.");
    canvas = await html2canvas(paper, { scale: 3, width: 520, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return await new Promise<Blob>((resolve, reject) => canvas!.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen.")), "image/jpeg", .95));
  } finally {
    host.remove();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
