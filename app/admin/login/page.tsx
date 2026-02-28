import { AdminLoginClient } from "@/app/admin/login/admin-login-client";

export default async function AdminLoginPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const next = typeof sp.next === "string" ? sp.next : "/admin/produtos";
  return <AdminLoginClient nextPath={next} />;
}

