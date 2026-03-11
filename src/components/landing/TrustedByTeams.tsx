"use client";

const testimonials = [
  {
    quote:
      "Finally, one place for all our creative assets! What used to take us minutes — sometimes even hours — now takes seconds. Our designers and content creators can access everything instantly without digging through old drives, outdated folders, or scattered tools.",
    name: "Emma Lewis",
    title: "Brand Manager",
    avatar: null,
  },
  {
    quote:
      "This platform simplified our entire creative workflow. Designers and creatives finally work from the same source of truth. Cloud storage that actually gets how we work.",
    name: "Ryan Mitchell",
    title: "Creative Director",
    avatar: null,
  },
  {
    quote:
      "Sharing files with partners has never been this smooth. We went from emailing huge links to sending one branded link. Game changer for client delivery.",
    name: "Liam Parker",
    title: "Head of Marketing",
    avatar: null,
  },
  {
    quote:
      "Our workflow is way more efficient now. What used to take hours literally takes minutes. From set to edit to delivery—everything lives in one place.",
    name: "Noah Williams",
    title: "Product Manager",
    avatar: null,
  },
  {
    quote:
      "Managing creative assets used to be messy and time-consuming. Now everything is organized, searchable, and easy to share across teams.",
    name: "Tom Collins",
    title: "Brand Manager",
    avatar: null,
  },
  {
    quote:
      "Clean design, powerful features, zero friction. Exactly what we needed for our post-production pipeline.",
    name: "Jacob Ryan",
    title: "Creative Director",
    avatar: null,
  },
];

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-bizzi-blue/20 flex items-center justify-center text-bizzi-blue font-semibold text-sm">
      {initials}
    </div>
  );
}

export default function TrustedByTeams() {
  return (
    <section className="py-20 md:py-28 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-4">
            Trusted by creative teams
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            See how teams use our platform to stay organized, consistent, and
            always on-brand.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl bg-white p-6 shadow-lg border border-neutral-100 flex flex-col"
            >
              <p className="text-neutral-700 leading-relaxed flex-grow mb-6">
                {t.quote}
              </p>
              <div className="flex items-center gap-4">
                <Avatar name={t.name} />
                <div>
                  <p className="font-semibold text-bizzi-navy">{t.name}</p>
                  <p className="text-sm text-neutral-500">{t.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
