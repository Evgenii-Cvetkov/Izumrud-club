import Link from "next/link";
import { Logo } from "./Logo";

export function PublicHeader({ signedIn, isMember }: { signedIn: boolean; isMember: boolean }) {
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
      <Logo />
      <nav aria-label="Аккаунт" className="flex items-center gap-4">
        {isMember ? (
          <Link href="/feed" className="btn btn-primary">
            Открыть клуб
          </Link>
        ) : signedIn ? (
          <Link href="/join" className="btn btn-primary">
            Вступить
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn-quiet inline-flex items-center">
              Войти
            </Link>
            <Link href="/join" className="btn btn-primary hidden sm:inline-flex">
              Вступить
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
