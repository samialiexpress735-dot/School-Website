import { PAGE_MM } from "../../lib/reportTemplate.js";

// One printed page of the school's form: the blank form as background, the values placed on top.
// Every position is a percentage of the page, so the same layout fits the screen and the A4 sheet.
//   items:  from buildPrintItems (the real values)
//   guides: (designer only) outlines of rows, columns and fields instead of values
export default function FormSheet({ url, offsetMm, items = [], children, className = "" }) {
  const off = offsetMm ?? { x: 0, y: 0 };
  return (
    <div className={`form-sheet ${className}`} style={{ aspectRatio: `${PAGE_MM.w} / ${PAGE_MM.h}` }}>
      <div className="form-inner" style={{ transform: `translate(${(off.x / PAGE_MM.w) * 100}%, ${(off.y / PAGE_MM.h) * 100}%)` }}>
        {url && <img className="form-bg" src={url} alt="" draggable="false" />}
        {items.map((it) => (
          <span
            key={it.id}
            className="form-val"
            style={{ "--s": it.size, left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, height: `${it.h}%`, textAlign: it.align, justifyContent: it.align === "center" ? "center" : it.align === "end" ? "flex-end" : "flex-start" }}
          >
            {it.text}
          </span>
        ))}
        {children}
      </div>
    </div>
  );
}
