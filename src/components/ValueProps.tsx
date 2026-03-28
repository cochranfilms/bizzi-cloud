import type { SVGProps } from "react";

const icons = {
  speed: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  files: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  ),
  everywhere: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  reliable: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

const valueProps = [
  {
    icon: "speed",
    title: "Speed you can feel",
    description:
      "Upload and download at the pace you create. No throttling, no waiting.",
  },
  {
    icon: "files",
    title: "Built for your files",
    description:
      "Video, photo, design. Organize projects the way you work.",
  },
  {
    icon: "everywhere",
    title: "Everywhere you go",
    description:
      "From studio to set to couch. Your work, on every device.",
  },
  {
    icon: "reliable",
    title: "Reliable, always",
    description:
      "Enterprise-grade infrastructure. Your creative work, safe and ready.",
  },
];

export default function ValueProps() {
  return (
    <section id="features" className="py-20 md:py-28 px-6 bg-neutral-50/50 dark:bg-neutral-950/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8">
          {valueProps.map((item) => {
            const Icon = icons[item.icon as keyof typeof icons];
            return (
              <div key={item.title} className="flex flex-col">
                <div className="w-10 h-10 mb-4 text-bizzi-blue">
                  {Icon && <Icon className="w-10 h-10" />}
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  {item.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
