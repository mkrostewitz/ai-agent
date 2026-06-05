import {redirect} from "next/navigation";

import {getCurrentAdminUser, isSetupComplete} from "@/app/lib/adminAuth";
import {adminSetupPath, getAdminNextParam} from "@/app/lib/adminRoutes";
import AdminDashboard from "./AdminDashboard";
import LoginForm from "./login/LoginForm";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage({searchParams}) {
  const next = getAdminNextParam(searchParams);

  if (!(await isSetupComplete())) {
    redirect(adminSetupPath(next));
  }

  const user = await getCurrentAdminUser();

  if (!user) {
    return (
      <main className={styles.loginShell}>
        <LoginForm />
      </main>
    );
  }

  return <AdminDashboard user={user} />;
}
