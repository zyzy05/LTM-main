import { useState } from "react";
import { getErrorMessage, request } from "../api/client.js";

export default function AuthScreen({ onAuthenticated, sessionError = "" }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await request("/api/auth/register", null, {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
      }

      const form = new URLSearchParams({ username, password });
      const result = await request("/api/auth/login", null, {
        method: "POST",
        body: form,
      });
      onAuthenticated(result.access_token, username);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">idoc</div>
        <p className="eyebrow">KHÔNG GIAN GHI CHÉP</p>
        <h1>{mode === "login" ? "Chào mừng." : "Tạo tài khoản."}</h1>
        <p className="muted">
          {mode === "login" ? "Đăng nhập để mở tài liệu của bạn." : "Bắt đầu viết cùng idoc."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Tên đăng nhập
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            Mật khẩu
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {sessionError && <p className="form-error" role="status">{sessionError}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy} type="submit">
            {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </button>
        </form>
        <button
          className="text-button auth-switch"
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
          type="button"
        >
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </main>
  );
}
