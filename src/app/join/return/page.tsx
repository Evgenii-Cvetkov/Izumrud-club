import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { PaymentStatus } from "./PaymentStatus";

export const metadata: Metadata = { title: "Проверяем оплату" };

export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  await requireUser("/join");
  const { payment } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <Logo />
      <div className="py-12">
        <PaymentStatus paymentId={payment ?? null} />
      </div>
    </main>
  );
}
