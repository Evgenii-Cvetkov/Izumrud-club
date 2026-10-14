import { AppNav } from "@/components/AppNav";

/** Закрытая часть: навигация сверху на десктопе, вкладки снизу на телефоне. */
export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 pb-44 pt-6 md:pb-28 md:pt-10">{children}</main>
    </>
  );
}
