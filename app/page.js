import {redirect} from "next/navigation";

import {getCurrentAdminUser, isSetupComplete} from "./lib/adminAuth";
import {ADMIN_HOME_PATH, ADMIN_SETUP_PATH} from "./lib/adminRoutes";
import LoginForm from "./admin/login/LoginForm";
import styles from "./admin/admin.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isSetupComplete())) {
    redirect(ADMIN_SETUP_PATH);
  }

  if (await getCurrentAdminUser()) {
    redirect(ADMIN_HOME_PATH);
  }

  return (
    <main className={styles.loginShell}>
      <LoginForm />
    </main>
  );
}
