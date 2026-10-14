import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход" };

const safeNext = (n: string | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/feed");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Logo />
      <div className="my-auto py-10">
        <h1 className="text-title">Вход в клуб</h1>
        <p className="mt-2 text-muted">Пришлём на почту код из 6 цифр. Если вы здесь впервые, аккаунт создастся сам.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
