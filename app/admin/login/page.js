import {redirect} from "next/navigation";

import {getCurrentAdminUser} from "@/app/lib/adminAuth";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const user = await getCurrentAdminUser();

  if (user) {
    redirect("/admin");
  }

  return (
    <main className={styles.loginShell}>
      <LoginForm />
    </main>
  );
}
