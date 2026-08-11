import { Download, DatabaseBackup, Smartphone, EyeOff } from 'lucide-react';
import { Container, SectionHeading } from '../ui';
import { Reveal, RevealStagger, RevealItem } from '../Reveal';

const ITEMS = [
  { icon: Download, title: 'Exporta cuando quieras', desc: 'Tu catálogo y tu información salen en CSV con un clic. Sin pedir permiso, sin trámite.' },
  { icon: DatabaseBackup, title: 'Copias de seguridad automáticas', desc: 'El sistema guarda respaldos de tus datos de forma periódica, sin que tengas que acordarte.' },
  { icon: Smartphone, title: 'Tu número sigue siendo tuyo', desc: 'Se vincula como un dispositivo más, igual que WhatsApp Web. Desvincularlo también es un clic.' },
  { icon: EyeOff, title: 'Tu historial solo si tú quieres', desc: 'Importar conversaciones anteriores es opcional y lo activas tú. Por defecto, WABOS empieza desde cero.' },
];

export function OwnershipBand() {
  return (
    <section className="py-20 lg:py-24">
      <Container>
        <Reveal>
          <SectionHeading
            center
            eyebrow="Sin ataduras"
            title="Tus datos son tuyos, y lo puedes comprobar"
            subtitle="Nada de quedarte atrapado porque tu información vive adentro. Si un día te vas, te llevas todo."
          />
        </Reveal>
        <RevealStagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <RevealItem key={it.title}>
                <div className="card h-full p-6">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-fg">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.desc}</p>
                </div>
              </RevealItem>
            );
          })}
        </RevealStagger>
      </Container>
    </section>
  );
}
