import { useEffect, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";

import {
  FONT_FAMILIES,
  getSelectionFontSize,
  syncListItemFormatting,
} from "./extensions.jsx";

function AlignmentIcon({ alignment }) {
  const lines = {
    left: [[3, 5, 17], [3, 9, 12], [3, 13, 17], [3, 17, 10]],
    center: [[5, 5, 15], [3, 9, 17], [5, 13, 15], [6, 17, 14]],
    right: [[3, 5, 17], [8, 9, 17], [3, 13, 17], [10, 17, 17]],
  }[alignment];

  return (
    <svg aria-hidden="true" focusable="false" height="20" viewBox="0 0 20 22" width="20">
      {lines.map(([start, y, end]) => (
        <line
          key={y}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
          x1={start}
          x2={end}
          y1={y}
          y2={y}
        />
      ))}
    </svg>
  );
}

export default function FormattingToolbar({
  editor,
  canEdit,
  formatting,
  onFormattingChange,
  onUploadImage,
  isUploadingImage,
}) {
  const imageInputRef = useRef(null);
  const fontSizeSelectionRef = useRef(null);
  const fontSizeInitialRef = useRef(null);
  const fontSizeDraftRef = useRef(null);
  const [fontSizeDraft, setFontSizeDraft] = useState(null);
  const activeListType = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return "none";
      if (currentEditor.isActive("bulletList")) return "bullet";
      if (currentEditor.isActive("orderedList")) return "ordered";
      return "none";
    },
  });
  const activeAlignment = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return "left";
      const type = currentEditor.isActive("heading") ? "heading" : "paragraph";
      return currentEditor.getAttributes(type).textAlign || "left";
    },
  });
  const lineSpacing = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return "1.15";
      const type = currentEditor.isActive("heading") ? "heading" : "paragraph";
      return String(currentEditor.getAttributes(type).lineSpacing || "1.15");
    },
  });
  const selectedFontSize = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => (
      getSelectionFontSize(currentEditor, formatting.fontSize)
    ),
  });
  const fontSizeInputValue = fontSizeDraft !== null
    ? fontSizeDraft
    : selectedFontSize === null
      ? formatting.fontSize
      : selectedFontSize;

  useEffect(() => {
    if (!editor) return undefined;
    const mapFontSizeSelection = ({ transaction }) => {
      if (fontSizeSelectionRef.current && transaction.docChanged) {
        fontSizeSelectionRef.current = fontSizeSelectionRef.current.map(transaction.mapping);
      }
    };
    editor.on("transaction", mapFontSizeSelection);
    return () => editor.off("transaction", mapFontSizeSelection);
  }, [editor]);

  if (!editor) return null;

  const updateListItemFormatting = (attributes) => {
    if (editor.isActive("listItem")) {
      editor.chain().focus().updateAttributes("listItem", attributes).run();
    }
  };
  const format = (updates, action) => {
    if (!canEdit) return;
    onFormattingChange((current) => ({ ...current, ...updates }));
    action().run();
    if (updates.fontFamily) updateListItemFormatting({ fontFamily: updates.fontFamily });
  };
  const toggleList = (type) => {
    if (!canEdit) return;
    const wasActive = editor.isActive(type);
    const textStyle = editor.getAttributes("textStyle");
    const requestedSize = Number(formatting.fontSize);
    const chain = editor.chain().focus();
    if (type === "orderedList") chain.toggleOrderedList();
    else chain.toggleBulletList();
    if (!wasActive) {
      chain.updateAttributes("listItem", {
        fontFamily: textStyle.fontFamily || formatting.fontFamily,
        fontSize: textStyle.fontSize || `${Number.isFinite(requestedSize) ? requestedSize : 16}pt`,
      });
    }
    chain.run();
  };
  const toggleMark = (mark) => {
    const enabled = !formatting[mark];
    if (!canEdit) return;
    onFormattingChange((current) => ({ ...current, [mark]: enabled }));
    const chain = editor.chain().focus();
    if (enabled) chain.setMark(mark);
    else chain.unsetMark(mark);
    chain.run();
  };
  const changeLineSpacing = (value) => {
    if (!canEdit) return;
    const type = editor.isActive("heading") ? "heading" : "paragraph";
    editor.chain().focus().updateAttributes(type, { lineSpacing: value }).run();
  };

  return (
    <div className="format-toolbar" aria-label="Thanh công cụ định dạng">
      <label className="format-control">
        <span className="visually-hidden">Font chữ</span>
        <select
          aria-label="Font chữ"
          disabled={!canEdit}
          onChange={(event) => format(
            { fontFamily: event.target.value },
            () => editor.chain().focus().setFontFamily(event.target.value),
          )}
          value={formatting.fontFamily}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </label>
      <label className="format-control font-size-control">
        <span className="visually-hidden">Cỡ chữ</span>
        <input
          aria-label="Cỡ chữ"
          disabled={!canEdit}
          max="96"
          min="8"
          onFocus={() => {
            const selection = editor.state.selection;
            fontSizeSelectionRef.current = selection.getBookmark();
            fontSizeInitialRef.current = fontSizeInputValue;
            fontSizeDraftRef.current = fontSizeInputValue;
            setFontSizeDraft(fontSizeInputValue);
          }}
          onChange={(event) => {
            const nextSize = event.target.value;
            fontSizeDraftRef.current = nextSize;
            setFontSizeDraft(nextSize);
            onFormattingChange((current) => ({ ...current, fontSize: nextSize }));
          }}
          onBlur={() => {
            const nextSize = fontSizeDraftRef.current;
            const changed = nextSize !== fontSizeInitialRef.current;
            const size = Number(nextSize);
            if (canEdit && changed && Number.isFinite(size) && size >= 8 && size <= 96) {
              const selection = fontSizeSelectionRef.current?.resolve(editor.state.doc);
              const chain = editor.chain().focus();
              if (selection) {
                chain.setTextSelection({ from: selection.from, to: selection.to });
              }
              chain.setMark("textStyle", { fontSize: `${size}pt` }).run();
              updateListItemFormatting({ fontSize: `${size}pt` });
            } else if (canEdit && changed) {
              onFormattingChange((current) => ({ ...current, fontSize: "16" }));
            }
            fontSizeSelectionRef.current = null;
            fontSizeInitialRef.current = null;
            fontSizeDraftRef.current = null;
            setFontSizeDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          type="number"
          value={fontSizeInputValue}
        />
      </label>
      <span className="toolbar-separator" />
      <button
        aria-label="Chèn ảnh"
        disabled={!canEdit || isUploadingImage}
        onClick={() => imageInputRef.current?.click()}
        type="button"
      >
        {isUploadingImage ? "…" : "Ảnh"}
      </button>
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="Chọn ảnh"
        hidden
        onChange={(event) => {
          const [file] = event.target.files || [];
          if (file) onUploadImage(file);
          event.target.value = "";
        }}
        ref={imageInputRef}
        type="file"
      />
      <span className="toolbar-separator" />
      <button aria-label="In đậm" className={formatting.bold ? "selected" : ""} disabled={!canEdit} onClick={() => toggleMark("bold")} type="button"><strong>B</strong></button>
      <button aria-label="In nghiêng" className={formatting.italic ? "selected" : ""} disabled={!canEdit} onClick={() => toggleMark("italic")} type="button"><em>I</em></button>
      <button aria-label="Gạch chân" className={formatting.underline ? "selected" : ""} disabled={!canEdit} onClick={() => toggleMark("underline")} type="button"><u>U</u></button>
      <label className="color-control">
        <span className="visually-hidden">Màu chữ</span>
        <input
          aria-label="Màu chữ"
          disabled={!canEdit}
          onChange={(event) => format(
            { color: event.target.value },
            () => editor.chain().focus().setColor(event.target.value),
          )}
          type="color"
          value={formatting.color}
        />
      </label>
      <span className="toolbar-separator" />
      <button aria-label="Căn trái" className={activeAlignment === "left" ? "selected" : ""} disabled={!canEdit} onClick={() => editor.chain().focus().setTextAlign("left").run()} type="button"><AlignmentIcon alignment="left" /></button>
      <button aria-label="Căn giữa" className={activeAlignment === "center" ? "selected" : ""} disabled={!canEdit} onClick={() => editor.chain().focus().setTextAlign("center").run()} type="button"><AlignmentIcon alignment="center" /></button>
      <button aria-label="Căn phải" className={activeAlignment === "right" ? "selected" : ""} disabled={!canEdit} onClick={() => editor.chain().focus().setTextAlign("right").run()} type="button"><AlignmentIcon alignment="right" /></button>
      <button aria-label="Danh sách dấu đầu dòng" className={activeListType === "bullet" ? "selected" : ""} disabled={!canEdit} onClick={() => toggleList("bulletList")} type="button">•</button>
      <button aria-label="Danh sách đánh số" className={activeListType === "ordered" ? "selected" : ""} disabled={!canEdit} onClick={() => toggleList("orderedList")} type="button">1.</button>
      <label className="format-control line-spacing-control">
        <span className="visually-hidden">Giãn dòng</span>
        <select
          aria-label="Giãn dòng"
          disabled={!canEdit}
          onChange={(event) => changeLineSpacing(event.target.value)}
          value={lineSpacing || "1.15"}
        >
          <option value="1">1.0</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2">2.0</option>
        </select>
      </label>
      <span className="toolbar-separator" />
      <button aria-label="Hoàn tác" disabled={!canEdit || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} type="button">↶</button>
      <button aria-label="Làm lại" disabled={!canEdit || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} type="button">↷</button>
    </div>
  );
}
