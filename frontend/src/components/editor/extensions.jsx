import { useEffect, useState } from "react";
import { Extension } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { API_URL } from "../../api/client.js";

const DOCUMENT_FONT_SIZE_SCALE = 14 / 11;
const DOCUMENT_FONT_SIZE_ATTRIBUTE = "data-idoc-font-size";
const PAGE_HEIGHT_PX = 297 * (96 / 25.4);
const PAGE_CONTENT_HEIGHT_PX = (297 - 2 * 25.4) * (96 / 25.4);
const PAGE_GAP_PX = 24;
const pageLayoutKey = new PluginKey("pageLayout");

export const FONT_FAMILIES = ["Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"];

function renderFontSize(value, fontFamily) {
  const scale = !fontFamily || /times new roman/i.test(fontFamily)
    ? DOCUMENT_FONT_SIZE_SCALE
    : 1;
  const numericSize = /^(\d+(?:\.\d+)?)(?:px|pt)$/i.exec(value);
  const points = numericSize
    ? `${(Number(numericSize[1]) * scale).toFixed(2)}pt`
    : value;

  return {
    style: `font-size: ${points}`,
    [DOCUMENT_FONT_SIZE_ATTRIBUTE]: value,
  };
}

export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => (
            element.getAttribute(DOCUMENT_FONT_SIZE_ATTRIBUTE)
            || element.style.fontSize
            || null
          ),
          renderHTML: (attributes) => attributes.fontSize
            ? renderFontSize(attributes.fontSize, attributes.fontFamily)
            : {},
        },
      },
    }];
  },
});

export const ListItemFormatting = Extension.create({
  name: "listItemFormatting",
  addGlobalAttributes() {
    return [{
      types: ["listItem"],
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: (element) => element.style.fontFamily || null,
          renderHTML: (attributes) => attributes.fontFamily
            ? { style: `font-family: ${attributes.fontFamily}` }
            : {},
        },
        fontSize: {
          default: null,
          parseHTML: (element) => (
            element.getAttribute(DOCUMENT_FONT_SIZE_ATTRIBUTE)
            || element.style.fontSize
            || null
          ),
          renderHTML: (attributes) => attributes.fontSize
            ? renderFontSize(attributes.fontSize, attributes.fontFamily)
            : {},
        },
      },
    }];
  },
});

export const LineSpacing = Extension.create({
  name: "lineSpacing",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineSpacing: {
          default: null,
          parseHTML: (element) => element.style.lineHeight || null,
          renderHTML: (attributes) => (attributes.lineSpacing
            ? { style: `line-height: ${attributes.lineSpacing}` }
            : {}),
        },
      },
    }];
  },
});

export const PageLayout = Extension.create({
  name: "pageLayout",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pageLayoutKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorations) {
            const nextDecorations = transaction.getMeta(pageLayoutKey);
            return nextDecorations || decorations.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations: (state) => pageLayoutKey.getState(state),
        },
        view: (view) => {
          let frame = 0;
          let lastSignature = "";

          const updatePageBreaks = () => {
            frame = 0;
            const breaks = [];
            let usedHeight = 0;

            view.state.doc.forEach((node, offset) => {
              const element = view.nodeDOM(offset);
              if (!(element instanceof HTMLElement)) return;

              const style = window.getComputedStyle(element);
              const height = element.getBoundingClientRect().height
                + (Number.parseFloat(style.marginTop) || 0)
                + (Number.parseFloat(style.marginBottom) || 0);
              if (usedHeight > 0 && usedHeight + height > PAGE_CONTENT_HEIGHT_PX) {
                breaks.push({
                  offset,
                  height: Math.max(PAGE_GAP_PX, PAGE_HEIGHT_PX + PAGE_GAP_PX - usedHeight),
                });
                usedHeight = 0;
              }
              usedHeight += height;
            });

            const signature = breaks
              .map(({ offset, height }) => `${offset}:${Math.round(height)}`)
              .join(",");
            if (signature === lastSignature) return;
            lastSignature = signature;

            const decorations = breaks.map(({ offset, height }) => Decoration.widget(
              offset,
              () => {
                const spacer = document.createElement("div");
                spacer.className = "page-break-spacer";
                spacer.contentEditable = "false";
                spacer.setAttribute("aria-hidden", "true");
                spacer.style.height = `${height}px`;
                return spacer;
              },
              { key: `page-break-${offset}`, side: -1 },
            ));
            view.dispatch(view.state.tr.setMeta(
              pageLayoutKey,
              DecorationSet.create(view.state.doc, decorations),
            ));
          };

          const scheduleUpdate = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(updatePageBreaks);
          };
          const resizeObserver = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(scheduleUpdate);

          resizeObserver?.observe(view.dom);
          view.dom.addEventListener("load", scheduleUpdate, true);
          window.addEventListener("resize", scheduleUpdate);
          scheduleUpdate();

          return {
            update(updatedView, previousState) {
              if (updatedView.state.doc !== previousState.doc) scheduleUpdate();
            },
            destroy() {
              window.cancelAnimationFrame(frame);
              resizeObserver?.disconnect();
              view.dom.removeEventListener("load", scheduleUpdate, true);
              window.removeEventListener("resize", scheduleUpdate);
            },
          };
        },
      }),
    ];
  },
});

