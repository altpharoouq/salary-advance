"use client";
export default function Logout() {
  return (
    <button className="secondary small" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>
      Sign out
    </button>
  );
}
