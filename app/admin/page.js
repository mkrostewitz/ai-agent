import {getCurrentAdminUser, isSetupComplete} from "@/app/lib/adminAuth";
import AdminDashboard from "./AdminDashboard";
import LoginForm from "./login/LoginForm";
import SetupForm from "./setup/SetupForm";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isSetupComplete())) {
    return (
      <main className={styles.loginShell}>
        <SetupForm />
      </main>
    );
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
