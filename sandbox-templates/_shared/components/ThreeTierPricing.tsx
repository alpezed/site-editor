export default function ThreeTierPricing() {
  const tiers = [
    { name: "Starter", price: "$0", features: ["1 project", "Community support"] },
    {
      name: "Pro",
      price: "$29",
      features: ["Unlimited projects", "Priority support", "Analytics"],
    },
    {
      name: "Team",
      price: "$99",
      features: ["Everything in Pro", "SSO", "Audit logs"],
    },
  ];
  return (
    <section
      data-element-id="ThreeTierPricing"
      className="bg-white px-6 py-[72px] text-slate-900"
    >
      <h2 className="mb-12 text-center text-3xl font-extrabold">Simple pricing</h2>
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.name} className="rounded-xl border border-slate-200 p-7">
            <h3 className="mb-1 text-lg font-bold">{t.name}</h3>
            <p className="mb-4 text-4xl font-extrabold">
              {t.price}
              <span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
            <ul className="mb-6 list-none space-y-1 p-0 text-slate-600">
              {t.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <a
              href="#"
              className="block rounded-lg bg-indigo-600 py-2.5 text-center font-semibold text-white no-underline"
            >
              Choose
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
