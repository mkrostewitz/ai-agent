import {redirect} from "next/navigation";

import {getCurrentAdminUser, isSetupComplete} from "@/app/lib/adminAuth";
import {
  adminSetupPath,
  getAdminNextParam,
  safeAdminNextPath,
} from "@/app/lib/adminRoutes";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({searchParams}) {
  const next = getAdminNextParam(searchParams);

  if (!(await isSetupComplete())) {
    redirect(adminSetupPath(next));
  }

  const user = await getCurrentAdminUser();

  if (user) {
    redirect(safeAdminNextPath(next));
  }

  return (
    <main className={styles.loginShell}>
      <LoginForm />
    </main>
  );
}
