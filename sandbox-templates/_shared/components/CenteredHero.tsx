export default function CenteredHero() {
  return (
    <section
      data-element-id="CenteredHero"
      className="bg-white px-6 py-24 text-center text-slate-900"
    >
      <h1 className="mb-4 text-5xl font-extrabold leading-tight">
        Build something people love
      </h1>
      <p className="mx-auto mb-8 max-w-2xl text-xl text-slate-600">
        A clear, compelling subheadline that explains the value in one sentence.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <a
          href="#"
          className="rounded-lg bg-indigo-600 px-7 py-3 font-semibold text-white no-underline"
        >
          Get Started
        </a>
        <a
          href="#"
          className="rounded-lg border border-slate-300 px-7 py-3 font-semibold text-slate-900 no-underline"
        >
          Learn More
        </a>
      </div>
    </section>
  );
}
