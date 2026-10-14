import Link from "next/link";
import { GemMark } from "./Gem";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2.5 text-ink no-underline">
      <GemMark size={30} />
      <span className="font-serif text-[1.3rem] font-semibold tracking-tight">Изумруд</span>
    </Link>
  );
}
