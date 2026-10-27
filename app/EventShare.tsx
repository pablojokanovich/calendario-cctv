"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, ImagePlus, RotateCcw } from "lucide-react";
import { eventCrewText, type EventDraft } from "../lib/agenda";
import { renderShareImage, shareImageFilename, shareImageSections } from "../lib/share-image";

type GeneratedImage = { url: string; text: string; order: string; filename: string };

export function EventShare({ event }: { event: EventDraft }) {
  const original = eventCrewText(event);
  const [edited, setEdited] = useState<{ source: string; text: string } | null>(null);
  const text = edited?.text ?? original;
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [imageError, setImageError] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const template = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const imageUrl = useRef("");
  const currentImage = image?.text === text && image.order === event.orderNumber;
  const sections = shareImageSections(text);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    };
  }, []);

  async function copy() {
    setFailed(false);
    setCopied("");
    try {
      await navigator.clipboard.writeText(text);
      if (mounted.current) setCopied(text);
    } catch {
      if (!mounted.current) return;
      preview.current?.focus();
      preview.current?.select();
      setFailed(true);
    }
  }

  async function generate() {
    if (busy.current || !template.current || !text.trim()) return;
    busy.current = true;
    setGenerating(true);
    setImageError("");
    try {
      const blob = await renderShareImage(template.current);
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = url;
      setImage({ url, text, order: event.orderNumber, filename: shareImageFilename(event.orderNumber, event.eventName) });
    } catch (error) {
      if (mounted.current) setImageError(error instanceof Error ? error.message : "No se pudo generar la imagen. Intentá nuevamente.");
    } finally {
      busy.current = false;
      if (mounted.current) setGenerating(false);
    }
  }

  function reset() {
    setEdited(null);
    setCopied("");
    setFailed(false);
    setImageError("");
  }

  return <details className="event-share">
    <summary>Resumen para compartir</summary>
    <textarea ref={preview} aria-label="Resumen de salas y operadores" value={text} rows={12} disabled={generating}
      onChange={e => { setEdited({ source: edited?.source ?? original, text: e.target.value }); setCopied(""); setFailed(false); setImageError(""); }} />
    <div className="event-share-actions">
      <button type="button" disabled={generating || !text.trim()} onClick={copy}><Copy size={16} />Copiar resumen</button>
      <button type="button" disabled={generating || !text.trim()} onClick={generate}><ImagePlus size={16} />{generating ? "Generando imagen..." : "Generar imagen"}</button>
      <button type="button" className="icon-button" title="Restablecer resumen del evento" aria-label="Restablecer resumen del evento" disabled={generating || !edited} onClick={reset}><RotateCcw size={16} /></button>
      <span role="status">{copied === text && text ? "Resumen copiado" : failed ? "No se pudo copiar. Podés copiar el texto seleccionado manualmente." : ""}</span>
    </div>
    {edited && edited.source !== original && <p className="document-note" role="status">El evento cambió. Tu texto editado se conserva.</p>}
    {imageError && <p className="document-error share-image-error" role="alert">{imageError}</p>}
    {image && <div className="share-image-result">
      <img src={image.url} alt="Vista previa del resumen para compartir" />
      {currentImage ? <a className="share-image-download" href={image.url} download={image.filename}><Download size={16} />Descargar JPG</a> : <p className="document-note" role="status">La imagen no incluye los últimos cambios. Generala nuevamente.</p>}
    </div>}
    <div className="share-capture" aria-hidden="true"><div className="share-image-paper" ref={template}>
      <div className="share-image-header"><img src="/congress-rental-logo.jpg" alt="Congress Rental" width={52} height={52} />
        {event.orderNumber.trim() && <div className="share-image-order"><span>N° de orden</span><strong>{event.orderNumber}</strong></div>}
      </div>
      <h2 className="share-image-title">{sections.title}</h2>
      <div className="share-image-blocks">{sections.blocks.map((block, index) => <div className="share-image-block" key={index}>{block}</div>)}</div>
      <div className="share-image-footer">Congress Rental</div>
    </div></div>
  </details>;
}
