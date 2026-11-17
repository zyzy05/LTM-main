export function documentDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function documentPreview(content) {
  if (!content) return "";
  return new DOMParser().parseFromString(content, "text/html").body.textContent || "";
}
