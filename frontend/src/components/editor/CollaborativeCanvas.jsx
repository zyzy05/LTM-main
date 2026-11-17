import { useEffect, useMemo, useRef, useState } from "react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { API_URL } from "../../api/client.js";
import { countWords } from "../../utils/countWords.js";
import FormattingToolbar from "./FormattingToolbar.jsx";
import {
  applyStoredTextFormatting,
  colorForUser,
  DocumentImage,
  FontSize,
  initialContentAsHtml,
  LineSpacing,
  ListItemFormatting,
  PageLayout,
  renderCollaborativeCursor,
  syncListItemFormatting,
} from "./extensions.jsx";

function WordCount({ editor }) {
  const count = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => (
      currentEditor
        ? countWords(currentEditor.getText({ blockSeparator: "\n" }))
        : 0
    ),
  });

  return <div className="word-count">{count || 0} từ</div>;
}

export default function CollaborativeCanvas({
  yDoc,
  awareness,
  document,
  token,
  username,
  canEdit,
  formatting,
  onFormattingChange,
  onSaveState,
}) {
  const provider = useMemo(() => ({ awareness }), [awareness]);
  const user = useMemo(
    () => ({ name: username, color: colorForUser(username) }),
    [username],
  );
  const imageExtension = useMemo(
    () => DocumentImage.configure({
      token,
      canEdit,
      inline: false,
      allowBase64: false,
    }),
    [canEdit, token],
  );
  const formattingRef = useRef(formatting);
  const editorReadyRef = useRef(false);
  formattingRef.current = formatting;
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const editor = useEditor({
    editable: canEdit,
    enableInputRules: [
      "blockquote",
      "bold",
      "bulletList",
      "code",
      "codeBlock",
      "heading",
      "horizontalRule",
      "italic",
      "strike",
    ],
    extensions: [
      StarterKit.configure({
        history: false,
        bulletList: { keepMarks: true, keepAttributes: true },
        orderedList: { keepMarks: true, keepAttributes: true },
      }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      ListItemFormatting,
      LineSpacing,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      imageExtension,
      Collaboration.configure({ document: yDoc, field: "default" }),
      CollaborationCursor.configure({ provider, user, render: renderCollaborativeCursor }),
      PageLayout,
    ],
    onCreate: ({ editor: currentEditor }) => {
      if (canEdit && currentEditor.isEmpty && document.content) {
        currentEditor.commands.setContent(initialContentAsHtml(document.content));
      }
      if (canEdit) {
        applyStoredTextFormatting(currentEditor, formattingRef.current);
        syncListItemFormatting(currentEditor);
      }
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      if (canEdit && currentEditor.state.selection.empty) {
        applyStoredTextFormatting(currentEditor, formattingRef.current);
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (canEdit && currentEditor.isEmpty) {
        applyStoredTextFormatting(currentEditor, formattingRef.current);
      }
      if (canEdit && editorReadyRef.current) onSaveState(currentEditor.getHTML());
    },
  }, [yDoc, awareness, canEdit, document.id, imageExtension]);

  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
    editorReadyRef.current = Boolean(editor);
    return () => {
      editorReadyRef.current = false;
    };
  }, [canEdit, editor]);

  async function uploadImage(file) {
    if (!editor) return;
    setIsUploadingImage(true);
    setImageError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_URL}/api/documents/${document.id}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || `Tải ảnh thất bại (${response.status})`);
      }
      editor.chain().focus().setImage({
        src: `${API_URL}${result.url}`,
        alt: result.filename,
        assetId: result.id,
      }).run();
    } catch (error) {
      setImageError(error.message);
    } finally {
      setIsUploadingImage(false);
    }
  }

  return (
    <>
      <FormattingToolbar
        editor={editor}
        canEdit={canEdit}
        formatting={formatting}
        onFormattingChange={onFormattingChange}
        onUploadImage={uploadImage}
        isUploadingImage={isUploadingImage}
      />
      {imageError && <p className="editor-error image-error" role="alert">{imageError}</p>}
      <div className={`paper ${canEdit ? "" : "paper-read-only"}`}>
        <EditorContent editor={editor} aria-label="Nội dung tài liệu" />
        {!canEdit && editor?.isEmpty && document.content && (
          <div className="legacy-read-only-content">
            {new DOMParser().parseFromString(document.content, "text/html").body.textContent}
          </div>
        )}
        <WordCount editor={editor} />
      </div>
    </>
  );
}
