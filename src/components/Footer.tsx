import Link from "next/link";

const LINKS = [
  { href: "/legal/offer", label: "Оферта" },
  { href: "/legal/privacy", label: "Политика обработки данных" },
  { href: "/legal/rules", label: "Правила клуба" },
  { href: "/legal/refunds", label: "Возврат оплаты" },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-start sm:justify-between">
        <p>
          Клуб развития мышления «Изумруд», Санкт-Петербург
          <br />
          {/* TODO: реквизиты ИП или самозанятого — обязательны на странице оплаты */}
          ИП Фамилия Имя Отчество, ИНН 000000000000
        </p>
        <nav aria-label="Документы">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
