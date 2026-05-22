import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { EmailLoginForm } from "@/components/EmailLoginForm";

export default async function LoginPage() {
  const me = await getCurrentUser();
  if (me) redirect("/feed");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-brand">띵동</h1>
        <p className="mt-2 text-sm text-zinc-500">같이 사서, 우리 동네 사람과 반띵해요.</p>
      </header>
      <EmailLoginForm />
    </main>
  );
}
