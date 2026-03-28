import type { ContactSettings } from "@/lib/store";

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("55") && digits.length >= 12) return `tel:+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `tel:+55${digits}`;
  return `tel:+${digits}`;
}

type Props = {
  contact: ContactSettings | null;
  className?: string;
};

/**
 * Mesmo conteúdo da página /contato (admin → Contato) para rodapé e demais usos.
 */
export function ContactBlock({ contact, className = "" }: Props) {
  const cityLine = [contact?.city, contact?.state].filter(Boolean).join(" - ") || "—";
  const tel = contact?.phone?.trim();
  const mail = contact?.email?.trim();

  return (
    <div className={`space-y-2 text-sm ${className}`}>
      <div>
        <span className="font-semibold">Endereço:</span>{" "}
        <span className="text-zinc-700">{contact?.address?.trim() || "—"}</span>
      </div>
      <div>
        <span className="font-semibold">Cidade/UF:</span>{" "}
        <span className="text-zinc-700">{cityLine}</span>
      </div>
      <div>
        <span className="font-semibold">Telefone:</span>{" "}
        {tel ? (
          <a href={telHref(tel) ?? "#"} className="text-zuni-primary hover:underline">
            {contact?.phone}
          </a>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>
      <div>
        <span className="font-semibold">E-mail:</span>{" "}
        {mail ? (
          <a href={`mailto:${mail}`} className="text-zuni-primary hover:underline break-all">
            {mail}
          </a>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>
    </div>
  );
}
