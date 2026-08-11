import { Link2, Bot, BadgeCheck, type LucideIcon } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal, RevealStagger, RevealItem } from '../Reveal';

const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Link2,
    title: 'Conecta',
    desc: 'Escaneas un QR desde WhatsApp → Dispositivos vinculados, igual que WhatsApp Web. Tu número queda enlazado en menos de un minuto y tus clientes no tienen que instalar nada.',
  },
  {
    icon: Bot,
    title: 'Enseña',
    desc: 'Cargas tu catálogo y tus preguntas frecuentes. La IA responde con esa información — y solo con esa, así no inventa precios ni promete lo que no tienes.',
  },
  {
    icon: BadgeCheck,
    title: 'Cobra y verifica',
    desc: 'Generas el cobro, el cliente manda su comprobante y WABOS lo contrasta con la notificación de tu banco antes de darlo por pagado.',
  },
];

export function HowItWorks() {
  return (
    <Container className="py-20 lg:py-28">
      <Reveal>
        <SectionHeading center eyebrow="Cómo funciona" title="Tres pasos, una sola tarde" />
      </Reveal>
      <RevealStagger className="mt-14 grid gap-6 md:grid-cols-3" stagger={0.08}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <RevealItem key={s.title}>
              <div className="card relative h-full p-6">
                <span className="tabular absolute right-5 top-5 text-sm font-semibold text-subtle">0{i + 1}</span>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white">
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            </RevealItem>
          );
        })}
      </RevealStagger>
    </Container>
  );
}
