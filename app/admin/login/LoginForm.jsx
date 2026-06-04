"use client";

import {useRouter, useSearchParams} from "next/navigation";
import {useState} from "react";
import {FiLock, FiLogIn} from "react-icons/fi";

import styles from "../admin.module.css";

function safeNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin";
  return value;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, password}),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Unable to sign in.");
      }

      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.loginPanel}>
      <div className={styles.titleBlock}>
        <span className={styles.kicker}>
          <FiLock aria-hidden="true" /> Admin
        </span>
        <h1>Agent sign in</h1>
      </div>

      <form className={styles.form} onSubmit={submitLogin}>
        <label className={styles.field}>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <button className={styles.primaryButton} disabled={isSubmitting}>
          <FiLogIn aria-hidden="true" />
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