export function colorForUser(name) {
  let hash = 2166136261;
  for (const character of name || "user") {
    hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
  }
  return `hsl(${hash % 360}, 72%, 42%)`;
}

export function renderCollaborativeCursor(user) {
  const name = user.name || "Người dùng";
  const color = user.color || colorForUser(name);
  const caret = document.createElement("span");
  caret.classList.add("collaboration-cursor__caret");
  caret.style.borderColor = color;
  caret.setAttribute("aria-label", `Con trỏ của ${name}`);

  const label = document.createElement("span");
  label.classList.add("collaboration-cursor__label");
  label.style.backgroundColor = color;
  label.textContent = name;
  caret.append(label);
  return caret;
}

export function initialContentAsHtml(content) {
  const value = content || "";
  if (!value) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return value;
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`)
    .join("");
}

function AuthenticatedImageNodeView({ node, extension, selected, deleteNode }) {
  const [imageUrl, setImageUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const assetId = node.attrs.assetId;
  const token = extension.options.token;

  useEffect(() => {
    let objectUrl = "";
    const controller = new AbortController();
    setImageUrl("");
    setLoadError("");

    fetch(`${API_URL}/api/images/${encodeURIComponent(assetId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.detail || "Không thể tải hình ảnh.");
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, token]);

  return (
    <NodeViewWrapper as="figure" className={`document-image-block ${selected ? "selected" : ""}`}>
      {imageUrl ? (
        <img alt={node.attrs.alt || ""} src={imageUrl} />
      ) : (
        <span className="image-loading" role={loadError ? "alert" : "status"}>
          {loadError || "Đang tải hình ảnh…"}
        </span>
      )}
      {selected && extension.options.canEdit && (
        <button
          aria-label="Xóa ảnh"
          className="remove-image-button"
          contentEditable={false}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteNode();
          }}
          type="button"
        >
          ×
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const DocumentImage = Image.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      token: "",
      canEdit: false,
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => (attributes.assetId
          ? { "data-image-id": attributes.assetId }
          : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AuthenticatedImageNodeView);
  },
});

export function applyStoredTextFormatting(editor, formatting) {
  const requestedSize = Number(formatting.fontSize);
  const fontSize = Number.isFinite(requestedSize) && requestedSize >= 8 && requestedSize <= 96
    ? requestedSize
    : 16;
  const chain = editor.chain()
    .setFontFamily(formatting.fontFamily)
    .setColor(formatting.color)
    .setMark("textStyle", { fontSize: `${fontSize}pt` });

  for (const mark of ["bold", "italic", "underline"]) {
    if (formatting[mark]) chain.setMark(mark);
    else chain.unsetMark(mark);
  }

  chain.run();
}

function parseFontSize(value) {
  const match = /^(\d+(?:\.\d+)?)(?:px|pt)?$/i.exec(String(value || "").trim());
  return match ? String(Number(match[1])) : null;
}

function getEffectiveFontSize(editor, node, position, fallbackSize) {
  const textStyle = node?.marks?.find((mark) => mark.type.name === "textStyle");
  let fontSize = parseFontSize(textStyle?.attrs.fontSize);
  const $position = editor.state.doc.resolve(position);

  for (let depth = $position.depth; depth > 0 && !fontSize; depth -= 1) {
    const ancestor = $position.node(depth);
    if (ancestor.type.name === "listItem") {
      fontSize = parseFontSize(ancestor.attrs.fontSize);
    }
    if (!fontSize && ancestor.type.name === "heading") {
      fontSize = { 1: "20", 2: "16", 3: "14" }[ancestor.attrs.level] || null;
    }
  }

  return fontSize || parseFontSize(fallbackSize) || "16";
}

export function getSelectionFontSize(editor, fallbackSize) {
  if (!editor) return null;
  const { selection } = editor.state;
  if (selection.empty) {
    const activeSize = parseFontSize(editor.getAttributes("textStyle").fontSize);
    return activeSize || getEffectiveFontSize(
      editor,
      null,
      selection.$from.pos,
      fallbackSize,
    );
  }

  let selectedSize = null;
  let hasText = false;
  let hasMixedSizes = false;
  editor.state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isText) return;
    const size = getEffectiveFontSize(editor, node, position, fallbackSize);
    if (!hasText) {
      selectedSize = size;
      hasText = true;
    } else if (selectedSize !== size) {
      hasMixedSizes = true;
    }
  });

  if (!hasText) return null;
  return hasMixedSizes ? "" : selectedSize;
}

export function syncListItemFormatting(editor) {
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "listItem") return;
    let textStyle;
    node.descendants((child) => {
      if (textStyle || !child.isText) return;
      textStyle = child.marks.find((mark) => mark.type.name === "textStyle")?.attrs;
    });
    if (!textStyle) return;

    const attributes = {};
    for (const name of ["fontFamily", "fontSize"]) {
      if (textStyle[name] && node.attrs[name] !== textStyle[name]) {
        attributes[name] = textStyle[name];
      }
    }
    if (Object.keys(attributes).length) {
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, ...attributes });
    }
  });
  if (transaction.docChanged) editor.view.dispatch(transaction);
}
