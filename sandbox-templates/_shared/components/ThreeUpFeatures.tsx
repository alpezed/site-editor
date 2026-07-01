export default function ThreeUpFeatures() {
  const items = [
    { t: "Fast", d: "Ships in milliseconds, not minutes." },
    { t: "Reliable", d: "Battle-tested and production ready." },
    { t: "Simple", d: "An API you can learn in an afternoon." },
  ];
  return (
    <section
      data-element-id="ThreeUpFeatures"
      className="bg-slate-50 px-6 py-[72px] text-slate-900"
    >
      <h2 className="mb-12 text-center text-3xl font-extrabold">
        Everything you need
      </h2>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.t}
            className="rounded-xl border border-slate-200 bg-white p-6"
          >
            <h3 className="mb-2 text-xl font-bold">{it.t}</h3>
            <p className="text-slate-600">{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
