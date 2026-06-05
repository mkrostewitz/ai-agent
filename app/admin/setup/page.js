import {redirect} from "next/navigation";

import {isSetupComplete} from "@/app/lib/adminAuth";
import {adminHomePath, getAdminNextParam} from "@/app/lib/adminRoutes";
import styles from "../admin.module.css";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage({searchParams}) {
  const next = getAdminNextParam(searchParams);

  if (await isSetupComplete()) {
    redirect(adminHomePath(next));
  }

  return (
    <main className={styles.loginShell}>
      <SetupForm />
    </main>
  );
}
