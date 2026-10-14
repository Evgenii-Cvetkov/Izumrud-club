import Link from "next/link";
import { GemMark } from "@/components/Gem";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <GemMark size={44} />
      <h1 className="mt-6 text-title">Такой страницы нет</h1>
      <p className="mt-2 text-muted">Возможно, материал сняли с публикации или в ссылке опечатка.</p>
      <div className="mt-8 flex gap-4">
        <Link href="/feed" className="btn btn-primary">На главную клуба</Link>
        <Link href="/" className="btn btn-secondary">О клубе</Link>
      </div>
    </main>
  );
}
