"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {FiLogOut, FiMenu, FiX} from "react-icons/fi";

import styles from "./admin.module.css";

export default function AdminHeader({activeTab, onTabChange, tabs, user}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/auth/logout", {method: "POST"});
    router.replace("/admin");
    router.refresh();
  }

  function selectTab(tabId) {
    onTabChange(tabId);
    setOpen(false);
  }

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Link href="/admin" className={styles.brandMark}>
          AI
        </Link>
        <div className={styles.brandText}>
          <strong>Agent Admin</strong>
          <span>{user?.email}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.iconButton}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
      </button>

      <div className={`${styles.navPanel} ${open ? styles.navPanelOpen : ""}`}>
        <nav className={styles.navTabs} aria-label="Admin sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.navTab} ${
                activeTab === tab.id ? styles.navTabActive : ""
              }`}
              onClick={() => selectTab(tab.id)}
            >
              <tab.Icon aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </nav>

        <button type="button" className={styles.ghostButton} onClick={logout}>
          <FiLogOut aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
  );
}
