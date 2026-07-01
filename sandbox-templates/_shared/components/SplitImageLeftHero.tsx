export default function SplitImageLeftHero() {
  return (
    <section
      data-element-id="SplitImageLeftHero"
      className="flex flex-wrap items-center gap-8 bg-slate-900 px-6 py-16 text-white"
    >
      <div className="min-w-[280px] flex-1">
        <h1 className="mb-3 text-4xl font-extrabold leading-tight">
          Welcome to Our Business
        </h1>
        <p className="mb-6 text-lg opacity-80">
          We deliver exceptional service tailored to you.
        </p>
        <a
          href="#"
          className="inline-block rounded-lg bg-white px-6 py-3 font-semibold text-slate-900 no-underline"
        >
          Get Started
        </a>
      </div>
      <div className="h-72 min-w-[280px] flex-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500" />
    </section>
  );
}
