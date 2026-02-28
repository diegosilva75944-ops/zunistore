import Link from "next/link";
import { getContactSettings, getSocialLinks } from "@/lib/store";

export async function Footer() {
  const [contact, socials] = await Promise.all([getContactSettings(), getSocialLinks()]);

  return (
    <footer className="mt-10 border-t border-zinc-200/70 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-3">
        <div className="space-y-2">
          <div className="font-semibold text-lg">
            Zuni<span className="text-zuni-primary">Store</span>
          </div>
          <p className="text-sm text-zinc-600">
            Marketplace afiliado: ao clicar em Comprar você abre o produto original em nova aba.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Links rápidos</div>
          <ul className="text-sm text-zinc-700 space-y-1">
            <li>
              <Link href="/contato" className="hover:underline">
                Contato
              </Link>
            </li>
            <li>
              <Link href="/politica-de-privacidade" className="hover:underline">
                Política de Privacidade
              </Link>
            </li>
            <li>
              <Link href="/aviso-de-cookies" className="hover:underline">
                Aviso de Cookies
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Contato</div>
          <div className="text-sm text-zinc-700 space-y-1">
            {contact?.address ? <div>{contact.address}</div> : null}
            {contact?.city || contact?.state ? (
              <div>
                {[contact.city, contact.state].filter(Boolean).join(" - ")}
              </div>
            ) : null}
            {contact?.phone ? <div>Telefone: {contact.phone}</div> : null}
            {contact?.email ? <div>E-mail: {contact.email}</div> : null}
          </div>

          {socials.length ? (
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              {socials.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1 rounded-full border border-zinc-200 hover:bg-zuni-purple-light"
                  style={s.color ? { borderColor: s.color, color: s.color } : undefined}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-zinc-200/70">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-zinc-500">
          © {new Date().getFullYear()} ZuniStore. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}

