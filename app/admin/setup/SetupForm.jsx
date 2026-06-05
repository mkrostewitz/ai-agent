"use client";

import {useRouter, useSearchParams} from "next/navigation";
import {useCallback, useEffect, useMemo, useState} from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDatabase,
  FiExternalLink,
  FiHelpCircle,
  FiKey,
  FiRefreshCw,
  FiUserPlus,
  FiX,
} from "react-icons/fi";

import {safeAdminNextPath} from "@/app/lib/adminRoutes";
import styles from "../admin.module.css";

const DATABASE_STATUS_POLL_MS = 5000;

const INITIAL_DATABASE_STATUS = {
  isChecking: true,
  label: "Checking database",
  message: "Checking MongoDB connection...",
  ok: false,
  state: "checking",
};

export default function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath = useMemo(
    () => safeAdminNextPath(nextParam),
    [nextParam]
  );
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    ipGeolocationApiKey: "",
    mapboxToken: "",
  });
  const [error, setError] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState(INITIAL_DATABASE_STATUS);
  const [isIpGeolocationHelpOpen, setIsIpGeolocationHelpOpen] = useState(false);
  const [isMapboxHelpOpen, setIsMapboxHelpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(key, value) {
    setForm((current) => ({...current, [key]: value}));
  }

  const refreshDatabaseStatus = useCallback(async () => {
    setDatabaseStatus((current) => ({
      ...current,
      isChecking: true,
      label: current.ok ? "Rechecking database" : "Checking database",
      message: current.ok
        ? "Rechecking MongoDB connection..."
        : current.message || "Checking MongoDB connection...",
      state: current.ok ? "connected" : "checking",
    }));

    try {
      const response = await fetch("/api/admin/setup/status", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      const database = data?.database || {};
      const nextStatus = database.ok
        ? {
            isChecking: false,
            label: "Database connected",
            message: database.message || "MongoDB connection is ready.",
            ok: true,
            state: "connected",
          }
        : {
            isChecking: false,
            label: "Database unavailable",
            message:
              database.message ||
              "Unable to verify the MongoDB connection. Check the server configuration.",
            ok: false,
            state: "error",
          };

      setDatabaseStatus(nextStatus);

      if (data?.setup?.complete) {
        router.replace(nextPath);
        router.refresh();
      }

      return nextStatus;
    } catch {
      const nextStatus = {
        isChecking: false,
        label: "Status check failed",
        message:
          "Unable to check MongoDB status from the browser. Refresh the page or check the web container logs.",
        ok: false,
        state: "error",
      };

      setDatabaseStatus(nextStatus);
      return nextStatus;
    }
  }, [nextPath, router]);

  useEffect(() => {
    refreshDatabaseStatus();
    const intervalId = window.setInterval(
      refreshDatabaseStatus,
      DATABASE_STATUS_POLL_MS
    );

    return () => window.clearInterval(intervalId);
  }, [refreshDatabaseStatus]);

  async function submitSetup(event) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!databaseStatus.ok) {
      const latestStatus = await refreshDatabaseStatus();
      if (!latestStatus.ok) {
        setError("Fix the MongoDB connection before completing setup.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const name = [form.firstName, form.lastName]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ");
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          name,
          email: form.email,
          password: form.password,
          ipGeolocationApiKey: form.ipGeolocationApiKey,
          mapboxToken: form.mapboxToken,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Unable to complete setup.");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (setupError) {
      setError(setupError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={`${styles.loginPanel} ${styles.setupPanel}`}>
      <div className={styles.titleBlock}>
        <span className={styles.kicker}>
          <FiUserPlus aria-hidden="true" /> First run
        </span>
        <h1>Set Up Agent Admin</h1>
      </div>

      <div className={styles.setupNote}>
        <FiKey aria-hidden="true" />
        <span>
          This creates the first admin user, stores the password as a hash, and
          generates the server-side session secret in MongoDB.
        </span>
      </div>

      <div
        className={`${styles.setupStatus} ${
          databaseStatus.state === "connected"
            ? styles.setupStatusConnected
            : databaseStatus.state === "checking"
            ? styles.setupStatusChecking
            : styles.setupStatusError
        }`}
        role={databaseStatus.state === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        <span className={styles.setupStatusIcon}>
          {databaseStatus.state === "connected" ? (
            <FiCheckCircle aria-hidden="true" />
          ) : databaseStatus.state === "checking" ? (
            <FiDatabase aria-hidden="true" />
          ) : (
            <FiAlertTriangle aria-hidden="true" />
          )}
        </span>
        <span className={styles.setupStatusText}>
          <strong>{databaseStatus.label}</strong>
          <span>{databaseStatus.message}</span>
        </span>
        <button
          type="button"
          className={styles.setupStatusButton}
          disabled={databaseStatus.isChecking}
          onClick={refreshDatabaseStatus}
        >
          <FiRefreshCw aria-hidden="true" />
          Check
        </button>
      </div>

      <form className={styles.form} onSubmit={submitSetup}>
        <div className={styles.setupGrid}>
          <label className={styles.field}>
            First name
            <input
              value={form.firstName}
              onChange={(event) =>
                updateField("firstName", event.target.value)
              }
              autoComplete="given-name"
            />
          </label>
          <label className={styles.field}>
            Last name
            <input
              value={form.lastName}
              onChange={(event) =>
                updateField("lastName", event.target.value)
              }
              autoComplete="family-name"
            />
          </label>
        </div>

        <div className={styles.setupWideRow}>
          <label className={styles.field}>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              autoComplete="username"
              required
            />
          </label>
        </div>

        <div className={styles.setupGrid}>
          <label className={styles.field}>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className={styles.field}>
            Confirm password
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
        </div>

        <div className={`${styles.field} ${styles.ipGeoField}`}>
          <div className={styles.fieldHeader}>
            <span>IPGeolocation.io API key</span>
            <div className={styles.helpAnchor}>
              <button
                type="button"
                className={styles.inlineHelpButton}
                aria-label="Show IPGeolocation.io setup help"
                aria-expanded={isIpGeolocationHelpOpen}
                onClick={() =>
                  setIsIpGeolocationHelpOpen((currentValue) => !currentValue)
                }
              >
                <FiHelpCircle aria-hidden="true" />
              </button>
              {isIpGeolocationHelpOpen ? (
                <div className={styles.helpPopover} role="dialog">
                  <div className={styles.helpPopoverHeader}>
                    <strong>IPGeolocation.io setup</strong>
                    <button
                      type="button"
                      className={styles.helpCloseButton}
                      aria-label="Close IPGeolocation.io setup help"
                      onClick={() => setIsIpGeolocationHelpOpen(false)}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>
                  <p>
                    Create an IPGeolocation.io account, copy an API key from
                    the dashboard, then paste it here. The key is used
                    server-side to store city, country, latitude, and longitude
                    for conversations.
                  </p>
                  <a
                    href="https://app.ipgeolocation.io/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open IPGeolocation.io dashboard{" "}
                    <FiExternalLink aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
          </div>
          <input
            value={form.ipGeolocationApiKey}
            onChange={(event) =>
              updateField("ipGeolocationApiKey", event.target.value)
            }
            autoComplete="off"
            placeholder="Optional API key"
          />
        </div>

        <div className={`${styles.field} ${styles.ipGeoField}`}>
          <div className={styles.fieldHeader}>
            <span>Mapbox public token</span>
            <div className={styles.helpAnchor}>
              <button
                type="button"
                className={styles.inlineHelpButton}
                aria-label="Show Mapbox token setup help"
                aria-expanded={isMapboxHelpOpen}
                onClick={() =>
                  setIsMapboxHelpOpen((currentValue) => !currentValue)
                }
              >
                <FiHelpCircle aria-hidden="true" />
              </button>
              {isMapboxHelpOpen ? (
                <div className={styles.helpPopover} role="dialog">
                  <div className={styles.helpPopoverHeader}>
                    <strong>Mapbox setup</strong>
                    <button
                      type="button"
                      className={styles.helpCloseButton}
                      aria-label="Close Mapbox token setup help"
                      onClick={() => setIsMapboxHelpOpen(false)}
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  </div>
                  <p>
                    Create a public Mapbox access token and paste it here. The
                    admin dashboard uses it in the browser to render the
                    conversation location map.
                  </p>
                  <a
                    href="https://account.mapbox.com/access-tokens/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Mapbox access tokens{" "}
                    <FiExternalLink aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
          </div>
          <input
            value={form.mapboxToken}
            onChange={(event) =>
              updateField("mapboxToken", event.target.value)
            }
            autoComplete="off"
            placeholder="Optional public token"
          />
        </div>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <button
          className={styles.primaryButton}
          disabled={isSubmitting || !databaseStatus.ok}
          title={
            databaseStatus.ok
              ? undefined
              : "MongoDB must be connected before setup can be completed."
          }
        >
          <FiCheckCircle aria-hidden="true" />
          {isSubmitting
            ? "Creating admin..."
            : databaseStatus.ok
            ? "Complete setup"
            : "Waiting for database"}
        </button>
      </form>
    </section>
  );
}
