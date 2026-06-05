import LoginForm from "./admin/login/LoginForm";
import styles from "./admin/admin.module.css";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className={styles.loginShell}>
      <LoginForm />
    </main>
  );
}
